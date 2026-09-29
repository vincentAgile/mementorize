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
    cards: [],
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
      expect(createdCards()).toEqual([{ kind: 'QuoteRecall', ...scheduler.newCard(NOW) }]);
    });

    it('gives a vocabulary word one card per direction, the reverse one starting a day later', async () => {
      await service.create(userId, 'Vocabulary', { word: 'to cherish', translation: 'chérir', example: null }, NOW);

      expect(createdCards()).toEqual([
        { kind: 'EnglishToFrench', ...scheduler.newCard(NOW) },
        { kind: 'FrenchToEnglish', ...scheduler.newCard(TOMORROW) },
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
          data: { content: { word: 'to cherish', translation: 'chérir', example: 'I cherish these memories.' } },
        }),
      );
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
