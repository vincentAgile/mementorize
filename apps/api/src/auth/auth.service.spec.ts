import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityService } from '../users/activity.service.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import { SessionsService } from './sessions.service.js';

describe('AuthService', () => {
  let service: AuthService;

  const usersMock = {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
  };
  const activityMock = { touch: vi.fn().mockResolvedValue(undefined) };
  const EXPIRES = new Date('2026-11-24T18:00:00Z');
  const sessionsMock = {
    start: vi.fn(),
    renew: vi.fn(),
    revoke: vi.fn(),
  };
  const jwtMock = {
    signAsync: vi.fn().mockResolvedValue('signed.jwt.token'),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    jwtMock.signAsync.mockResolvedValue('signed.jwt.token');
    sessionsMock.start.mockResolvedValue({ refreshToken: 'refresh-1', refreshExpiresAt: EXPIRES });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersMock },
        { provide: JwtService, useValue: jwtMock },
        { provide: ActivityService, useValue: activityMock },
        { provide: SessionsService, useValue: sessionsMock },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('register', () => {
    it('stores a bcrypt hash, never the plain password, and returns a token', async () => {
      usersMock.findByEmail.mockResolvedValue(null);
      usersMock.create.mockImplementation((email: string, passwordHash: string) => ({
        id: 'user-1',
        email,
        passwordHash,
      }));

      const result = await service.register({ email: ' Vincent@Example.com ', password: 'correct horse' }, 'Firefox');

      const [email, passwordHash] = usersMock.create.mock.calls[0];
      expect(email).toBe('vincent@example.com'); // normalized
      expect(passwordHash).not.toBe('correct horse');
      expect(await bcrypt.compare('correct horse', passwordHash)).toBe(true);
      expect(jwtMock.signAsync).toHaveBeenCalledWith({ sub: 'user-1', email: 'vincent@example.com' });
      // MEM-85: a session, with its renewal token, for this browser.
      expect(result).toEqual({ accessToken: 'signed.jwt.token', refreshToken: 'refresh-1', refreshExpiresAt: EXPIRES });
      expect(sessionsMock.start).toHaveBeenCalledWith('user-1', 'Firefox');
    });

    it('refuses an email that is already taken', async () => {
      usersMock.findByEmail.mockResolvedValue({ id: 'existing' });

      await expect(service.register({ email: 'vincent@example.com', password: 'whatever123' })).rejects.toThrow(
        ConflictException,
      );
      expect(usersMock.create).not.toHaveBeenCalled();
    });
  });

  describe('validateUser', () => {
    // Low cost factor: tests don't need to be slow on purpose.
    const passwordHash = bcrypt.hashSync('correct horse', 4);
    const storedUser = { id: 'user-1', email: 'vincent@example.com', passwordHash };

    it('returns the user (without the hash) when the password matches', async () => {
      usersMock.findByEmail.mockResolvedValue(storedUser);

      const user = await service.validateUser('vincent@example.com', 'correct horse');

      expect(user).toEqual({ id: 'user-1', email: 'vincent@example.com' });
    });

    it('returns null on a wrong password', async () => {
      usersMock.findByEmail.mockResolvedValue(storedUser);

      expect(await service.validateUser('vincent@example.com', 'wrong')).toBeNull();
    });

    it('returns null for an unknown email', async () => {
      usersMock.findByEmail.mockResolvedValue(null);

      expect(await service.validateUser('nobody@example.com', 'correct horse')).toBeNull();
    });
  });

  describe('login', () => {
    it('records the activity of the user (MEM-83)', async () => {
      await service.login({ id: 'user-1', email: 'a@b.c' });
      expect(activityMock.touch).toHaveBeenCalledWith('user-1');
    });
  });

  describe('refresh (MEM-85)', () => {
    it('gives a new access token and a new renewal token, and records the activity (MEM-83)', async () => {
      sessionsMock.renew.mockResolvedValue({ userId: 'user-1', refreshToken: 'refresh-2', refreshExpiresAt: EXPIRES });
      usersMock.findById.mockResolvedValue({ id: 'user-1', email: 'a@b.c' });

      const session = await service.refresh('refresh-1');

      expect(session).toEqual({
        accessToken: 'signed.jwt.token',
        refreshToken: 'refresh-2',
        refreshExpiresAt: EXPIRES,
      });
      expect(jwtMock.signAsync).toHaveBeenCalledWith({ sub: 'user-1', email: 'a@b.c' });
      expect(activityMock.touch).toHaveBeenCalledWith('user-1');
    });

    it('refuses when the account no longer exists', async () => {
      sessionsMock.renew.mockResolvedValue({ userId: 'gone', refreshToken: 'r', refreshExpiresAt: EXPIRES });
      usersMock.findById.mockResolvedValue(null);
      await expect(service.refresh('refresh-1')).rejects.toThrow(UnauthorizedException);
    });
  });
});
