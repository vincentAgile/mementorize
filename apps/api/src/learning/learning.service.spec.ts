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
    $executeRaw: vi.fn(), // the renumbering of the learning queue (MEM-61)
    user: { findUnique: vi.fn().mockResolvedValue(null) }, // the target retentions (MEM-75): 90 %
    fsrsParameters: { findMany: vi.fn().mockResolvedValue([]) }, // the default weights (MEM-76)
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

  const quote = (learningStatus = 'ToLearn') => ({
    id: 'item-1',
    userId,
    type: 'Quote',
    learningStatus,
    content: { text: 'Connais-toi toi-même.', author: 'Socrate', source: null },
    cards: [card('q-card', 'QuoteRecall', NOW)],
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
    it('picks the five first items of the learning queue, with the rating previews of their French → English card', async () => {
      prismaMock.item.count.mockResolvedValue(7);
      prismaMock.item.findMany.mockResolvedValue([{ ...word(), cards: [card('fr-en', 'FrenchToEnglish', NOW)] }]);

      const session = await service.session(userId, NOW);

      expect(prismaMock.item.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId, type: 'Vocabulary', learningStatus: 'ToLearn' },
          orderBy: [{ learnPosition: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }, { id: 'asc' }],
          take: 5,
        }),
      );
      expect(session.total).toBe(7);
      // No French example in a content from before MEM-42: null.
      expect(session.items[0]).toMatchObject({
        id: 'item-1',
        cardId: 'fr-en',
        word: 'snag',
        translation: 'accroc',
        frenchExample: null,
      });
      expect(Object.keys(session.items[0].nextDue)).toEqual(['Again', 'Hard', 'Good', 'Easy']);
      const afterAgain = scheduler.review(card('fr-en', 'FrenchToEnglish', NOW), 'Again', NOW).card;
      expect(session.items[0].nextDueAfterAgain).toEqual(scheduler.preview(afterAgain, NOW));
    });

    it('takes the chosen items of the queue, in the order given (MEM-94)', async () => {
      prismaMock.item.count.mockResolvedValue(7);
      prismaMock.item.findMany.mockResolvedValue([
        { ...word(), cards: [card('fr-en', 'FrenchToEnglish', NOW)] },
        { ...word(), id: 'item-3', cards: [card('fr-en-3', 'FrenchToEnglish', NOW)] },
      ]);

      const session = await service.session(userId, NOW, ['item-3', 'gone', 'item-1']);

      const query = prismaMock.item.findMany.mock.calls[0][0];
      expect(query.where).toEqual({
        userId,
        type: 'Vocabulary',
        learningStatus: 'ToLearn',
        id: { in: ['item-3', 'gone', 'item-1'] },
      });
      expect(query.take).toBeUndefined();
      expect(session.total).toBe(7);
      expect(session.items.map((item) => item.id)).toEqual(['item-3', 'item-1']);
    });
  });

  describe('quoteSession (MEM-68)', () => {
    it('picks the five first quotes of their own learning queue, with the previews of their card', async () => {
      prismaMock.item.count.mockResolvedValue(2);
      const quoteCard = card('q-card', 'QuoteRecall', NOW);
      prismaMock.item.findMany.mockResolvedValue([
        { ...quote(), cards: [quoteCard] },
        { ...quote(), id: 'item-2', cards: [] }, // no card: left out
      ]);

      const session = await service.quoteSession(userId, NOW);

      expect(prismaMock.item.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId, type: 'Quote', learningStatus: 'ToLearn' },
          include: { cards: { where: { kind: 'QuoteRecall' } } },
          take: 5,
        }),
      );
      expect(session).toEqual({
        total: 2,
        items: [
          {
            id: 'item-1',
            cardId: 'q-card',
            text: 'Connais-toi toi-même.',
            author: 'Socrate',
            source: null,
            nextDue: scheduler.preview(quoteCard, NOW),
            nextDueAfterAgain: scheduler.preview(scheduler.review(quoteCard, 'Again', NOW).card, NOW),
          },
        ],
      });
    });
  });

  describe('learn', () => {
    it('rates the card of a quote and moves it to Learning, the queue of the quotes renumbered (MEM-68)', async () => {
      prismaMock.item.findFirst.mockResolvedValue(quote());

      const result = await service.learn(userId, 'item-1', 'Hard', NOW);

      const expected = scheduler.review(quote().cards[0], 'Hard', NOW);
      expect(prismaMock.card.update).toHaveBeenCalledTimes(1);
      expect(prismaMock.card.update).toHaveBeenCalledWith({ where: { id: 'q-card' }, data: expected.card });
      expect(prismaMock.reviewLog.create).toHaveBeenCalledWith({ data: { ...expected.log, cardId: 'q-card' } });
      expect(prismaMock.item.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { learningStatus: 'Learning', learnPosition: null },
      });
      expect(prismaMock.$executeRaw.mock.calls[0].slice(1)).toContain('Quote');
      expect(result).toMatchObject({ id: 'item-1', learningStatus: 'Learning', nextDue: expected.card.due });
    });

    it('rates the French → English card, makes the other one due now, and moves the item to Learning', async () => {
      prismaMock.item.findFirst.mockResolvedValue(word());

      const result = await service.learn(userId, 'item-1', 'Good', NOW);

      const expected = scheduler.review(word().cards[1], 'Good', NOW);
      expect(prismaMock.card.update).toHaveBeenCalledWith({ where: { id: 'fr-en' }, data: expected.card });
      expect(prismaMock.reviewLog.create).toHaveBeenCalledWith({ data: { ...expected.log, cardId: 'fr-en' } });
      expect(prismaMock.card.update).toHaveBeenCalledWith({ where: { id: 'en-fr' }, data: { due: NOW } });
      expect(prismaMock.item.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { learningStatus: 'Learning', learnPosition: null },
      });
      expect(prismaMock.$executeRaw).toHaveBeenCalled(); // the next ones of the queue move up
      expect(result).toEqual({
        id: 'item-1',
        learningStatus: 'Learning',
        nextDue: expected.card.due,
        nextDueByRating: scheduler.preview({ ...word().cards[1], ...expected.card }, NOW),
      });
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
        data: { learningStatus: 'Learned', learnPosition: null },
      });
    });

    it('takes an item still to learn straight to "Learned", at step 2 of a learning session (MEM-46)', async () => {
      prismaMock.item.findFirst.mockResolvedValue(word('ToLearn'));

      await service.markLearned(userId, 'item-1', NOW);

      expect(prismaMock.reviewLog.create).toHaveBeenCalledTimes(2);
      expect(prismaMock.card.update).not.toHaveBeenCalled();
      expect(prismaMock.item.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { learningStatus: 'Learned', learnPosition: null },
      });
      expect(prismaMock.$executeRaw).toHaveBeenCalled(); // it left the queue
    });

    it('refuses an item already learned', async () => {
      prismaMock.item.findFirst.mockResolvedValue(word('Learned'));
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
