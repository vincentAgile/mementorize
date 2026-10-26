import {
  ConflictException,
  GoneException,
  HttpException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AdminAuthService } from './admin-auth.service.js';
import { decrypt, encryptionKey, timeStep, totpCode } from './totp.js';

const KEY = 'c'.repeat(64);

interface Account {
  id: string;
  email: string;
  passwordHash: string;
  lastLoginAt: Date | null;
  totpSecret: string | null;
  totpEnabledAt: Date | null;
  totpLastStep: number | null;
  totpPendingSecret: string | null;
  totpDisabledAt: Date | null;
}
interface Code {
  adminId: string;
  codeHash: string;
  usedAt: Date | null;
}

/** An in-memory admin_accounts and admin_recovery_codes, enough for the queries of the service. */
function fakePrisma(account: Account) {
  let codes: Code[] = [];
  const events: Record<string, unknown>[] = [];
  const accountMatches = (where: Record<string, unknown>) => {
    if (where.id !== undefined && where.id !== account.id) return false;
    if (where.email !== undefined && where.email !== account.email) return false;
    if (where.totpEnabledAt && account.totpEnabledAt === null) return false;
    const or = where.OR as Record<string, unknown>[] | undefined;
    if (or && 'totpEnabledAt' in or[0]) {
      // verify(): two-step login on, or turned off by the administrator (MEM-88)
      if (account.totpEnabledAt === null && account.totpDisabledAt === null) return false;
    } else if (or) {
      const step = account.totpLastStep;
      const limit = ((where.OR as Record<string, { lt?: number }>[])[1].totpLastStep as { lt: number }).lt;
      if (!(step === null || step < limit)) return false;
    }
    return true;
  };
  const prisma = {
    adminAccount: {
      findUnique: vi.fn(async ({ where }) => (accountMatches(where) ? { ...account } : null)),
      findUniqueOrThrow: vi.fn(async () => ({ ...account })),
      findFirst: vi.fn(async ({ where }) => (accountMatches(where) ? { id: account.id, email: account.email } : null)),
      update: vi.fn(async ({ data }) => Object.assign(account, data)),
      updateMany: vi.fn(async ({ where, data }) => {
        if (!accountMatches(where)) return { count: 0 };
        Object.assign(account, data);
        return { count: 1 };
      }),
    },
    adminRecoveryCode: {
      deleteMany: vi.fn(async () => {
        codes = [];
        return {};
      }),
      createMany: vi.fn(async ({ data }) => {
        codes.push(...(data as Code[]).map((one) => ({ ...one, usedAt: null })));
        return {};
      }),
      updateMany: vi.fn(async ({ where, data }) => {
        const hit = codes.filter((one) => one.codeHash === where.codeHash && one.usedAt === null);
        hit.forEach((one) => Object.assign(one, data));
        return { count: hit.length };
      }),
      count: vi.fn(async () => codes.filter((one) => one.usedAt === null).length),
    },
    adminSecurityEvent: {
      create: vi.fn(async ({ data }) => {
        events.push(data);
        return data;
      }),
    },
    $transaction: vi.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
  };
  return { prisma: prisma as unknown as PrismaService, codes: () => codes, events };
}

describe('AdminAuthService (MEM-82, MEM-86)', () => {
  let passwordHash: string;
  let account: Account;
  let fake: ReturnType<typeof fakePrisma>;
  let auth: AdminAuthService;
  const config = new ConfigService({ ADMIN_JWT_SECRET: 'admin-secret', ADMIN_TOTP_ENCRYPTION_KEY: KEY });
  const NOW = new Date('2026-10-25T20:00:10Z');
  const later = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);
  const IP = '1.2.3.4';

  beforeAll(async () => {
    passwordHash = await bcrypt.hash('the right password', 4);
  });

  beforeEach(() => {
    account = {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'admin@example.fr',
      passwordHash,
      lastLoginAt: null,
      totpSecret: null,
      totpEnabledAt: null,
      totpLastStep: null,
      totpPendingSecret: null,
      totpDisabledAt: null,
    };
    fake = fakePrisma(account);
    auth = new AdminAuthService(fake.prisma, config);
  });

  afterEach(() => vi.useRealTimers());

  /** Through the activation: the secret of the app, and the recovery codes. */
  async function activated(): Promise<{ secret: string; recoveryCodes: string[] }> {
    const { challenge } = await auth.login(account.email, 'the right password', IP, NOW);
    const { secret } = await auth.enrollment(challenge);
    const { recoveryCodes } = await auth.activate(challenge, totpCode(secret, timeStep(NOW)), IP, NOW);
    return { secret, recoveryCodes };
  }

  describe('activation, at the first login', () => {
    it('asks for the activation after the password, without any session yet', async () => {
      const step = await auth.login(' Admin@Example.fr ', 'the right password', IP, NOW);
      expect(step).toMatchObject({ step: 'activation', expiresAt: later(300) });
      expect(await auth.verify(step.challenge)).toBeNull(); // the step is not a session
    });

    it('shows a key, the same until a first code confirms it, stored encrypted', async () => {
      const { challenge } = await auth.login(account.email, 'the right password', IP, NOW);
      const one = await auth.enrollment(challenge);
      const two = await auth.enrollment(challenge);
      expect(one.secret).toMatch(/^[A-Z2-7]{32}$/);
      expect(two.secret).toBe(one.secret);
      expect(one.otpauthUri).toContain(`secret=${one.secret}`);
      expect(account.totpPendingSecret).not.toContain(one.secret);
      expect(decrypt(account.totpPendingSecret!, encryptionKey(KEY)!)).toBe(one.secret);
      expect(account.totpEnabledAt).toBeNull();
    });

    it('turns on with a first valid code: a session, and 10 recovery codes stored hashed', async () => {
      const { challenge } = await auth.login(account.email, 'the right password', IP, NOW);
      const { secret } = await auth.enrollment(challenge);
      await expect(auth.activate(challenge, '000000', IP, NOW)).rejects.toThrow(UnauthorizedException);
      expect(account.totpEnabledAt).toBeNull();

      const session = await auth.activate(challenge, totpCode(secret, timeStep(NOW)), IP, NOW);
      expect(session.recoveryCodes).toHaveLength(10);
      expect(new Set(session.recoveryCodes).size).toBe(10);
      expect(session.recoveryCodesLeft).toBe(10);
      expect(await auth.verify(session.accessToken)).toEqual({ id: account.id, email: account.email });
      expect(account).toMatchObject({ totpEnabledAt: NOW, totpPendingSecret: null, lastLoginAt: NOW });
      expect(JSON.stringify(fake.codes())).not.toContain(session.recoveryCodes[0].replace('-', ''));
      // Once on, no second activation.
      await expect(auth.enrollment(challenge)).rejects.toThrow(ConflictException);
    });
  });

  describe('login with the code', () => {
    it('asks for the code after the password, then opens a session of 2 hours', async () => {
      const { secret } = await activated();
      const step = await auth.login(account.email, 'the right password', IP, later(60));
      expect(step.step).toBe('code');
      const session = await auth.verifyCode(step.challenge, totpCode(secret, timeStep(later(60))), IP, later(60));
      expect(session).toMatchObject({ email: account.email, expiresAt: later(60 + 7200), recoveryCodesLeft: 10 });
    });

    it('accepts 30 s of clock drift either way, not more', async () => {
      const { secret } = await activated();
      const at = later(600);
      const { challenge } = await auth.login(account.email, 'the right password', IP, at);
      await expect(auth.verifyCode(challenge, totpCode(secret, timeStep(at) - 2), IP, at)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(auth.verifyCode(challenge, totpCode(secret, timeStep(at) + 1), IP, at)).resolves.toBeTruthy();
    });

    it('refuses a wrong code, and a code already used', async () => {
      const { secret } = await activated();
      const at = later(120);
      const { challenge } = await auth.login(account.email, 'the right password', IP, at);
      await expect(auth.verifyCode(challenge, '123456', IP, at)).rejects.toThrow(UnauthorizedException);
      const code = totpCode(secret, timeStep(at));
      await auth.verifyCode(challenge, code, IP, at);
      await expect(auth.verifyCode(challenge, code, '5.6.7.8', at)).rejects.toThrow(UnauthorizedException);
    });

    it('accepts each recovery code once, and counts those left', async () => {
      const { recoveryCodes } = await activated();
      const { challenge } = await auth.login(account.email, 'the right password', IP, later(60));
      const session = await auth.verifyCode(challenge, recoveryCodes[3].toUpperCase(), IP, later(60));
      expect(session.recoveryCodesLeft).toBe(9);
      await expect(auth.verifyCode(challenge, recoveryCodes[3], IP, later(61))).rejects.toThrow(UnauthorizedException);
      expect(await auth.profile({ id: account.id, email: account.email })).toMatchObject({ recoveryCodesLeft: 9 });
    });

    it('counts the failed codes with the failed passwords: 5 per address', async () => {
      const { secret } = await activated();
      const at = later(60);
      await expect(auth.login(account.email, 'wrong', IP, at)).rejects.toThrow(UnauthorizedException);
      const { challenge } = await auth.login(account.email, 'the right password', IP, at);
      for (let i = 0; i < 4; i++) await expect(auth.verifyCode(challenge, '000000', IP, at)).rejects.toThrow();
      const blocked = auth.verifyCode(challenge, totpCode(secret, timeStep(at)), IP, at);
      await expect(blocked.catch((e: HttpException) => e.getStatus())).resolves.toBe(429);
    });

    it('ends the step after 5 minutes', async () => {
      const { secret } = await activated();
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(later(60));
      const { challenge } = await auth.login(account.email, 'the right password', IP, later(60));
      vi.setSystemTime(later(60 + 301));
      await expect(auth.verifyCode(challenge, totpCode(secret, timeStep(later(361))), IP, later(361))).rejects.toThrow(
        GoneException,
      );
    });
  });

  describe('sessions', () => {
    it('refuses a user token, a step token, an expired session, a deleted or reset account', async () => {
      const { secret } = await activated();
      const userToken = await new JwtService({ secret: 'users-secret' }).signAsync({ sub: 'user-1' });
      expect(await auth.verify(userToken)).toBeNull();
      // Signed with the admin secret, but without the audience of the sessions.
      const noAudience = await new JwtService({ secret: 'admin-secret' }).signAsync({ sub: account.id });
      expect(await auth.verify(noAudience)).toBeNull();

      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(later(60));
      const { challenge } = await auth.login(account.email, 'the right password', IP, later(60));
      const { accessToken } = await auth.verifyCode(challenge, totpCode(secret, timeStep(later(60))), IP, later(60));
      vi.setSystemTime(later(60 + 7199));
      expect(await auth.verify(accessToken)).toEqual({ id: account.id, email: account.email });
      vi.setSystemTime(later(60 + 7201)); // 2 hours later, even in use: not sliding
      expect(await auth.verify(accessToken)).toBeNull();
      vi.setSystemTime(later(60));
      account.totpEnabledAt = null; // reset on the command line
      expect(await auth.verify(accessToken)).toBeNull();
    });

    it('is off without ADMIN_JWT_SECRET or ADMIN_TOTP_ENCRYPTION_KEY', async () => {
      for (const settings of [{ ADMIN_TOTP_ENCRYPTION_KEY: KEY }, { ADMIN_JWT_SECRET: 'admin-secret' }]) {
        const off = new AdminAuthService(fake.prisma, new ConfigService(settings));
        await expect(off.login(account.email, 'the right password', IP)).rejects.toThrow(ServiceUnavailableException);
      }
    });

    it('refuses a wrong password or an unknown e-mail with the same message', async () => {
      const wrong = auth.login(account.email, 'wrong', IP);
      const unknown = auth.login('nobody@example.fr', 'the right password', IP);
      const messages = await Promise.all([
        wrong.catch((e: Error) => e.message),
        unknown.catch((e: Error) => e.message),
      ]);
      expect(messages[0]).toBe(messages[1]);
    });
  });

  describe('turning the two-step login off and on again (MEM-88)', () => {
    const me = () => ({ id: account.id, email: account.email });

    it('refuses without the right password and a valid code, and never touches the key then', async () => {
      const { secret } = await activated();
      const at = later(90);
      await expect(auth.disableTwoFactor(me(), 'wrong', totpCode(secret, timeStep(at)), IP, at)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(auth.disableTwoFactor(me(), 'the right password', '000000', IP, at)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(auth.disableTwoFactor(me(), 'the right password', '', IP, at)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(account.totpEnabledAt).not.toBeNull();
      expect(fake.events.filter((one) => one.event === '2fa-disabled')).toHaveLength(0);
    });

    it('turns it off with the password and a code: key and recovery codes deleted, journaled', async () => {
      const { secret } = await activated();
      const at = later(90);
      await auth.disableTwoFactor(me(), 'the right password', totpCode(secret, timeStep(at)), '9.9.9.9', at);

      expect(account).toMatchObject({ totpSecret: null, totpEnabledAt: null, totpLastStep: null, totpDisabledAt: at });
      expect(fake.codes()).toHaveLength(0);
      expect(fake.events.at(-1)).toMatchObject({ adminId: account.id, event: '2fa-disabled', ip: '9.9.9.9' });
      expect(await auth.profile(me())).toMatchObject({ twoFactor: { enabled: false, disabledAt: at } });
      await expect(auth.disableTwoFactor(me(), 'the right password', '123456', IP, at)).rejects.toThrow(
        ConflictException,
      );
    });

    it('accepts a recovery code instead of the code of the app', async () => {
      const { recoveryCodes } = await activated();
      await auth.disableTwoFactor(me(), 'the right password', recoveryCodes[0], IP, later(90));
      expect(account.totpEnabledAt).toBeNull();
    });

    it('then logs in with the password alone, for a session', async () => {
      const { secret } = await activated();
      await auth.disableTwoFactor(me(), 'the right password', totpCode(secret, timeStep(later(90))), IP, later(90));

      const login = await auth.login(account.email, 'the right password', IP, later(120));
      expect(login.step).toBe('session');
      const { session } = login as { session: { accessToken: string } };
      expect(await auth.verify(session.accessToken)).toEqual(me());
    });

    it('turns it on again after the password, through the activation, journaled', async () => {
      const { secret } = await activated();
      await auth.disableTwoFactor(me(), 'the right password', totpCode(secret, timeStep(later(90))), IP, later(90));

      await expect(auth.startActivation(me(), 'wrong', IP, later(100))).rejects.toThrow(UnauthorizedException);
      const step = await auth.startActivation(me(), 'the right password', IP, later(100));
      expect(step.step).toBe('activation');
      const { secret: fresh } = await auth.enrollment(step.challenge);
      expect(fresh).not.toBe(secret); // a new key
      const activated2 = await auth.activate(step.challenge, totpCode(fresh, timeStep(later(100))), IP, later(100));
      expect(activated2.recoveryCodes).toHaveLength(10);
      expect(account).toMatchObject({ totpDisabledAt: null, totpEnabledAt: later(100) });
      expect(fake.events.map((one) => one.event)).toEqual(['2fa-enabled', '2fa-disabled', '2fa-enabled']);
      // On again: the code is asked at login.
      expect((await auth.login(account.email, 'the right password', IP, later(130))).step).toBe('code');
      await expect(auth.startActivation(me(), 'the right password', IP, later(130))).rejects.toThrow(ConflictException);
    });
  });
});
