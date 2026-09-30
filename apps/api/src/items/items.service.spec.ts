import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { SchedulerService } from '../scheduling/scheduler.service.js';
import { ItemsService } from './items.service.js';

describe('ItemsService', () => {
  let service: ItemsService;
  const scheduler = new SchedulerService({ enable_fuzz: false });
  const NOW = new Date('2026-09-29T08:00:00Z');
  const TOMORROW = new Date('2026-09-30T08:00:00Z');
  const userId = 'user-1';

  const prismaMock = {
    item: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
  };

  const anItem = (overrides = {}) => ({
    id: 'item-1',
    type: 'Vocabulary',
    content: { word: 'to cherish', translation: 'chérir', example: null },
    userId,
    cards: [
      { id: 'card-1', kind: 'EnglishToFrench', nodeId: null, due: NOW, state: 'New' },
      { id: 'card-2', kind: 'FrenchToEnglish', nodeId: null, due: TOMORROW, state: 'New' },
    ],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ItemsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: SchedulerService, useValue: scheduler },
      ],
    }).compile();
    service = module.get(ItemsService);
  });

  const createdCards = () => prismaMock.item.create.mock.calls[0][0].data.cards.create;

  describe('create', () => {
    it('gives a quote a single card, due now', async () => {
      const content = { text: 'Hello', author: null, source: null };

      await service.create(userId, 'Quote', content, NOW);

      expect(prismaMock.item.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId, type: 'Quote', content }) }),
      );
      expect(createdCards()).toEqual([{ kind: 'QuoteRecall', nodeId: null, ...scheduler.newCard(NOW) }]);
    });

    it('gives a vocabulary word one card per direction, the reverse one starting a day later', async () => {
      await service.create(userId, 'Vocabulary', { word: 'to cherish', translation: 'chérir', example: null }, NOW);

      expect(createdCards()).toEqual([
        { kind: 'EnglishToFrench', nodeId: null, ...scheduler.newCard(NOW) },
        { kind: 'FrenchToEnglish', nodeId: null, ...scheduler.newCard(TOMORROW) },
      ]);
    });
    it('gives a mind map one card per branch', async () => {
      const content = {
        nodes: [
          { id: 'root', parentId: null, label: 'Racine', position: { x: 0, y: 0 } },
          { id: 'a', parentId: 'root', label: 'A', position: { x: 200, y: 0 } },
          { id: 'b', parentId: 'root', label: 'B', position: { x: 200, y: 80 } },
          { id: 'a1', parentId: 'a', label: 'A1', position: { x: 400, y: 0 } },
        ],
      };

      await service.create(userId, 'MindMap', content, NOW);

      expect(createdCards()).toEqual([
        { kind: 'BranchRecall', nodeId: 'a', ...scheduler.newCard(NOW) },
        { kind: 'BranchRecall', nodeId: 'b', ...scheduler.newCard(TOMORROW) },
      ]);
    });
  });

  describe('findAll', () => {
    it("lists the user's items, all types mixed", async () => {
      prismaMock.item.findMany.mockResolvedValue([]);

      await service.findAll(userId);

      expect(prismaMock.item.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId } }));
    });

    it('can filter by type', async () => {
      prismaMock.item.findMany.mockResolvedValue([]);

      await service.findAll(userId, 'Vocabulary');

      expect(prismaMock.item.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId, type: 'Vocabulary' } }),
      );
    });
  });

  describe('findOne', () => {
    it('looks the item up by id, owner and (optionally) type', async () => {
      prismaMock.item.findFirst.mockResolvedValue(null);

      await expect(service.findOne(userId, 'item-1', 'Quote')).rejects.toThrow(NotFoundException);
      expect(prismaMock.item.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'item-1', userId, type: 'Quote' } }),
      );
    });
  });

  describe('update', () => {
    it('only replaces the fields that are provided, keeping the rest of the content', async () => {
      prismaMock.item.findFirst.mockResolvedValue(anItem());
      prismaMock.item.update.mockResolvedValue(anItem());

      await service.update(userId, 'item-1', 'Vocabulary', { example: 'I cherish these memories.', word: undefined });

      expect(prismaMock.item.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'item-1' },
          data: {
            content: { word: 'to cherish', translation: 'chérir', example: 'I cherish these memories.' },
            cards: {}, // same cards as before: nothing to create or delete
          },
        }),
      );
    });

    describe('on a mind map', () => {
      const at = { x: 0, y: 0 };
      const root = { id: 'root', parentId: null, label: 'Racine', position: at };
      const branch = (id: string, label = id.toUpperCase()) => ({ id, parentId: 'root', label, position: at });
      const card = (id: string, nodeId: string) => ({ id, kind: 'BranchRecall', nodeId, due: NOW, state: 'Review' });
      const aMap = () =>
        anItem({
          type: 'MindMap',
          content: { nodes: [root, branch('a'), branch('b')] },
          cards: [card('card-a', 'a'), card('card-b', 'b')],
        });

      it('creates the cards of new branches and deletes those of removed ones', async () => {
        prismaMock.item.findFirst.mockResolvedValue(aMap());
        prismaMock.item.update.mockResolvedValue(aMap());

        await service.update(userId, 'item-1', 'MindMap', { nodes: [root, branch('a'), branch('c'), branch('d')] }, NOW);

        const { cards } = prismaMock.item.update.mock.calls[0][0].data;
        expect(cards.deleteMany).toEqual({ id: { in: ['card-b'] } });
        expect(cards.create).toEqual([
          { kind: 'BranchRecall', nodeId: 'c', ...scheduler.newCard(NOW) },
          { kind: 'BranchRecall', nodeId: 'd', ...scheduler.newCard(TOMORROW) },
        ]);
      });

      it('keeps the card (and its schedule) of a renamed or moved branch', async () => {
        prismaMock.item.findFirst.mockResolvedValue(aMap());
        prismaMock.item.update.mockResolvedValue(aMap());

        const moved = { ...branch('b', 'B renamed'), position: { x: 300, y: 120 } };
        await service.update(userId, 'item-1', 'MindMap', { nodes: [root, branch('a'), moved] }, NOW);

        expect(prismaMock.item.update.mock.calls[0][0].data.cards).toEqual({});
      });

      it('deletes the card of a branch that became a deeper node', async () => {
        prismaMock.item.findFirst.mockResolvedValue(aMap());
        prismaMock.item.update.mockResolvedValue(aMap());

        const nested = { ...branch('b'), parentId: 'a' };
        await service.update(userId, 'item-1', 'MindMap', { nodes: [root, branch('a'), nested] }, NOW);

        expect(prismaMock.item.update.mock.calls[0][0].data.cards).toEqual({ deleteMany: { id: { in: ['card-b'] } } });
      });
    });

    it('refuses to update an item of another type', async () => {
      prismaMock.item.findFirst.mockResolvedValue(null); // no Quote with this id

      await expect(service.update(userId, 'item-1', 'Quote', { text: 'x' })).rejects.toThrow(NotFoundException);
      expect(prismaMock.item.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('does not delete anything when the item is not found', async () => {
      prismaMock.item.findFirst.mockResolvedValue(null);

      await expect(service.remove(userId, 'item-1')).rejects.toThrow(NotFoundException);
      expect(prismaMock.item.delete).not.toHaveBeenCalled();
    });
  });
});
