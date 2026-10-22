import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { ReviewRating } from '@prisma/client';
import { contentOf } from '../items/item-content.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type NextDueByRating, SchedulerService } from '../scheduling/scheduler.service.js';

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
  async learn(userId: string, itemId: string, rating: ReviewRating, now = new Date()) {
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
}
