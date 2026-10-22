import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { contentOf } from '../items/item-content.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type Grade, type NextDueByRating, SchedulerService } from '../scheduling/scheduler.service.js';

/** Number of vocabulary items in a learning session (MEM-21). */
export const SESSION_SIZE = 5;

export interface LearningItem {
  id: string;
  word: string;
  translation: string;
  example: string | null;
  /** When the French → English card comes back, for each of the four ratings of step 2. */
  nextDue: NextDueByRating;
}

export interface LearningSession {
  /** All the vocabulary items still to learn, not only those of this session. */
  total: number;
  items: LearningItem[];
}

/**
 * The learning process of the vocabulary (MEM-21), as opposed to the review
 * process: it moves new items from `ToLearn` to `Learning`. In this first
 * version, a session shows up to five items (the oldest first), and the
 * rating of step 2 is the first review of their French → English card.
 */
@Injectable()
export class LearningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: SchedulerService,
  ) {}

  async session(userId: string, now = new Date()): Promise<LearningSession> {
    const where = { userId, type: 'Vocabulary', learningStatus: 'ToLearn' } as const;
    const [total, items] = await Promise.all([
      this.prisma.item.count({ where }),
      this.prisma.item.findMany({
        where,
        include: { cards: { where: { kind: 'FrenchToEnglish' } } },
        orderBy: { createdAt: 'asc' },
        take: SESSION_SIZE,
      }),
    ]);

    return {
      total,
      items: items
        .filter((item) => item.cards.length > 0)
        .map((item) => {
          const { word, translation, example } = contentOf({ ...item, type: 'Vocabulary' as const });
          return { id: item.id, word, translation, example, nextDue: this.scheduler.preview(item.cards[0], now) };
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
      this.prisma.item.update({ where: { id: item.id }, data: { learningStatus: 'Learning' } }),
    ]);

    return { id: item.id, learningStatus: 'Learning' as const, nextDue: next.due };
  }

  /**
   * "Appris" in a review (MEM-22): the item leaves the review, both its cards
   * with it. Each card gets a `Learned` entry in its history, with its
   * schedule as it stands: nothing is rescheduled, so that putting the item
   * back in learning finds the same schedule.
   */
  async markLearned(userId: string, itemId: string, now = new Date()) {
    const item = await this.vocabulary(userId, itemId, 'Learning');

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
      this.prisma.item.update({ where: { id: item.id }, data: { learningStatus: 'Learned' } }),
    ]);
    return { id: item.id, learningStatus: 'Learned' as const };
  }

  /** "Remettre en apprentissage" (MEM-22): back in the review, with the schedule it had. */
  async relearn(userId: string, itemId: string) {
    const item = await this.vocabulary(userId, itemId, 'Learned');
    await this.prisma.item.update({ where: { id: item.id }, data: { learningStatus: 'Learning' } });
    return { id: item.id, learningStatus: 'Learning' as const };
  }

  /** The user's vocabulary item, in the expected state: 404 or 409 otherwise. */
  private async vocabulary(userId: string, itemId: string, expected: 'Learning' | 'Learned') {
    const item = await this.prisma.item.findFirst({
      where: { id: itemId, userId, type: 'Vocabulary' },
      include: { cards: true },
    });
    if (!item) {
      throw new NotFoundException(`Vocabulary item ${itemId} not found`);
    }
    if (item.learningStatus !== expected) {
      throw new ConflictException(`Vocabulary item ${itemId} is not ${expected}`);
    }
    return item;
  }
}
