import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { QuotesService } from './quotes.service.js';

describe('QuotesService', () => {
  let service: QuotesService;

  // Fake PrismaService: only the methods the service actually calls are
  // mocked, no real database needed here.
  const prismaMock = {
    quote: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [QuotesService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = module.get(QuotesService);
  });

  it('creates a quote by delegating to Prisma', async () => {
    const dto = { text: 'The only true wisdom is in knowing you know nothing.', author: 'Socrates' };
    const created = { id: '1', ...dto, source: null, createdAt: new Date(), updatedAt: new Date() };
    prismaMock.quote.create.mockResolvedValue(created);

    const result = await service.create(dto);

    expect(prismaMock.quote.create).toHaveBeenCalledWith({ data: dto });
    expect(result).toEqual(created);
  });

  it('throws a 404 when the quote does not exist', async () => {
    prismaMock.quote.findUnique.mockResolvedValue(null);

    await expect(service.findOne('unknown')).rejects.toThrow(NotFoundException);
  });

  it('updates an existing quote', async () => {
    const existing = {
      id: '1',
      text: 'Old text',
      author: null,
      source: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    prismaMock.quote.findUnique.mockResolvedValue(existing);
    prismaMock.quote.update.mockResolvedValue({ ...existing, text: 'New text' });

    const result = await service.update('1', { text: 'New text' });

    expect(prismaMock.quote.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: { text: 'New text' },
    });
    expect(result.text).toBe('New text');
  });

  it('refuses to delete a quote that does not exist', async () => {
    prismaMock.quote.findUnique.mockResolvedValue(null);

    await expect(service.remove('unknown')).rejects.toThrow(NotFoundException);
    expect(prismaMock.quote.delete).not.toHaveBeenCalled();
  });
});
