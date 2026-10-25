import {
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { LoginLimiter } from './login-limiter.js';

/** The `aud` claim of an administration token: never accepted elsewhere, and vice versa. */
export const ADMIN_AUDIENCE = 'mementorize-admin';

/** 2 hours, not sliding: the administrator logs in again. */
export const DEFAULT_ADMIN_SESSION_TTL = 2 * 60 * 60;

/** The administrator of a request, once their token is checked. */
export interface AdminUser {
  id: string;
  email: string;
}

export interface AdminSession {
  accessToken: string;
  expiresAt: Date;
  email: string;
}

/**
 * MEM-82: the login of the administration console. Its own accounts
 * (admin_accounts), its own secret (ADMIN_JWT_SECRET) and audience: a user
 * token is never an administration token, nor the other way round. Without
 * ADMIN_JWT_SECRET, the console is off (503).
 */
@Injectable()
export class AdminAuthService {
  private readonly jwt: JwtService | null;
  private readonly ttl: number;
  private readonly limiter = new LoginLimiter();
  /** Compared when the e-mail is unknown, so that the answer takes as long (bcrypt). */
  private dummyHash: Promise<string> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const secret = String(config.get('ADMIN_JWT_SECRET') ?? '').trim();
    this.ttl = Number(config.get('ADMIN_SESSION_TTL') ?? DEFAULT_ADMIN_SESSION_TTL);
    this.jwt = secret
      ? new JwtService({
          secret,
          signOptions: { expiresIn: this.ttl, audience: ADMIN_AUDIENCE },
          verifyOptions: { audience: ADMIN_AUDIENCE },
        })
      : null;
  }

  /**
   * A session of the console. 401 with the same message whether the e-mail
   * or the password is wrong; 429 after 5 failures in 15 minutes from the
   * same address (`client`), even with the right password.
   */
  async login(email: string, password: string, client: string, now = new Date()): Promise<AdminSession> {
    const jwt = this.enabled();
    if (this.limiter.blocked(client, now.getTime())) {
      throw new HttpException('Too many failed logins, try again later', HttpStatus.TOO_MANY_REQUESTS);
    }
    const account = await this.prisma.adminAccount.findUnique({ where: { email: email.trim().toLowerCase() } });
    const matches = await bcrypt.compare(password, account?.passwordHash ?? (await this.dummy()));
    if (!account || !matches) {
      this.limiter.fail(client, now.getTime());
      throw new UnauthorizedException('Invalid email or password');
    }
    this.limiter.succeed(client);
    await this.prisma.adminAccount.update({ where: { id: account.id }, data: { lastLoginAt: now } });
    return {
      accessToken: await jwt.signAsync({ sub: account.id, email: account.email }),
      expiresAt: new Date(now.getTime() + this.ttl * 1000),
      email: account.email,
    };
  }

  /** The administrator of a token, or null: invalid, expired, or their account was deleted. */
  async verify(token: string): Promise<AdminUser | null> {
    const jwt = this.enabled();
    let payload: { sub?: string };
    try {
      payload = await jwt.verifyAsync(token);
    } catch {
      return null;
    }
    if (!payload.sub) return null;
    const account = await this.prisma.adminAccount.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true },
    });
    return account;
  }

  private enabled(): JwtService {
    if (!this.jwt) throw new ServiceUnavailableException('The administration console is off (no ADMIN_JWT_SECRET)');
    return this.jwt;
  }

  private dummy(): Promise<string> {
    this.dummyHash ??= bcrypt.hash('not an account', 12);
    return this.dummyHash;
  }
}
