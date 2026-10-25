import type { Card, CardState, ReviewRating } from '@prisma/client';
import {
  type AbstractScheduler,
  type Card as FsrsCard,
  type FSRS,
  type FSRSParameters,
  type Grade as FsrsGrade,
  createEmptyCard,
  fsrs,
  Rating,
  State,
  StrategyMode,
} from 'ts-fsrs';

/** The scheduling columns of a card, as stored in the database. */
export type CardSchedule = Pick<
  Card,
  'due' | 'stability' | 'difficulty' | 'scheduledDays' | 'learningSteps' | 'reps' | 'lapses' | 'state' | 'lastReview'
>;

/** The four self-assessments FSRS knows; `Learned` is not one of them (MEM-22). */
export type Grade = Exclude<ReviewRating, 'Learned'>;

/** What gets written to review_logs after a self-assessment. */
export interface ReviewLogData {
  rating: ReviewRating;
  state: CardState;
  due: Date;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  learningSteps: number;
  reviewedAt: Date;
}

/** When the card would next be due, for each possible answer. */
export type NextDueByRating = Record<Grade, Date>;

const RATINGS: readonly Grade[] = ['Again', 'Hard', 'Good', 'Easy'];

/**
 * The target retention of a space (MEM-75), in percent: the probability of
 * remembering a card at which it comes back. 90 by default, 85 for fewer
 * reviews, 95 for a sturdier memory.
 */
export const RETENTIONS = [85, 90, 95] as const;
export type Retention = (typeof RETENTIONS)[number];
export const DEFAULT_RETENTION: Retention = 90;

/**
 * How the cards of a space are scheduled: its target retention (MEM-75)
 * and, once optimized on the user's history, its FSRS weights (MEM-76).
 */
export interface SchedulingOptions {
  retention?: Retention;
  /** The 21 weights of FSRS-6; none (or empty): the default weights. */
  weights?: readonly number[] | null;
}

/**
 * How Mementorize schedules (MEM-74), in one place; the target retention
 * and the weights depend on the space (above).
 * - No card further than a year: each is seen at least once a year.
 * - Fuzz: a little randomness on intervals of a few days or more, so that
 *   the cards learned the same day don't all come back the same day.
 * - A single short step of 10 minutes, for a new card as for a forgotten
 *   one: « À revoir » already puts the card back at the bottom of the
 *   current pile (MEM-47), a step of 1 minute was of no use.
 * They apply from the next review of each card: the dates already
 * scheduled are not recomputed.
 */
export const SCHEDULER_PARAMS = {
  maximum_interval: 365,
  enable_fuzz: true,
  enable_short_term: true,
  learning_steps: ['10m'],
  relearning_steps: ['10m'],
} as const satisfies Partial<FSRSParameters>;

/**
 * The seed of the fuzz of a review: the card as it is before it, not the
 * time of the review (ts-fsrs's default). So the delay shown on a button
 * (MEM-49) is the one the card gets, whenever the button is pressed; two
 * cards reviewed at different moments still get different draws.
 */
function seedOfCard(this: AbstractScheduler): string {
  // `last`: the card before the review (protected in ts-fsrs, which already moved `current` to now).
  const { last_review, reps, difficulty, stability } = Reflect.get(this, 'last') as FsrsCard;
  return `${last_review?.getTime() ?? 0}_${reps}_${difficulty * stability}`;
}

/**
 * Thin wrapper around ts-fsrs. It's the only place in the app that knows
 * about the library: the rest of the code manipulates database rows, and
 * this class translates them to and from ts-fsrs's own types.
 *
 * Every method takes `now` as a parameter instead of reading the clock
 * itself: that's what makes the scheduling logic testable. How the
 * card's space is scheduled is a parameter too: its target retention
 * (MEM-75) and its optimized weights (MEM-76). One FSRS instance per
 * combination, made once.
 */
export class SchedulerService {
  private readonly instances = new Map<string, FSRS>();

  private readonly params: Partial<FSRSParameters>;

  /** `overrides`: for the tests (e.g. without fuzz), on top of SCHEDULER_PARAMS. */
  constructor(overrides: Partial<FSRSParameters> = {}) {
    this.params = { ...SCHEDULER_PARAMS, ...overrides };
  }

  private fsrs({ retention = DEFAULT_RETENTION, weights }: SchedulingOptions): FSRS {
    const custom = weights && weights.length > 0 ? weights : undefined;
    const key = `${retention}|${custom?.join(',') ?? ''}`;
    let instance = this.instances.get(key);
    if (!instance) {
      instance = fsrs({
        ...this.params,
        learning_steps: [...(this.params.learning_steps ?? [])],
        relearning_steps: [...(this.params.relearning_steps ?? [])],
        request_retention: retention / 100,
        ...(custom && { w: [...custom] }),
      }).useStrategy(StrategyMode.SEED, seedOfCard);
      this.instances.set(key, instance);
    }
    return instance;
  }

  /** Scheduling state of a card that has never been reviewed (due now). */
  newCard(now: Date): CardSchedule {
    return fromFsrsCard(createEmptyCard(now));
  }

  /** Next due date for each of the 4 possible answers, without saving anything. */
  preview(card: CardSchedule, now: Date, options: SchedulingOptions = {}): NextDueByRating {
    const outcomes = this.fsrs(options).repeat(toFsrsCard(card), now);
    return Object.fromEntries(
      RATINGS.map((rating) => [
        rating,
        rating === 'Again' ? now : withinMaximum(outcomes[Rating[rating] as FsrsGrade].card, now).due,
      ]),
    ) as NextDueByRating;
  }

  /**
   * Applies a self-assessment: returns the new card state and the log entry.
   * « À revoir » (Again) makes the card due at once, instead of FSRS's short
   * step (10 minutes, MEM-74): leaving a session and coming back finds it
   * still to review (MEM-47). The rest of FSRS's state (stability, difficulty,
   * lapses, step) is kept.
   */
  review(
    card: CardSchedule,
    rating: Grade,
    now: Date,
    options: SchedulingOptions = {},
  ): { card: CardSchedule; log: ReviewLogData } {
    const { card: next, log } = this.fsrs(options).next(toFsrsCard(card), now, Rating[rating] as FsrsGrade);
    return {
      card: { ...fromFsrsCard(withinMaximum(next, now)), ...(rating === 'Again' && { due: now }) },
      log: {
        rating,
        state: State[log.state] as CardState,
        due: log.due,
        stability: log.stability,
        difficulty: log.difficulty,
        scheduledDays: log.scheduled_days,
        learningSteps: log.learning_steps,
        reviewedAt: log.review,
      },
    };
  }
}

/**
 * No card further than the maximum interval (MEM-74). ts-fsrs caps each
 * interval, then keeps « Difficile » < « Correct » < « Facile » one day
 * apart, which can go past it: a card known for years got 367 days.
 */
function withinMaximum(card: FsrsCard, now: Date): FsrsCard {
  const maximum = SCHEDULER_PARAMS.maximum_interval;
  if (card.scheduled_days <= maximum) return card;
  return { ...card, scheduled_days: maximum, due: new Date(now.getTime() + maximum * 86_400_000) };
}

// --- Mapping between our database columns and ts-fsrs's Card --------------

function toFsrsCard(card: CardSchedule): FsrsCard {
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: 0, // deprecated in ts-fsrs 5 (recomputed from last_review), not stored
    scheduled_days: card.scheduledDays,
    learning_steps: card.learningSteps,
    reps: card.reps,
    lapses: card.lapses,
    state: State[card.state],
    last_review: card.lastReview ?? undefined,
  };
}

function fromFsrsCard(card: FsrsCard): CardSchedule {
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: State[card.state] as CardState,
    lastReview: card.last_review ?? null,
  };
}
