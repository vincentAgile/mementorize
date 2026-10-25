import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Card, Item, ItemType } from '@prisma/client';
import { ITEM_TYPES } from '../items/item-content.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { IN_REVIEW, REVIEWED_CARD } from './in-review.js';
import { userRetentions } from '../scheduling/retention.js';
import { type Grade, type NextDueByRating, SchedulerService } from '../scheduling/scheduler.service.js';

export interface DueItem {
  item: Item;
  card: Card; // card.kind tells which side of the item to ask about
  nextDue: NextDueByRating; // shown on the self-assessment buttons
}

/** How many cards are due, in all and per type of item (the menu's counters, MEM-5). */
export interface DueSummary {
  total: number;
  byType: Record<ItemType, number>;
}

export interface DueReviews {
  total: number;
  items: DueItem[];
  nextDueAt: Date | null; // earliest upcoming review, for "nothing to review until…"
}

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: SchedulerService,
  ) {}

  /** Number of due cards of this user, per type of item and in all. */
  async countDue(userId: string, now = new Date()): Promise<DueSummary> {
    const types = Object.values(ITEM_TYPES);
    const counts = await Promise.all(
      types.map((type) =>
        this.prisma.card.count({
          where: { due: { lte: now }, ...REVIEWED_CARD, item: { userId, type, ...IN_REVIEW } },
        }),
      ),
    );
    const byType = Object.fromEntries(types.map((type, i) => [type, counts[i]])) as Record<ItemType, number>;
    return { total: counts.reduce((sum, count) => sum + count, 0), byType };
  }

  /**
   * Cards of this user whose due date has passed, oldest first. With `type`,
   * only the cards of that type of item (a subject space, MEM-3).
   */
  async findDue(userId: string, limit = 20, type?: ItemType, now = new Date()): Promise<DueReviews> {
    const item = { userId, ...(type && { type }), ...IN_REVIEW };
    const where = { due: { lte: now }, ...REVIEWED_CARD, item };
    const [total, cards, upcoming, retentions] = await Promise.all([
      this.prisma.card.count({ where }),
      this.prisma.card.findMany({ where, include: { item: true }, orderBy: { due: 'asc' }, take: limit }),
      this.prisma.card.findFirst({
        where: { due: { gt: now }, ...REVIEWED_CARD, item },
        orderBy: { due: 'asc' },
        select: { due: true },
      }),
      userRetentions(this.prisma, userId), // MEM-75: the delays of each card, with the retention of its space
    ]);

    return {
      total,
      nextDueAt: upcoming?.due ?? null,
      items: cards.map(({ item, ...card }) => ({
        item,
        card,
        nextDue: this.scheduler.preview(card, now, retentions[item.type]),
      })),
    };
  }

  /**
   * Records a self-assessment and reschedules the card. Returned with its
   * new previews: a card rated « À revoir » comes back at the end of the
   * session (MEM-47), with these delays on its buttons. Scheduled with the
   * target retention of the card's space (MEM-75).
   */
  async review(
    userId: string,
    cardId: string,
    rating: Grade,
    now = new Date(),
  ): Promise<Card & { nextDueByRating: NextDueByRating }> {
    const found = await this.prisma.card.findFirst({
      where: { id: cardId, item: { userId } },
      include: { item: { select: { type: true } } },
    });
    if (!found) {
      throw new NotFoundException(`Card ${cardId} not found`);
    }
    const { item, ...card } = found;
    const retention = (await userRetentions(this.prisma, userId))[item.type];

    const { card: next, log } = this.scheduler.review(card, rating, now, retention);

    // Both writes succeed or neither does: no log without its card update.
    const [updated] = await this.prisma.$transaction([
      this.prisma.card.update({ where: { id: card.id }, data: next }),
      this.prisma.reviewLog.create({ data: { ...log, cardId: card.id } }),
    ]);
    return { ...updated, nextDueByRating: this.scheduler.preview(updated, now, retention) };
  }

  /**
   * « Appris » for a mind map branch (MEM-48): the card leaves the review and
   * the counters. A `Learned` entry in its history, with its schedule as it
   * stands: nothing is rescheduled, so that putting it back finds the same
   * schedule. Vocabulary (MEM-22) and quotes (MEM-67) are learned per item:
   * POST /learning/:itemId/learned.
   */
  async markLearned(userId: string, cardId: string, now = new Date()): Promise<Card> {
    const card = await this.learnableCard(userId, cardId);
    if (card.learnedAt) {
      throw new ConflictException(`Card ${cardId} is already learned`);
    }
    const [updated] = await this.prisma.$transaction([
      this.prisma.card.update({ where: { id: card.id }, data: { learnedAt: now } }),
      this.prisma.reviewLog.create({
        data: {
          cardId: card.id,
          rating: 'Learned',
          state: card.state,
          due: card.due,
          stability: card.stability,
          difficulty: card.difficulty,
          scheduledDays: card.scheduledDays,
          learningSteps: card.learningSteps,
          reviewedAt: now,
        },
      }),
    ]);
    return updated;
  }

  /** « Remettre en révision » (MEM-48): back in the review, with the schedule it had. */
  async relearn(userId: string, cardId: string): Promise<Card> {
    const card = await this.learnableCard(userId, cardId);
    if (!card.learnedAt) {
      throw new ConflictException(`Card ${cardId} is not learned`);
    }
    return this.prisma.card.update({ where: { id: card.id }, data: { learnedAt: null } });
  }

  /** The user's card of a mind map: 404, or 409 for vocabulary and quotes (learned per item). */
  private async learnableCard(userId: string, cardId: string) {
    const card = await this.prisma.card.findFirst({ where: { id: cardId, item: { userId } }, include: { item: true } });
    if (!card) {
      throw new NotFoundException(`Card ${cardId} not found`);
    }
    if (card.item.type !== 'MindMap') {
      throw new ConflictException(`Card ${cardId} is ${card.item.type}: learned per item`);
    }
    return card;
  }
}
