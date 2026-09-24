import { ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  let service: AuthService;

  const usersMock = {
    findByEmail: vi.fn(),
    create: vi.fn(),
  };
  const jwtMock = {
    signAsync: vi.fn().mockResolvedValue('signed.jwt.token'),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    jwtMock.signAsync.mockResolvedValue('signed.jwt.token');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersMock },
        { provide: JwtService, useValue: jwtMock },
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

      const result = await service.register({ email: ' Vincent@Example.com ', password: 'correct horse' });

      const [email, passwordHash] = usersMock.create.mock.calls[0];
      expect(email).toBe('vincent@example.com'); // normalized
      expect(passwordHash).not.toBe('correct horse');
      expect(await bcrypt.compare('correct horse', passwordHash)).toBe(true);
      expect(jwtMock.signAsync).toHaveBeenCalledWith({ sub: 'user-1', email: 'vincent@example.com' });
      expect(result).toEqual({ accessToken: 'signed.jwt.token' });
    });

    it('refuses an email that is already taken', async () => {
      usersMock.findByEmail.mockResolvedValue({ id: 'existing' });

      await expect(
        service.register({ email: 'vincent@example.com', password: 'whatever123' }),
      ).rejects.toThrow(ConflictException);
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
});
