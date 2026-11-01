import { Injectable } from '@nestjs/common';
import type { ItemType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { IN_REVIEW, REVIEWED_CARD } from '../reviews/in-review.js';
import { dayOf, endOfDay, type ProgressDay, progressDays } from './progress.js';

/**
 * The end of a learning or review session: the next review of the space and
 * its progress, day by day (none for the mind maps, always "Learning").
 */
export interface LearningProgress {
  /** The next day with cards to review in the space (today when some are due), and how many by its end. */
  nextReview: { day: string; count: number } | null;
  /** How many items were « En cours d'apprentissage » and « Appris » at the end of each day. */
  days: ProgressDay[];
}

@Injectable()
export class LearningProgressService {
  constructor(private readonly prisma: PrismaService) {}

  /** The progress of a space of a user, at the end of a learning or review session. */
  async progress(userId: string, type: ItemType, now = new Date()): Promise<LearningProgress> {
    // The cards of the review of this space, as the counters of the menu count them.
    const reviewed = { ...REVIEWED_CARD, item: { userId, type, ...IN_REVIEW } };
    const [first, changes] = await Promise.all([
      this.prisma.card.findFirst({ where: reviewed, orderBy: { due: 'asc' }, select: { due: true } }),
      type === 'MindMap'
        ? []
        : this.prisma.learningStatusChange.findMany({
            where: { item: { userId, type } },
            orderBy: { changedAt: 'asc' },
            select: { itemId: true, status: true, changedAt: true },
          }),
    ]);

    let nextReview: LearningProgress['nextReview'] = null;
    if (first) {
      // Cards already due: today, with all those due by tonight.
      const day = dayOf(first.due < now ? now : first.due);
      const count = await this.prisma.card.count({ where: { ...reviewed, due: { lt: endOfDay(day) } } });
      nextReview = { day, count };
    }
    return { nextReview, days: progressDays(changes, now) };
  }
}
