import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProfileService } from './profile.service.js';

describe('ProfileService', () => {
  let service: ProfileService;
  const prismaMock = { user: { findUniqueOrThrow: vi.fn(), update: vi.fn() } };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [ProfileService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = module.get(ProfileService);
  });

  it('saves the first name and the last name', async () => {
    await service.update('user-1', { firstName: 'Vincent', lastName: 'Carpentier' });
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-1' }, data: { firstName: 'Vincent', lastName: 'Carpentier' } }),
    );
  });

  it('clears a value when it is empty', async () => {
    await service.update('user-1', { firstName: 'Vincent', lastName: '' });
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { firstName: 'Vincent', lastName: null } }),
    );
  });
});
