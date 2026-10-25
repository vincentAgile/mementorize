import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';

/** 30 days: without any use for that long, the session ends. */
export const DEFAULT_REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60;

/**
 * A token presented again this soon after it was exchanged is not a theft:
 * the requests of one page, sent at once, each try to renew the session
 * with the same token. They get a new token of the same family.
 */
export const REUSE_GRACE_MS = 30 * 1000;

/** The longest User-Agent kept. */
const DEVICE_MAX_LENGTH = 300;

/** A renewal token, as given to the browser, and when it expires. */
export interface IssuedRefreshToken {
  refreshToken: string;
  refreshExpiresAt: Date;
}

const hash = (secret: string) => createHash('sha256').update(secret).digest('hex');

/**
 * The renewal tokens of the sliding sessions (MEM-85). A token is
 * `<id>.<secret>`: the id finds its row, the secret is checked against its
 * hash. Each renewal exchanges it for a new one, valid 30 days from then:
 * that's what makes the session slide. One family of tokens per login on a
 * device; a token used twice (past a short grace) revokes its family.
 */
@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);
  private readonly ttlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.ttlMs = Number(config.get('REFRESH_TOKEN_TTL') ?? DEFAULT_REFRESH_TOKEN_TTL) * 1000;
  }

  /** A new session (a login, a registration): the first token of a new family. */
  start(userId: string, device: string | undefined, now = new Date()): Promise<IssuedRefreshToken> {
    return this.issue(userId, { familyId: randomBytes(16).toString('hex'), sessionStartedAt: now }, device, now);
  }

  /**
   * Exchanges a token for a new one of the same family: returns the user,
   * and the new token. 401 when it is unknown, expired, revoked, or was
   * already used (then its whole family is revoked: the session ends).
   */
  async renew(token: string, now = new Date()): Promise<{ userId: string } & IssuedRefreshToken> {
    const row = await this.find(token);
    if (!row || row.revokedAt || row.expiresAt <= now) throw new UnauthorizedException('Session expired');

    // Mark it used; only one request can do it.
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: now },
    });
    if (count === 0) {
      const used = await this.prisma.refreshToken.findUnique({ where: { id: row.id }, select: { usedAt: true } });
      if (!used?.usedAt || now.getTime() - used.usedAt.getTime() > REUSE_GRACE_MS) {
        await this.revokeFamily(row.familyId, now);
        this.logger.warn(`Renewal token reused for user ${row.userId}: the session of that device is revoked`);
        throw new UnauthorizedException('Session expired');
      }
    }
    const issued = await this.issue(row.userId, row, row.device ?? undefined, now);
    return { userId: row.userId, ...issued };
  }

  /** Logout: the session of the device ends (its family is revoked). Unknown tokens are ignored. */
  async revoke(token: string, now = new Date()): Promise<void> {
    const row = await this.find(token);
    if (row) await this.revokeFamily(row.familyId, now);
  }

  /** Every session of the user ends: for a change of password, the day it exists. */
  async revokeAll(userId: string, now = new Date()): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
  }

  /** Every night: the expired and revoked tokens leave the database. */
  @Cron('17 3 * * *', { name: 'refresh-tokens-purge', waitForCompletion: true })
  async purge(now = new Date()): Promise<number> {
    const { count } = await this.prisma.refreshToken.deleteMany({
      where: { OR: [{ expiresAt: { lte: now } }, { revokedAt: { not: null } }] },
    });
    if (count > 0) this.logger.log(`${count} expired or revoked renewal tokens purged`);
    return count;
  }

  private async issue(
    userId: string,
    family: { familyId: string; sessionStartedAt: Date },
    device: string | undefined,
    now: Date,
  ): Promise<IssuedRefreshToken> {
    const secret = randomBytes(32).toString('base64url');
    const refreshExpiresAt = new Date(now.getTime() + this.ttlMs);
    const row = await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId: family.familyId,
        sessionStartedAt: family.sessionStartedAt,
        device: device?.slice(0, DEVICE_MAX_LENGTH) || null,
        tokenHash: hash(secret),
        createdAt: now,
        expiresAt: refreshExpiresAt,
      },
      select: { id: true },
    });
    return { refreshToken: `${row.id}.${secret}`, refreshExpiresAt };
  }

  /** The row of a token whose secret matches, or null. */
  private async find(token: string) {
    const [id, secret] = typeof token === 'string' ? token.split('.') : [];
    if (!id || !secret || !/^[0-9a-f-]{36}$/.test(id)) return null;
    const row = await this.prisma.refreshToken.findUnique({ where: { id } });
    if (!row) return null;
    const expected = Buffer.from(row.tokenHash, 'hex');
    const actual = Buffer.from(hash(secret), 'hex');
    return expected.length === actual.length && timingSafeEqual(expected, actual) ? row : null;
  }

  private async revokeFamily(familyId: string, now: Date): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: now } });
  }
}
