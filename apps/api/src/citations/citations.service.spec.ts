import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { CitationsService } from './citations.service.js';

describe('CitationsService', () => {
  let service: CitationsService;

  // Faux PrismaService : seules les méthodes réellement utilisées par le
  // service sont mockées, pas besoin d'une vraie base de données ici.
  const prismaMock = {
    citation: {
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
      providers: [CitationsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = module.get(CitationsService);
  });

  it('crée une citation en déléguant à Prisma', async () => {
    const dto = { text: 'La vie ne vaut rien, mais rien ne vaut la vie.', author: 'André Malraux' };
    const created = { id: '1', ...dto, source: null, createdAt: new Date(), updatedAt: new Date() };
    prismaMock.citation.create.mockResolvedValue(created);

    const result = await service.create(dto);

    expect(prismaMock.citation.create).toHaveBeenCalledWith({ data: dto });
    expect(result).toEqual(created);
  });

  it("lève un 404 quand la citation n'existe pas", async () => {
    prismaMock.citation.findUnique.mockResolvedValue(null);

    await expect(service.findOne('inconnue')).rejects.toThrow(NotFoundException);
  });

  it('met à jour une citation existante', async () => {
    const existing = {
      id: '1',
      text: 'Ancien texte',
      author: null,
      source: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    prismaMock.citation.findUnique.mockResolvedValue(existing);
    prismaMock.citation.update.mockResolvedValue({ ...existing, text: 'Nouveau texte' });

    const result = await service.update('1', { text: 'Nouveau texte' });

    expect(prismaMock.citation.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: { text: 'Nouveau texte' },
    });
    expect(result.text).toBe('Nouveau texte');
  });

  it("refuse de supprimer une citation qui n'existe pas", async () => {
    prismaMock.citation.findUnique.mockResolvedValue(null);

    await expect(service.remove('inconnue')).rejects.toThrow(NotFoundException);
    expect(prismaMock.citation.delete).not.toHaveBeenCalled();
  });
});
