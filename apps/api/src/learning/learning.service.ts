import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { ItemType, LearningStatus } from '@prisma/client';
import { contentOf } from '../items/item-content.js';
import { IN_QUEUE, QUEUE_ORDER, type QueueType, queueIds, renumberQueue } from './learning-queue.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type Grade, type NextDueByRating, SchedulerService } from '../scheduling/scheduler.service.js';

/** The types learned per item (MEM-22, MEM-67): the item leaves the review, not a card. */
const LEARNED_PER_ITEM: ItemType[] = ['Vocabulary', 'Quote'];

/** Number of vocabulary items in a learning session (MEM-21). */
export const SESSION_SIZE = 5;

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
   * step 2 are only sent at the end of the session, so that leaving it keeps
   * every item "À apprendre"; the buttons of an item put back at the bottom
   * of the pile show these.
   */
  nextDueAfterAgain: NextDueByRating;
}

export interface LearningSession {
  /** All the vocabulary items still to learn, not only those of this session. */
  total: number;
  items: LearningItem[];
}

/**
 * The learning process of the vocabulary (MEM-21), as opposed to the review
 * process: it moves new items from `ToLearn` to `Learning`. A session shows
 * up to five items, the first ones of the learning queue (MEM-61), and the
 * rating of step 2 is the first review of their French → English card.
 */
@Injectable()
export class LearningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: SchedulerService,
  ) {}

  async session(userId: string, now = new Date()): Promise<LearningSession> {
    const where = IN_QUEUE(userId, 'Vocabulary');
    const [total, items] = await Promise.all([
      this.prisma.item.count({ where }),
      this.prisma.item.findMany({
        where,
        include: { cards: { where: { kind: 'FrenchToEnglish' } } },
        orderBy: QUEUE_ORDER, // MEM-61: the first ones of the learning queue
        take: SESSION_SIZE,
      }),
    ]);

    return {
      total,
      items: items
        .filter((item) => item.cards.length > 0)
        .map((item) => {
          const { word, translation, example, frenchExample } = contentOf({ ...item, type: 'Vocabulary' as const });
          return {
            id: item.id,
            cardId: item.cards[0].id,
            word,
            translation,
            example,
            frenchExample: frenchExample ?? null,
            nextDue: this.scheduler.preview(item.cards[0], now),
            nextDueAfterAgain: this.scheduler.preview(this.scheduler.review(item.cards[0], 'Again', now).card, now),
          };
        }),
    };
  }

  /**
   * Step 2 of a session: the rating is recorded as the first review of the
   * French → English card, the item moves to `Learning`, and its English →
   * French card, not rated yet, becomes due at once, as a new card.
   */
  async learn(userId: string, itemId: string, rating: Grade, now = new Date()) {
    const item = await this.prisma.item.findFirst({
      where: { id: itemId, userId, type: 'Vocabulary' },
      include: { cards: true },
    });
    if (!item) {
      throw new NotFoundException(`Vocabulary item ${itemId} not found`);
    }
    if (item.learningStatus !== 'ToLearn') {
      throw new ConflictException(`Vocabulary item ${itemId} is not to learn`);
    }
    const frenchToEnglish = item.cards.find((card) => card.kind === 'FrenchToEnglish');
    const englishToFrench = item.cards.find((card) => card.kind === 'EnglishToFrench');
    if (!frenchToEnglish || !englishToFrench) {
      throw new ConflictException(`Vocabulary item ${itemId} has no cards to learn`);
    }

    const { card: next, log } = this.scheduler.review(frenchToEnglish, rating, now);

    // All or nothing: the item never ends up `Learning` without its first review.
    await this.prisma.$transaction([
      this.prisma.card.update({ where: { id: frenchToEnglish.id }, data: next }),
      this.prisma.reviewLog.create({ data: { ...log, cardId: frenchToEnglish.id } }),
      this.prisma.card.update({
        where: { id: englishToFrench.id },
        data: { due: englishToFrench.due < now ? englishToFrench.due : now },
      }),
      this.prisma.item.update({ where: { id: item.id }, data: { learningStatus: 'Learning', learnPosition: null } }),
    ]);
    await renumberQueue(this.prisma, userId, 'Vocabulary'); // MEM-61: it left the queue, the next ones move up

    return {
      id: item.id,
      learningStatus: 'Learning' as const,
      nextDue: next.due,
      // MEM-47: after « À revoir », the card comes back at the end of the session.
      nextDueByRating: this.scheduler.preview({ ...frenchToEnglish, ...next }, now),
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
