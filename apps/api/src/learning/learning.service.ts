import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Card, CardKind, ItemType, LearningStatus } from '@prisma/client';
import { contentOf } from '../items/item-content.js';
import { IN_QUEUE, QUEUE_ORDER, type QueueType, queueIds, renumberQueue } from './learning-queue.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { spaceScheduling } from '../scheduling/space-scheduling.js';
import {
  type Grade,
  type NextDueByRating,
  type SchedulingOptions,
  SchedulerService,
} from '../scheduling/scheduler.service.js';

/** The types learned per item (MEM-22, MEM-67): the item leaves the review, not a card. */
const LEARNED_PER_ITEM: ItemType[] = ['Vocabulary', 'Quote'];

/** Number of items in a learning session (MEM-21, MEM-68): those offered by the preparation page (MEM-94). */
export const SESSION_SIZE = 5;

/** MEM-94: at most this many items in a session prepared by the user. */
export const MAX_SESSION_SIZE = 10;

export interface LearningItem {
  id: string;
  /** Its French → English card: reviewed directly when it comes back in the session (MEM-47). */
  cardId: string;
  word: string;
  translation: string;
  example: string | null;
  frenchExample: string | null; // MEM-42
  /** When the French → English card comes back, for each of the four ratings of step 2. */
  nextDue: NextDueByRating;
  /**
   * The same, once rated « À revoir » (any number of times): the answers of
   * an item are only sent once it is through the evaluation (MEM-104), so
   * that leaving the session keeps it "À apprendre"; the buttons of an item
   * put back at the bottom of the pile show these.
   */
  nextDueAfterAgain: NextDueByRating;
}

export interface LearningSession {
  /** All the vocabulary items still to learn, not only those of this session. */
  total: number;
  items: LearningItem[];
}

/** A quote of a learning session (MEM-68): learned in a single step, as it is reviewed. */
export interface QuoteLearningItem {
  id: string;
  /** Its card: rated at once, and reviewed directly when it comes back in the session (MEM-47). */
  cardId: string;
  text: string;
  author: string | null;
  source: string | null;
  hint: string; // MEM-106: the recall hint, the question of the card (MEM-108)
  /** When the card comes back, for each of the four ratings. */
  nextDue: NextDueByRating;
  /** The same, once rated « À revoir » (the answers are only sent at the end of the session). */
  nextDueAfterAgain: NextDueByRating;
}

export interface QuoteLearningSession {
  /** All the quotes still to learn. */
  total: number;
  items: QuoteLearningItem[];
}

/** The card whose rating is the first review of a learned item (MEM-21, MEM-68). */
const FIRST_CARD = { Vocabulary: 'FrenchToEnglish', Quote: 'QuoteRecall' } as const satisfies Record<
  QueueType,
  CardKind
>;

/**
 * The learning process of the vocabulary (MEM-21) and of the quotes
 * (MEM-68), as opposed to the review process: it moves new items from
 * `ToLearn` to `Learning`. A session shows up to five items, the first ones
 * of the learning queue of their type (MEM-61, MEM-67), and their first
 * rating is the first review of their card (French → English for the
 * vocabulary).
 */
@Injectable()
export class LearningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: SchedulerService,
  ) {}

  /**
   * `ids` (MEM-94): the items chosen on the preparation page, in this order;
   * those that are not (or no longer) in the queue are left out.
   */
  async session(userId: string, now = new Date(), ids?: string[]): Promise<LearningSession> {
    const [[total, items], scheduling] = await Promise.all([
      this.sessionItems(userId, 'Vocabulary', ids),
      spaceScheduling(this.prisma, userId), // MEM-75
    ]);
    return {
      total,
      items: items.map((item) => {
        const { word, translation, example, frenchExample } = contentOf({ ...item, type: 'Vocabulary' as const });
        return {
          id: item.id,
          word,
          translation,
          example,
          frenchExample: frenchExample ?? null,
          ...this.previews(item.cards[0], now, scheduling.Vocabulary),
        };
      }),
    };
  }

  /** MEM-68: up to five quotes to learn, the first ones of their learning queue. */
  async quoteSession(userId: string, now = new Date(), ids?: string[]): Promise<QuoteLearningSession> {
    const [[total, items], scheduling] = await Promise.all([
      this.sessionItems(userId, 'Quote', ids),
      spaceScheduling(this.prisma, userId), // MEM-75
    ]);
    return {
      total,
      items: items.map((item) => {
        const { text, author, source, hint } = contentOf({ ...item, type: 'Quote' as const });
        return { id: item.id, text, author, source, hint, ...this.previews(item.cards[0], now, scheduling.Quote) };
      }),
    };
  }

  /**
   * How many items of this type are to learn, and those of the session, with
   * the card first rated: the first ones of the queue, or the chosen ones
   * (MEM-94), in their order.
   */
  private async sessionItems(userId: string, type: QueueType, ids?: string[]) {
    const where = IN_QUEUE(userId, type);
    const include = { cards: { where: { kind: FIRST_CARD[type] } } };
    const [total, found] = await Promise.all([
      this.prisma.item.count({ where }),
      ids
        ? this.prisma.item.findMany({ where: { ...where, id: { in: ids } }, include })
        : this.prisma.item.findMany({
            where,
            include,
            orderBy: QUEUE_ORDER, // MEM-61: the first ones of the learning queue
            take: SESSION_SIZE,
          }),
    ]);
    const items = ids ? found.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)) : found;
    return [total, items.filter((item) => item.cards.length > 0)] as const;
  }

  /** The card of a session's item, and when it comes back for each rating, then once rated « À revoir ». */
  private previews(card: Card, now: Date, options: SchedulingOptions) {
    return {
      cardId: card.id,
      nextDue: this.scheduler.preview(card, now, options),
      nextDueAfterAgain: this.scheduler.preview(this.scheduler.review(card, 'Again', now, options).card, now, options),
    };
  }

  /**
   * The first rating of an item to learn: recorded as the first review of
   * its card (French → English for the vocabulary, step 2 of a session; the
   * card of a quote, MEM-68), and the item moves to `Learning`. The English →
   * French card of a vocabulary item, not rated yet, becomes due at once, as
   * a new card.
   */
  async learn(userId: string, itemId: string, rating: Grade, now = new Date()) {
    const item = await this.prisma.item.findFirst({
      where: { id: itemId, userId, type: { in: LEARNED_PER_ITEM } },
      include: { cards: true },
    });
    if (!item) {
      throw new NotFoundException(`Item ${itemId} not found`);
    }
    if (item.learningStatus !== 'ToLearn') {
      throw new ConflictException(`Item ${itemId} is not to learn`);
    }
    const type = item.type as QueueType;
    const first = item.cards.find((card) => card.kind === FIRST_CARD[type]);
    if (!first) {
      throw new ConflictException(`Item ${itemId} has no card to learn`);
    }
    const others = item.cards.filter((card) => card.id !== first.id);

    const options = (await spaceScheduling(this.prisma, userId))[type]; // MEM-75, MEM-76
    const { card: next, log } = this.scheduler.review(first, rating, now, options);

    // All or nothing: the item never ends up `Learning` without its first review.
    await this.prisma.$transaction([
      this.prisma.card.update({ where: { id: first.id }, data: next }),
      this.prisma.reviewLog.create({ data: { ...log, cardId: first.id } }),
      ...others.map((card) =>
        this.prisma.card.update({ where: { id: card.id }, data: { due: card.due < now ? card.due : now } }),
      ),
      this.prisma.item.update({ where: { id: item.id }, data: { learningStatus: 'Learning', learnPosition: null } }),
    ]);
    await renumberQueue(this.prisma, userId, type); // MEM-61: it left the queue, the next ones move up

    return {
      id: item.id,
      learningStatus: 'Learning' as const,
      nextDue: next.due,
      // MEM-47: after « À revoir », the card comes back at the end of the session.
      nextDueByRating: this.scheduler.preview({ ...first, ...next }, now, options),
    };
  }

  /**
   * "Appris" in a review (MEM-22): the item leaves the review, its cards
   * with it. Each card gets a `Learned` entry in its history, with its
   * schedule as it stands: nothing is rescheduled, so that putting the item
   * back in learning finds the same schedule.
   * Also at step 2 of a learning session (MEM-46): an item still to learn
   * goes straight to `Learned`, without ever entering the review.
   * A vocabulary item, or a quote (MEM-67).
   */
  async markLearned(userId: string, itemId: string, now = new Date()) {
    const item = await this.learnable(userId, itemId, ['ToLearn', 'Learning']);

    await this.prisma.$transaction([
      ...item.cards.map((card) =>
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
      ),
      this.prisma.item.update({ where: { id: item.id }, data: { learningStatus: 'Learned', learnPosition: null } }),
    ]);
    if (item.learningStatus === 'ToLearn') await renumberQueue(this.prisma, userId, item.type); // MEM-61
    return { id: item.id, learningStatus: 'Learned' as const };
  }

  /**
   * MEM-63: the items "En attente" among `ids` join the learning queue of
   * their type, last, in the order given (that of the list); the others are
   * ignored, those of the other type too (MEM-67). A single transaction.
   */
  async addToQueue(userId: string, type: QueueType, ids: string[]): Promise<{ changed: number; ignored: number }> {
    return this.prisma.$transaction(async (tx) => {
      const waiting = new Set(
        (
          await tx.item.findMany({
            where: { id: { in: ids }, userId, type, learningStatus: 'Waiting' },
            select: { id: true },
          })
        ).map((item) => item.id),
      );
      const added = [...new Set(ids)].filter((id) => waiting.has(id));
      const queue = await queueIds(tx, userId, type);
      await tx.item.updateMany({ where: { id: { in: added } }, data: { learningStatus: 'ToLearn' } });
      await renumberQueue(tx, userId, type, [...queue, ...added]);
      return { changed: added.length, ignored: ids.length - added.length };
    });
  }

  /**
   * MEM-63: the items of the learning queue among `ids` go back "En attente";
   * the next ones move up. The others are ignored.
   */
  async removeFromQueue(userId: string, type: QueueType, ids: string[]): Promise<{ changed: number; ignored: number }> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.item.updateMany({
        where: { id: { in: ids }, ...IN_QUEUE(userId, type) },
        data: { learningStatus: 'Waiting', learnPosition: null },
      });
      await renumberQueue(tx, userId, type);
      return { changed: count, ignored: ids.length - count };
    });
  }

  /**
   * MEM-64: moves an item of the learning queue to a position (1: the head;
   * beyond the end: last); the others shift. 409 if it is not in the queue.
   */
  async moveInQueue(
    userId: string,
    type: QueueType,
    id: string,
    position: number,
  ): Promise<{ position: number; total: number }> {
    return this.prisma.$transaction(async (tx) => {
      const queue = await queueIds(tx, userId, type);
      const index = queue.indexOf(id);
      if (index === -1) throw new ConflictException(`Item ${id} is not in the learning queue`);
      queue.splice(index, 1);
      const target = Math.min(Math.max(position, 1), queue.length + 1);
      queue.splice(target - 1, 0, id);
      await renumberQueue(tx, userId, type, queue);
      return { position: target, total: queue.length };
    });
  }

  /**
   * MEM-64: the items of the learning queue among `ids` go to its head, in
   * their current order; the others are ignored.
   */
  async moveToTopOfQueue(
    userId: string,
    type: QueueType,
    ids: string[],
  ): Promise<{ changed: number; ignored: number }> {
    return this.prisma.$transaction(async (tx) => {
      const queue = await queueIds(tx, userId, type);
      const chosen = new Set(ids);
      const top = queue.filter((id) => chosen.has(id));
      await renumberQueue(tx, userId, type, [...top, ...queue.filter((id) => !chosen.has(id))]);
      return { changed: top.length, ignored: ids.length - top.length };
    });
  }

  /**
   * "Remettre en apprentissage" (MEM-22), « Remettre en révision » for a
   * quote (MEM-67): back in the review, with the schedule it had.
   */
  async relearn(userId: string, itemId: string) {
    const item = await this.learnable(userId, itemId, ['Learned']);
    await this.prisma.item.update({ where: { id: item.id }, data: { learningStatus: 'Learning' } });
    return { id: item.id, learningStatus: 'Learning' as const };
  }

  /**
   * The user's vocabulary item or quote (MEM-67), the types learned per
   * item, in one of the expected states: 404 or 409 otherwise.
   */
  private async learnable(userId: string, itemId: string, expected: LearningStatus[]) {
    const item = await this.prisma.item.findFirst({
      where: { id: itemId, userId, type: { in: LEARNED_PER_ITEM } },
      include: { cards: true },
    });
    if (!item) {
      throw new NotFoundException(`Item ${itemId} not found`);
    }
    if (!expected.includes(item.learningStatus)) {
      throw new ConflictException(`Item ${itemId} is not ${expected.join(' or ')}`);
    }
    return item as typeof item & { type: QueueType };
  }
}
