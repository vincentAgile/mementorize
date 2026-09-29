import { NotFoundException } from '@nestjs/common';
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
    $transaction: vi.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
  };

  const aCard = () => ({ id: 'card-1', itemId: 'item-1', kind: 'QuoteRecall' as const, ...scheduler.newCard(NOW), createdAt: NOW, updatedAt: NOW });

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

      const result = await service.findDue(userId, 20, NOW);

      const where = { due: { lte: NOW }, item: { userId } };
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

      const result = await service.findDue(userId, 20, NOW);

      expect(result.total).toBe(1);
      expect(result.items[0].item).toEqual(item);
      expect(result.items[0].card).not.toHaveProperty('item');
      expect(Object.keys(result.items[0].nextDue)).toEqual(['Again', 'Hard', 'Good', 'Easy']);
      expect(result.nextDueAt).toEqual(later);
    });
  });

  describe('review', () => {
    it("refuses to review a card that doesn't exist or isn't the user's", async () => {
      prismaMock.card.findFirst.mockResolvedValue(null);

      await expect(service.review(userId, 'card-1', 'Good', NOW)).rejects.toThrow(NotFoundException);
      expect(prismaMock.card.findFirst).toHaveBeenCalledWith({ where: { id: 'card-1', item: { userId } } });
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('reschedules the card and records the review in a single transaction', async () => {
      const card = aCard();
      prismaMock.card.findFirst.mockResolvedValue(card);
      prismaMock.card.update.mockImplementation(({ data }) => Promise.resolve({ ...card, ...data }));
      prismaMock.reviewLog.create.mockResolvedValue({});

      const updated = await service.review(userId, 'card-1', 'Good', NOW);

      const expected = scheduler.review(card, 'Good', NOW);
      expect(prismaMock.card.update).toHaveBeenCalledWith({ where: { id: 'card-1' }, data: expected.card });
      expect(prismaMock.reviewLog.create).toHaveBeenCalledWith({ data: { ...expected.log, cardId: 'card-1' } });
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(updated.state).toBe('Learning');
    });
  });
});
