import { Injectable, NotFoundException } from '@nestjs/common';
import type { Card, Quote, ReviewRating } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { type NextDueByRating, SchedulerService } from '../scheduling/scheduler.service.js';

export interface DueItem {
  quote: Quote;
  card: Card;
  nextDue: NextDueByRating; // shown on the self-assessment buttons
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

  /** Cards of this user whose due date has passed, oldest first. */
  async findDue(userId: string, limit = 20, now = new Date()): Promise<DueReviews> {
    const where = { due: { lte: now }, quote: { userId } };
    const [total, cards, upcoming] = await Promise.all([
      this.prisma.card.count({ where }),
      this.prisma.card.findMany({ where, include: { quote: true }, orderBy: { due: 'asc' }, take: limit }),
      this.prisma.card.findFirst({
        where: { due: { gt: now }, quote: { userId } },
        orderBy: { due: 'asc' },
        select: { due: true },
      }),
    ]);

    return {
      total,
      nextDueAt: upcoming?.due ?? null,
      items: cards.map(({ quote, ...card }) => ({
        quote,
        card,
        nextDue: this.scheduler.preview(card, now),
      })),
    };
  }

  /** Records a self-assessment and reschedules the card. */
  async review(userId: string, quoteId: string, rating: ReviewRating, now = new Date()): Promise<Card> {
    const card = await this.prisma.card.findFirst({ where: { quoteId, quote: { userId } } });
    if (!card) {
      throw new NotFoundException(`Quote ${quoteId} not found`);
    }

    const { card: next, log } = this.scheduler.review(card, rating, now);

    // Both writes succeed or neither does: no log without its card update.
    const [updated] = await this.prisma.$transaction([
      this.prisma.card.update({ where: { id: card.id }, data: next }),
      this.prisma.reviewLog.create({ data: { ...log, cardId: card.id } }),
    ]);
    return updated;
  }
}
