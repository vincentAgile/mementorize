import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('answers ok when the database answers', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]) };
    await expect(new HealthController(prisma as unknown as PrismaService).check()).resolves.toEqual({ status: 'ok' });
  });

  it('answers 503 when the database does not', async () => {
    const prisma = { $queryRaw: vi.fn().mockRejectedValue(new Error('connection refused')) };
    await expect(new HealthController(prisma as unknown as PrismaService).check()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
