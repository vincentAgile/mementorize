import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { SchedulerService } from '../scheduling/scheduler.service.js';
import { ReviewsService } from './reviews.service.js';

describe('ReviewsService', () => {
  let service: ReviewsService;
  const scheduler = new SchedulerService({ enable_fuzz: false });
  const NOW = new Date('2026-09-29T08:00:00Z');
  const userId = 'user-1';

  const prismaMock = {
    card: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    reviewLog: { create: vi.fn() },
    // The target retention of each space (MEM-75): none stored here, so 90 %.
    user: { findUnique: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
  };

  const aCard = () => ({
    id: 'card-1',
    itemId: 'item-1',
    kind: 'QuoteRecall' as const,
    ...scheduler.newCard(NOW),
    createdAt: NOW,
    updatedAt: NOW,
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: SchedulerService, useValue: scheduler },
      ],
    }).compile();
    service = module.get(ReviewsService);
  });

  describe('findDue', () => {
    it("only looks at the current user's cards that are due", async () => {
      prismaMock.card.count.mockResolvedValue(0);
      prismaMock.card.findMany.mockResolvedValue([]);
      prismaMock.card.findFirst.mockResolvedValue(null);

      const result = await service.findDue(userId, 20, undefined, NOW);

      const where = {
        due: { lte: NOW },
        kind: { not: 'EnglishToFrench' },
        learnedAt: null,
        item: { userId, learningStatus: 'Learning' },
      };
      expect(prismaMock.card.count).toHaveBeenCalledWith({ where });
      expect(prismaMock.card.findMany).toHaveBeenCalledWith(expect.objectContaining({ where, take: 20 }));
      expect(result.nextDueAt).toBeNull();
    });

    it('returns each due card with its item and the next due date of every possible answer', async () => {
      const item = { id: 'item-1', type: 'Quote', content: { text: 'Hello', author: null, source: null }, userId };
      const later = new Date('2026-10-02T08:00:00Z');
      prismaMock.card.count.mockResolvedValue(1);
      prismaMock.card.findMany.mockResolvedValue([{ ...aCard(), item }]);
      prismaMock.card.findFirst.mockResolvedValue({ due: later });

      const result = await service.findDue(userId, 20, undefined, NOW);

      expect(result.total).toBe(1);
      expect(result.items[0].item).toEqual(item);
      expect(result.items[0].card).not.toHaveProperty('item');
      expect(Object.keys(result.items[0].nextDue)).toEqual(['Again', 'Hard', 'Good', 'Easy']);
      expect(result.nextDueAt).toEqual(later);
    });

    it('only counts the cards of one type of item when asked to (a subject space)', async () => {
      prismaMock.card.count.mockResolvedValue(0);
      prismaMock.card.findMany.mockResolvedValue([]);
      prismaMock.card.findFirst.mockResolvedValue(null);

      await service.findDue(userId, 20, 'Vocabulary', NOW);

      const item = { userId, type: 'Vocabulary', learningStatus: 'Learning' };
      expect(prismaMock.card.count).toHaveBeenCalledWith({
        where: { due: { lte: NOW }, kind: { not: 'EnglishToFrench' }, learnedAt: null, item },
      });
      expect(prismaMock.card.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { due: { gt: NOW }, kind: { not: 'EnglishToFrench' }, learnedAt: null, item },
        }),
      );
    });
  });

  describe('countDue', () => {
    it('counts the due cards of each type of item, and their total', async () => {
      prismaMock.card.count.mockImplementation(({ where }: { where: { item: { type: string } } }) =>
        Promise.resolve({ Quote: 1, Vocabulary: 3, MindMap: 0 }[where.item.type]),
      );

      const summary = await service.countDue(userId, NOW);

      expect(summary).toEqual({ total: 4, byType: { Quote: 1, Vocabulary: 3, MindMap: 0 } });
      expect(prismaMock.card.count).toHaveBeenCalledWith({
        where: {
          due: { lte: NOW },
          kind: { not: 'EnglishToFrench' },
          learnedAt: null,
          item: { userId, type: 'Vocabulary', learningStatus: 'Learning' },
        },
      });
    });
  });

  describe('review', () => {
    it("refuses to review a card that doesn't exist or isn't the user's", async () => {
      prismaMock.card.findFirst.mockResolvedValue(null);

      await expect(service.review(userId, 'card-1', 'Good', NOW)).rejects.toThrow(NotFoundException);
      expect(prismaMock.card.findFirst).toHaveBeenCalledWith({
        where: { id: 'card-1', item: { userId } },
        include: { item: { select: { type: true } } },
      });
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('reschedules the card and records the review in a single transaction', async () => {
      const card = aCard();
      prismaMock.card.findFirst.mockResolvedValue({ ...card, item: { type: 'Quote' } });
      prismaMock.card.update.mockImplementation(({ data }) => Promise.resolve({ ...card, ...data }));
      prismaMock.reviewLog.create.mockResolvedValue({});

      const updated = await service.review(userId, 'card-1', 'Good', NOW);

      const expected = scheduler.review(card, 'Good', NOW);
      expect(prismaMock.card.update).toHaveBeenCalledWith({ where: { id: 'card-1' }, data: expected.card });
      expect(prismaMock.reviewLog.create).toHaveBeenCalledWith({ data: { ...expected.log, cardId: 'card-1' } });
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(updated.state).toBe('Learning');
      // MEM-47: the previews of its next review, for its buttons at the end of the session.
      expect(updated.nextDueByRating).toEqual(scheduler.preview({ ...card, ...expected.card }, NOW));
    });

    it('schedules with the target retention of the space of the card (MEM-75)', async () => {
      // A card reviewed ten days ago: its next interval depends on the retention.
      const card = {
        ...aCard(),
        state: 'Review' as const,
        stability: 10,
        difficulty: 5,
        reps: 3,
        lastReview: new Date(NOW.getTime() - 10 * 86_400_000),
        due: NOW,
      };
      prismaMock.card.findFirst.mockResolvedValue({ ...card, item: { type: 'Quote' } });
      prismaMock.card.update.mockImplementation(({ data }) => Promise.resolve({ ...card, ...data }));
      prismaMock.user.findUnique.mockResolvedValueOnce({
        vocabularyRetention: 90,
        quoteRetention: 95,
        mindMapRetention: 85,
      });

      await service.review(userId, 'card-1', 'Good', NOW);

      const at95 = scheduler.review(card, 'Good', NOW, 95).card;
      const at90 = scheduler.review(card, 'Good', NOW, 90).card;
      expect(at95.due.getTime()).toBeLessThan(at90.due.getTime()); // sooner, for a sturdier memory
      expect(prismaMock.card.update).toHaveBeenCalledWith({ where: { id: 'card-1' }, data: at95 });
    });
  });

  describe('markLearned and relearn (MEM-48)', () => {
    const learnable = (type: string, learnedAt: Date | null = null) => ({
      ...aCard(),
      learnedAt,
      item: { id: 'item-1', userId, type },
    });

    it('takes a mind map branch out of the review, logs "Learned" and keeps its schedule', async () => {
      const card = learnable('MindMap');
      prismaMock.card.findFirst.mockResolvedValue(card);

      await service.markLearned(userId, 'card-1', NOW);

      expect(prismaMock.card.findFirst).toHaveBeenCalledWith({
        where: { id: 'card-1', item: { userId } },
        include: { item: true },
      });
      expect(prismaMock.card.update).toHaveBeenCalledWith({ where: { id: 'card-1' }, data: { learnedAt: NOW } });
      expect(prismaMock.reviewLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ cardId: 'card-1', rating: 'Learned', due: card.due, reviewedAt: NOW }),
      });
    });

    it('refuses vocabulary and quotes (learned per item, MEM-67), a card already learned, or an unknown card', async () => {
      prismaMock.card.findFirst.mockResolvedValue(learnable('Vocabulary'));
      await expect(service.markLearned(userId, 'card-1', NOW)).rejects.toBeInstanceOf(ConflictException);
      prismaMock.card.findFirst.mockResolvedValue(learnable('Quote'));
      await expect(service.markLearned(userId, 'card-1', NOW)).rejects.toBeInstanceOf(ConflictException);
      prismaMock.card.findFirst.mockResolvedValue(learnable('MindMap', NOW));
      await expect(service.markLearned(userId, 'card-1', NOW)).rejects.toBeInstanceOf(ConflictException);
      prismaMock.card.findFirst.mockResolvedValue(null);
      await expect(service.markLearned(userId, 'card-1', NOW)).rejects.toBeInstanceOf(NotFoundException);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('puts a learned branch back in the review, with the schedule it had', async () => {
      prismaMock.card.findFirst.mockResolvedValue(learnable('MindMap', NOW));
      await service.relearn(userId, 'card-1');
      expect(prismaMock.card.update).toHaveBeenCalledWith({ where: { id: 'card-1' }, data: { learnedAt: null } });

      prismaMock.card.findFirst.mockResolvedValue(learnable('MindMap'));
      await expect(service.relearn(userId, 'card-1')).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
