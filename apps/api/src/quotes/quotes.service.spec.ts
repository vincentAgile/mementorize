import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { QuotesService } from './quotes.service.js';

describe('QuotesService', () => {
  let service: QuotesService;
  const userId = 'user-1';

  // Fake PrismaService: only the methods the service actually calls are
  // mocked, no real database needed here.
  const prismaMock = {
    quote: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };

  const aQuote = (overrides = {}) => ({
    id: '1',
    text: 'Old text',
    author: null,
    source: null,
    userId,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [QuotesService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = module.get(QuotesService);
  });

  it('creates a quote owned by the current user', async () => {
    const dto = { text: 'The only true wisdom is in knowing you know nothing.', author: 'Socrates' };
    const created = aQuote(dto);
    prismaMock.quote.create.mockResolvedValue(created);

    const result = await service.create(userId, dto);

    expect(prismaMock.quote.create).toHaveBeenCalledWith({ data: { ...dto, userId } });
    expect(result).toEqual(created);
  });

  it("only lists the current user's quotes", async () => {
    prismaMock.quote.findMany.mockResolvedValue([]);

    await service.findAll(userId);

    expect(prismaMock.quote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId } }),
    );
  });

  it('throws a 404 when the quote does not exist', async () => {
    prismaMock.quote.findFirst.mockResolvedValue(null);

    await expect(service.findOne(userId, 'unknown')).rejects.toThrow(NotFoundException);
  });

  it("looks quotes up by id AND owner, so another user's quote is a 404", async () => {
    prismaMock.quote.findFirst.mockResolvedValue(null);

    await expect(service.findOne('someone-else', '1')).rejects.toThrow(NotFoundException);
    expect(prismaMock.quote.findFirst).toHaveBeenCalledWith({
      where: { id: '1', userId: 'someone-else' },
    });
  });

  it('updates an existing quote', async () => {
    prismaMock.quote.findFirst.mockResolvedValue(aQuote());
    prismaMock.quote.update.mockResolvedValue(aQuote({ text: 'New text' }));

    const result = await service.update(userId, '1', { text: 'New text' });

    expect(prismaMock.quote.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: { text: 'New text' },
    });
    expect(result.text).toBe('New text');
  });

  it('refuses to delete a quote that does not exist or is not owned', async () => {
    prismaMock.quote.findFirst.mockResolvedValue(null);

    await expect(service.remove(userId, 'unknown')).rejects.toThrow(NotFoundException);
    expect(prismaMock.quote.delete).not.toHaveBeenCalled();
  });
});
