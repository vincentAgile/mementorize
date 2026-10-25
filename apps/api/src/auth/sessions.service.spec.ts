import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { REUSE_GRACE_MS, SessionsService } from './sessions.service.js';

interface Row {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  device: string | null;
  sessionStartedAt: Date;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
}

/** An in-memory refresh_tokens table, enough for the queries of the service. */
function fakePrisma() {
  const rows: Row[] = [];
  let next = 0;
  const matches = (row: Row, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([key, value]) => {
      if (key === 'OR') return (value as Record<string, unknown>[]).some((one) => matches(row, one));
      const field = row[key as keyof Row];
      if (value && typeof value === 'object' && !(value instanceof Date)) {
        const condition = value as { lte?: Date; not?: null };
        if ('lte' in condition) return field !== null && (field as Date) <= condition.lte!;
        if ('not' in condition) return field !== null;
      }
      return field === value || (field instanceof Date && value instanceof Date && field.getTime() === value.getTime());
    });
  const refreshToken = {
    create: async ({ data }: { data: Omit<Row, 'id' | 'usedAt' | 'revokedAt'> }) => {
      const id = `00000000-0000-4000-8000-${String(++next).padStart(12, '0')}`;
      rows.push({ ...data, id, usedAt: null, revokedAt: null });
      return { id };
    },
    findUnique: async ({ where }: { where: { id: string } }) => rows.find((row) => row.id === where.id) ?? null,
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
      const hit = rows.filter((row) => matches(row, where));
      hit.forEach((row) => Object.assign(row, data));
      return { count: hit.length };
    },
    deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
      const kept = rows.filter((row) => !matches(row, where));
      const count = rows.length - kept.length;
      rows.splice(0, rows.length, ...kept);
      return { count };
    },
  };
  return { rows, prisma: { refreshToken } as unknown as PrismaService };
}

describe('SessionsService (MEM-85)', () => {
  const T0 = new Date('2026-10-25T18:00:00Z');
  const DAY = 86_400_000;
  const at = (ms: number) => new Date(T0.getTime() + ms);
  let rows: Row[];
  let sessions: SessionsService;

  beforeEach(() => {
    const fake = fakePrisma();
    rows = fake.rows;
    sessions = new SessionsService(fake.prisma, new ConfigService({}));
  });

  it('starts a session with a token valid 30 days, stored hashed with its device', async () => {
    const { refreshToken, refreshExpiresAt } = await sessions.start('user-1', 'Firefox', T0);

    expect(refreshExpiresAt).toEqual(at(30 * DAY));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: 'user-1', device: 'Firefox', sessionStartedAt: T0 });
    const secret = refreshToken.split('.')[1];
    expect(secret.length).toBeGreaterThan(40);
    expect(JSON.stringify(rows)).not.toContain(secret); // never in clear
  });

  it('renews: a new token valid 30 days from now, of the same family; the old one is used', async () => {
    const first = await sessions.start('user-1', 'Firefox', T0);
    const renewed = await sessions.renew(first.refreshToken, at(10 * DAY));

    expect(renewed.userId).toBe('user-1');
    expect(renewed.refreshToken).not.toBe(first.refreshToken);
    expect(renewed.refreshExpiresAt).toEqual(at(40 * DAY)); // the session slides
    expect(rows[1]).toMatchObject({ familyId: rows[0].familyId, device: 'Firefox', sessionStartedAt: T0 });
    expect(rows[0].usedAt).toEqual(at(10 * DAY));

    // And again with the new one.
    await expect(sessions.renew(renewed.refreshToken, at(20 * DAY))).resolves.toMatchObject({ userId: 'user-1' });
  });

  it('revokes the whole family when a used token comes back: a sign of theft', async () => {
    const first = await sessions.start('user-1', 'Firefox', T0);
    const renewed = await sessions.renew(first.refreshToken, at(DAY));
    const other = await sessions.start('user-1', 'Safari', T0); // another device

    await expect(sessions.renew(first.refreshToken, at(2 * DAY))).rejects.toThrow(UnauthorizedException);
    // Even the token of the legitimate browser no longer works: a new login is needed.
    await expect(sessions.renew(renewed.refreshToken, at(2 * DAY))).rejects.toThrow(UnauthorizedException);
    // The other device keeps its session.
    await expect(sessions.renew(other.refreshToken, at(2 * DAY))).resolves.toMatchObject({ userId: 'user-1' });
  });

  it('tolerates the same token from requests sent at once (a short grace)', async () => {
    const first = await sessions.start('user-1', 'Firefox', T0);
    const one = await sessions.renew(first.refreshToken, at(DAY));
    const two = await sessions.renew(first.refreshToken, at(DAY + REUSE_GRACE_MS - 1000));

    await expect(sessions.renew(one.refreshToken, at(2 * DAY))).resolves.toBeTruthy();
    await expect(sessions.renew(two.refreshToken, at(2 * DAY))).resolves.toBeTruthy();
  });

  it('refuses an expired, revoked, unknown or forged token', async () => {
    const first = await sessions.start('user-1', 'Firefox', T0);
    await expect(sessions.renew(first.refreshToken, at(30 * DAY + 1))).rejects.toThrow(UnauthorizedException);

    const [id] = first.refreshToken.split('.');
    await expect(sessions.renew(`${id}.forged-secret`, at(DAY))).rejects.toThrow(UnauthorizedException);
    await expect(sessions.renew('not-a-token', at(DAY))).rejects.toThrow(UnauthorizedException);
    await expect(sessions.renew('00000000-0000-4000-8000-999999999999.x', at(DAY))).rejects.toThrow(
      UnauthorizedException,
    );

    const second = await sessions.start('user-1', 'Firefox', T0);
    await sessions.revoke(second.refreshToken, at(DAY)); // logout
    await expect(sessions.renew(second.refreshToken, at(DAY))).rejects.toThrow(UnauthorizedException);
  });

  it('ends every session of a user at once (revokeAll)', async () => {
    const one = await sessions.start('user-1', 'Firefox', T0);
    const two = await sessions.start('user-1', 'Safari', T0);
    const other = await sessions.start('user-2', 'Firefox', T0);

    await sessions.revokeAll('user-1', at(DAY));

    await expect(sessions.renew(one.refreshToken, at(DAY))).rejects.toThrow(UnauthorizedException);
    await expect(sessions.renew(two.refreshToken, at(DAY))).rejects.toThrow(UnauthorizedException);
    await expect(sessions.renew(other.refreshToken, at(DAY))).resolves.toBeTruthy();
  });

  it('purges the expired and revoked tokens', async () => {
    await sessions.start('user-1', 'Firefox', T0); // expires at 30 days
    const revoked = await sessions.start('user-1', 'Safari', at(20 * DAY));
    await sessions.revoke(revoked.refreshToken, at(21 * DAY));
    await sessions.start('user-2', 'Firefox', at(20 * DAY)); // still valid

    expect(await sessions.purge(at(31 * DAY))).toBe(2);
    expect(rows.map((row) => row.userId)).toEqual(['user-2']);
  });
});
