import { HttpException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AdminAuthService } from './admin-auth.service.js';

describe('AdminAuthService (MEM-82)', () => {
  const account = { id: 'admin-1', email: 'admin@example.fr', passwordHash: '' };
  const prisma = {
    adminAccount: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  const config = new ConfigService({ ADMIN_JWT_SECRET: 'admin-secret', ADMIN_SESSION_TTL: '7200' });
  let auth: AdminAuthService;

  beforeAll(async () => {
    account.passwordHash = await bcrypt.hash('the right password', 4);
  });

  beforeEach(() => {
    prisma.adminAccount.findUnique
      .mockReset()
      .mockImplementation(({ where }) =>
        Promise.resolve(where.email === account.email || where.id === account.id ? account : null),
      );
    auth = new AdminAuthService(prisma as unknown as PrismaService, config);
  });

  afterEach(() => vi.useRealTimers());

  it('opens a session of 2 hours with the right password, and records the login', async () => {
    const now = new Date('2026-10-25T18:00:00Z');
    const session = await auth.login(' Admin@Example.fr ', 'the right password', '1.2.3.4', now);

    expect(session).toMatchObject({ email: 'admin@example.fr', expiresAt: new Date('2026-10-25T20:00:00Z') });
    expect(await auth.verify(session.accessToken)).toEqual(account);
    expect(prisma.adminAccount.update).toHaveBeenCalledWith({ where: { id: 'admin-1' }, data: { lastLoginAt: now } });
  });

  it('refuses a wrong password or an unknown e-mail with the same message', async () => {
    const wrong = auth.login('admin@example.fr', 'wrong', '1.2.3.4');
    const unknown = auth.login('nobody@example.fr', 'the right password', '1.2.3.4');
    await expect(wrong).rejects.toThrow(UnauthorizedException);
    await expect(unknown).rejects.toThrow(UnauthorizedException);
    const messages = await Promise.all([wrong.catch((e: Error) => e.message), unknown.catch((e: Error) => e.message)]);
    expect(messages[0]).toBe(messages[1]);
  });

  it('refuses any login from an address after 5 failures, even the right password', async () => {
    for (let i = 0; i < 5; i++) await expect(auth.login(account.email, 'wrong', '1.2.3.4')).rejects.toThrow();
    const blocked = auth.login(account.email, 'the right password', '1.2.3.4');
    await expect(blocked).rejects.toThrow(HttpException);
    await expect(blocked.catch((e: HttpException) => e.getStatus())).resolves.toBe(429);
    // Another address still gets in.
    await expect(auth.login(account.email, 'the right password', '5.6.7.8')).resolves.toBeTruthy();
  });

  it('refuses a user token, an expired session, and the token of a deleted account', async () => {
    const userToken = await new JwtService({ secret: 'users-secret' }).signAsync({ sub: 'user-1', email: 'u@x.fr' });
    expect(await auth.verify(userToken)).toBeNull();
    // Even signed with the admin secret, without the audience of the console.
    expect(
      await new JwtService({ secret: 'admin-secret' }).signAsync({ sub: 'admin-1' }).then((t) => auth.verify(t)),
    ).toBeNull();

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-25T18:00:00Z'));
    const { accessToken } = await auth.login(account.email, 'the right password', '1.2.3.4');
    vi.setSystemTime(new Date('2026-10-25T19:59:00Z'));
    expect(await auth.verify(accessToken)).toEqual(account);
    vi.setSystemTime(new Date('2026-10-25T20:00:01Z')); // 2 hours later, even in use: not sliding
    expect(await auth.verify(accessToken)).toBeNull();
    vi.useRealTimers();

    const fresh = await auth.login(account.email, 'the right password', '1.2.3.4');
    prisma.adminAccount.findUnique.mockResolvedValue(null); // deleted on the command line
    expect(await auth.verify(fresh.accessToken)).toBeNull();
  });

  it('is off without ADMIN_JWT_SECRET', async () => {
    const off = new AdminAuthService(prisma as unknown as PrismaService, new ConfigService({}));
    await expect(off.login(account.email, 'the right password', '1.2.3.4')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
