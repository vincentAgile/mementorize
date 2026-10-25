import { ConflictException, Injectable, Logger } from '@nestjs/common';
import type { ItemType, OptimizationStatus } from '@prisma/client';
import { ITEM_TYPES } from '../items/item-content.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type TrainingReview, trainingItems } from './training-items.js';

/** Below this many reviews in a space, the default weights stay (MEM-76): too little to learn from. */
export const MIN_REVIEWS = 1000;

/** FSRS-6 has 21 weights, as ts-fsrs 5 expects. */
const WEIGHT_COUNT = 21;

/** An optimization takes about a second; past this, it is given up. */
const TIMEOUT_MS = 5 * 60 * 1000;

/** A run still "Running" after this was cut short (the API restarted): it counts as failed. */
const STALE_MS = 15 * 60 * 1000;

const FAILED = 'L’optimisation a échoué : les poids précédents restent en place.';

/** Where a space stands (MEM-76), for the settings. */
export interface SpaceOptimization {
  type: ItemType;
  /** The graded reviews of the space: its training data. */
  reviewCount: number;
  minReviews: number;
  /** Weights optimized on the user's history are in use; otherwise the default ones. */
  custom: boolean;
  optimizedAt: Date | null;
  /** The last optimization: running, done or failed; null if none. */
  status: OptimizationStatus | null;
  finishedAt: Date | null;
  error: string | null;
}

/**
 * The optimization of the FSRS weights on the user's review history, per
 * space (MEM-76), with the official optimizer (fsrs-rs, through
 * @open-spaced-repetition/binding). It runs in the background: started, it
 * answers at once; its state is in fsrs_parameters. On failure, the weights
 * in use stay. The scheduling of the space then uses the new weights, from
 * the next review of each card (spaceScheduling).
 */
@Injectable()
export class OptimizationService {
  private readonly logger = new Logger(OptimizationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Where each space stands. */
  async status(userId: string, now = new Date()): Promise<SpaceOptimization[]> {
    const rows = await this.prisma.fsrsParameters.findMany({ where: { userId } });
    return Promise.all(
      Object.values(ITEM_TYPES).map(async (type) => {
        const row = rows.find((one) => one.type === type);
        const stale = row?.status === 'Running' && this.isStale(row.startedAt, now);
        return {
          type,
          reviewCount: await this.reviewCount(userId, type),
          minReviews: MIN_REVIEWS,
          custom: (row?.weights.length ?? 0) > 0,
          optimizedAt: row?.optimizedAt ?? null,
          status: stale ? 'Failed' : (row?.status ?? null),
          finishedAt: row?.finishedAt ?? null,
          error: stale ? FAILED : (row?.error ?? null),
        };
      }),
    );
  }

  /**
   * Starts the optimization of a space, in the background. 409 when the
   * space has too few reviews, or an optimization of it is running.
   * Returns where the space stands (running), and the run, for the tests.
   */
  async start(userId: string, type: ItemType, now = new Date()): Promise<{ run: Promise<void> }> {
    const reviewCount = await this.reviewCount(userId, type);
    if (reviewCount < MIN_REVIEWS) {
      throw new ConflictException(`Not enough reviews to optimize: ${reviewCount} of ${MIN_REVIEWS}`);
    }
    // Atomically: only one run per space, unless the one marked running is stale.
    const staleBefore = new Date(now.getTime() - STALE_MS);
    await this.prisma.fsrsParameters.upsert({
      where: { userId_type: { userId, type } },
      create: { userId, type },
      update: {},
    });
    const { count } = await this.prisma.fsrsParameters.updateMany({
      where: {
        userId,
        type,
        OR: [{ status: null }, { status: { not: 'Running' } }, { startedAt: { lt: staleBefore } }],
      },
      data: { status: 'Running', startedAt: now, finishedAt: null, error: null },
    });
    if (count === 0) throw new ConflictException('An optimization of this space is running');
    return { run: this.run(userId, type) };
  }

  /** Back to the default weights (MEM-76). 409 while an optimization of the space is running. */
  async reset(userId: string, type: ItemType, now = new Date()): Promise<void> {
    const row = await this.prisma.fsrsParameters.findUnique({ where: { userId_type: { userId, type } } });
    if (row?.status === 'Running' && !this.isStale(row.startedAt, now)) {
      throw new ConflictException('An optimization of this space is running');
    }
    await this.prisma.fsrsParameters.deleteMany({ where: { userId, type } });
  }

  /** The optimization itself: never throws; a failure is recorded, the weights in use stay. */
  private async run(userId: string, type: ItemType): Promise<void> {
    try {
      const [logs, user] = await Promise.all([
        this.prisma.reviewLog.findMany({
          where: { rating: { not: 'Learned' }, card: { item: { userId, type } } },
          select: { cardId: true, rating: true, reviewedAt: true },
        }),
        this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { reminderTimeZone: true } }),
      ]);
      const weights = await withTimeout(optimize(trainingItems(logs, user.reminderTimeZone)), TIMEOUT_MS);
      if (weights.length !== WEIGHT_COUNT || !weights.every(Number.isFinite)) {
        throw new Error(`Unexpected weights: ${weights.length}`);
      }
      await this.prisma.fsrsParameters.update({
        where: { userId_type: { userId, type } },
        data: {
          weights,
          optimizedAt: new Date(),
          reviewCount: logs.length,
          status: 'Succeeded',
          finishedAt: new Date(),
          error: null,
        },
      });
    } catch (error) {
      this.logger.error(`Optimization of ${type} for user ${userId} failed: ${String(error)}`);
      await this.prisma.fsrsParameters
        .update({
          where: { userId_type: { userId, type } },
          data: { status: 'Failed', finishedAt: new Date(), error: FAILED },
        })
        .catch(() => undefined); // the user (or the row) was deleted meanwhile
    }
  }

  /** The graded reviews of a space: « Appris » is not a grade (MEM-22, MEM-48). */
  private reviewCount(userId: string, type: ItemType): Promise<number> {
    return this.prisma.reviewLog.count({ where: { rating: { not: 'Learned' }, card: { item: { userId, type } } } });
  }

  private isStale(startedAt: Date | null, now: Date): boolean {
    return !startedAt || now.getTime() - startedAt.getTime() > STALE_MS;
  }
}

/**
 * The official FSRS optimizer. Loaded only here, when a user optimizes: the
 * API starts and schedules even if its native module can't load.
 */
async function optimize(items: TrainingReview[][]): Promise<number[]> {
  const { computeParameters, FSRSBindingItem, FSRSBindingReview } = await import('@open-spaced-repetition/binding');
  const trainSet = items.map(
    (reviews) => new FSRSBindingItem(reviews.map((review) => new FSRSBindingReview(review.rating, review.deltaT))),
  );
  return computeParameters(trainSet, { enableShortTerm: true });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
