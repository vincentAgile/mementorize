import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { SchedulerService } from '../scheduling/scheduler.service.js';
import { LearningService } from './learning.service.js';

describe('LearningService', () => {
  let service: LearningService;
  const scheduler = new SchedulerService({ enable_fuzz: false });
  const NOW = new Date('2026-10-22T08:00:00Z');
  const LATER = new Date('2026-10-23T08:00:00Z');
  const userId = 'user-1';

  const prismaMock = {
    item: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    card: { update: vi.fn() },
    reviewLog: { create: vi.fn() },
    $transaction: vi.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
  };

  const card = (id: string, kind: string, due: Date) => ({
    id,
    itemId: 'item-1',
    kind,
    nodeId: null,
    ...scheduler.newCard(due),
    due,
  });
  const word = (learningStatus = 'ToLearn') => ({
    id: 'item-1',
    userId,
    type: 'Vocabulary',
    learningStatus,
    content: { word: 'snag', translation: 'accroc', example: null },
    cards: [card('en-fr', 'EnglishToFrench', LATER), card('fr-en', 'FrenchToEnglish', LATER)],
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        LearningService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: SchedulerService, useValue: scheduler },
      ],
    }).compile();
    service = module.get(LearningService);
  });

  describe('session', () => {
    it('picks the five oldest vocabulary items to learn, with the rating previews of their French → English card', async () => {
      prismaMock.item.count.mockResolvedValue(7);
      prismaMock.item.findMany.mockResolvedValue([{ ...word(), cards: [card('fr-en', 'FrenchToEnglish', NOW)] }]);

      const session = await service.session(userId, NOW);

      expect(prismaMock.item.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId, type: 'Vocabulary', learningStatus: 'ToLearn' },
          orderBy: { createdAt: 'asc' },
          take: 5,
        }),
      );
      expect(session.total).toBe(7);
      // No French example in a content from before MEM-42: null.
      expect(session.items[0]).toMatchObject({
        id: 'item-1',
        word: 'snag',
        translation: 'accroc',
        frenchExample: null,
      });
      expect(Object.keys(session.items[0].nextDue)).toEqual(['Again', 'Hard', 'Good', 'Easy']);
    });
  });

  describe('learn', () => {
    it('rates the French → English card, makes the other one due now, and moves the item to Learning', async () => {
      prismaMock.item.findFirst.mockResolvedValue(word());

      const result = await service.learn(userId, 'item-1', 'Good', NOW);

      const expected = scheduler.review(word().cards[1], 'Good', NOW);
      expect(prismaMock.card.update).toHaveBeenCalledWith({ where: { id: 'fr-en' }, data: expected.card });
      expect(prismaMock.reviewLog.create).toHaveBeenCalledWith({ data: { ...expected.log, cardId: 'fr-en' } });
      expect(prismaMock.card.update).toHaveBeenCalledWith({ where: { id: 'en-fr' }, data: { due: NOW } });
      expect(prismaMock.item.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { learningStatus: 'Learning' },
      });
      expect(result).toEqual({ id: 'item-1', learningStatus: 'Learning', nextDue: expected.card.due });
    });

    it("refuses an item that doesn't exist or isn't the user's", async () => {
      prismaMock.item.findFirst.mockResolvedValue(null);
      await expect(service.learn(userId, 'item-1', 'Good', NOW)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses an item that is no longer to learn', async () => {
      prismaMock.item.findFirst.mockResolvedValue(word('Learning'));
      await expect(service.learn(userId, 'item-1', 'Good', NOW)).rejects.toBeInstanceOf(ConflictException);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('markLearned', () => {
    it('logs "Learned" on both cards without rescheduling them, and takes the item out of the review', async () => {
      prismaMock.item.findFirst.mockResolvedValue(word('Learning'));

      await service.markLearned(userId, 'item-1', NOW);

      expect(prismaMock.reviewLog.create).toHaveBeenCalledTimes(2);
      expect(prismaMock.reviewLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ cardId: 'fr-en', rating: 'Learned', due: LATER, reviewedAt: NOW }),
      });
      expect(prismaMock.card.update).not.toHaveBeenCalled();
      expect(prismaMock.item.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { learningStatus: 'Learned' },
      });
    });

    it('refuses an item that is not being learned', async () => {
      prismaMock.item.findFirst.mockResolvedValue(word('ToLearn'));
      await expect(service.markLearned(userId, 'item-1', NOW)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('relearn', () => {
    it('puts a learned item back in the review', async () => {
      prismaMock.item.findFirst.mockResolvedValue(word('Learned'));
      await service.relearn(userId, 'item-1');
      expect(prismaMock.item.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { learningStatus: 'Learning' },
      });
      expect(prismaMock.card.update).not.toHaveBeenCalled();
    });

    it('refuses an item that is not learned', async () => {
      prismaMock.item.findFirst.mockResolvedValue(word('Learning'));
      await expect(service.relearn(userId, 'item-1')).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
