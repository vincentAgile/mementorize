import {
  ConflictException,
  GoneException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AdminAccount } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { LoginLimiter } from './login-limiter.js';
import {
  decrypt,
  encrypt,
  encryptionKey,
  hashRecoveryCode,
  newRecoveryCode,
  newTotpSecret,
  normalizeRecoveryCode,
  otpauthUri,
  verifyTotp,
} from './totp.js';

/** The `aud` claim of an administration session: never accepted elsewhere, and vice versa. */
export const ADMIN_AUDIENCE = 'mementorize-admin';

/** The `aud` claim of the step between the password and the code (MEM-86): never a session. */
const STEP_AUDIENCE = 'mementorize-admin-step';

/** 2 hours, not sliding: the administrator logs in again. */
export const DEFAULT_ADMIN_SESSION_TTL = 2 * 60 * 60;

/** MEM-86: the step between the password and the code lasts 5 minutes. */
export const LOGIN_STEP_TTL = 5 * 60;

/** MEM-86: how many recovery codes are given at the activation. */
export const RECOVERY_CODE_COUNT = 10;

/** The administrator of a request, once their token is checked. */
export interface AdminUser {
  id: string;
  email: string;
}

export interface AdminSession {
  accessToken: string;
  expiresAt: Date;
  email: string;
  /** MEM-86: the recovery codes not used yet. */
  recoveryCodesLeft: number;
}

/**
 * After the password (MEM-86): the code of the authenticator app is asked
 * (`code`), or, the first time, the two-step login is activated first
 * (`activation`). `challenge` carries the step, for 5 minutes.
 */
export interface LoginStep {
  step: 'code' | 'activation';
  challenge: string;
  expiresAt: Date;
}

/** MEM-88: the administrator turned the two-step login off: the password opens the session. */
export interface LoginDone {
  step: 'session';
  session: AdminSession;
}

/** MEM-88: the two-step login of an account, for its settings. */
export interface TwoFactorState {
  enabled: boolean;
  enabledAt: Date | null;
  disabledAt: Date | null;
}

/** What the activation shows: the key to add to the authenticator app, as text and as QR code. */
export interface Enrollment {
  email: string;
  secret: string;
  otpauthUri: string;
}

/**
 * The login of the administration console: its own accounts
 * (admin_accounts), its own secret (ADMIN_JWT_SECRET) and audience (MEM-82),
 * and a second step, compulsory, by TOTP (MEM-86): the session only exists
 * after a code of the authenticator app, or a recovery code. Without
 * ADMIN_JWT_SECRET or ADMIN_TOTP_ENCRYPTION_KEY, the console is off (503).
 */
@Injectable()
export class AdminAuthService {
  private readonly sessions: JwtService | null;
  private readonly steps: JwtService | null;
  private readonly key: Buffer | null;
  private readonly ttl: number;
  /** One limit for the password and the code, per address (MEM-82, MEM-86). */
  private readonly limiter = new LoginLimiter();
  private readonly logger = new Logger(AdminAuthService.name);
  /** Compared when the e-mail is unknown, so that the answer takes as long (bcrypt). */
  private dummyHash: Promise<string> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const secret = String(config.get('ADMIN_JWT_SECRET') ?? '').trim();
    this.key = encryptionKey(config.get<string>('ADMIN_TOTP_ENCRYPTION_KEY'));
    this.ttl = Number(config.get('ADMIN_SESSION_TTL') ?? DEFAULT_ADMIN_SESSION_TTL);
    const jwt = (audience: string, expiresIn: number) =>
      new JwtService({ secret, signOptions: { expiresIn, audience }, verifyOptions: { audience } });
    this.sessions = secret ? jwt(ADMIN_AUDIENCE, this.ttl) : null;
    this.steps = secret ? jwt(STEP_AUDIENCE, LOGIN_STEP_TTL) : null;
  }

  /**
   * The password: the first step. 401 with the same message whether the
   * e-mail or the password is wrong; 429 after 5 failures in 15 minutes
   * from the same address (`client`), even with the right password.
   */
  async login(email: string, password: string, client: string, now = new Date()): Promise<LoginStep | LoginDone> {
    const { steps } = this.enabled();
    this.notBlocked(client, now);
    const account = await this.prisma.adminAccount.findUnique({ where: { email: email.trim().toLowerCase() } });
    const matches = await bcrypt.compare(password, account?.passwordHash ?? (await this.dummy()));
    if (!account || !matches) {
      this.limiter.fail(client, now.getTime());
      throw new UnauthorizedException('Invalid email or password');
    }
    // MEM-88: turned off by the administrator: the password is enough.
    if (!account.totpEnabledAt && account.totpDisabledAt) {
      this.limiter.succeed(client);
      return { step: 'session', session: await this.session(account, now, false) };
    }
    // Not `succeed` yet: the failures of the code count with those of the password.
    const step = account.totpEnabledAt ? 'code' : 'activation';
    return {
      step,
      challenge: await steps.signAsync({ sub: account.id, step }),
      expiresAt: new Date(now.getTime() + LOGIN_STEP_TTL * 1000),
    };
  }

  /** The key to add to the authenticator app, the same until it is confirmed. */
  async enrollment(challenge: string): Promise<Enrollment> {
    const { key } = this.enabled();
    const account = await this.stepAccount(challenge, 'activation');
    let pending = account.totpPendingSecret;
    if (!pending) {
      pending = encrypt(newTotpSecret(), key);
      await this.prisma.adminAccount.update({ where: { id: account.id }, data: { totpPendingSecret: pending } });
    }
    const secret = decrypt(pending, key);
    return { email: account.email, secret, otpauthUri: otpauthUri(secret, account.email) };
  }

  /**
   * The first code confirms the key: the two-step login is on, the session
   * starts, and the 10 recovery codes are given, this once only.
   */
  async activate(
    challenge: string,
    code: string,
    client: string,
    now = new Date(),
  ): Promise<AdminSession & { recoveryCodes: string[] }> {
    const { key } = this.enabled();
    this.notBlocked(client, now);
    const account = await this.stepAccount(challenge, 'activation');
    const step = account.totpPendingSecret
      ? verifyTotp(decrypt(account.totpPendingSecret, key), code, now, null)
      : null;
    if (step === null) throw this.wrongCode(client, now);

    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, newRecoveryCode);
    await this.prisma.$transaction([
      this.prisma.adminAccount.update({
        where: { id: account.id },
        data: {
          totpSecret: account.totpPendingSecret,
          totpPendingSecret: null,
          totpEnabledAt: now,
          totpLastStep: step,
          totpDisabledAt: null,
        },
      }),
      this.prisma.adminSecurityEvent.create({
        data: { adminId: account.id, email: account.email, event: '2fa-enabled', ip: client },
      }),
      this.prisma.adminRecoveryCode.deleteMany({ where: { adminId: account.id } }),
      this.prisma.adminRecoveryCode.createMany({
        data: recoveryCodes.map((one) => ({ adminId: account.id, codeHash: hashRecoveryCode(one) })),
      }),
    ]);
    this.limiter.succeed(client);
    return { ...(await this.session(account, now)), recoveryCodes };
  }

  /**
   * The second step of a login: a code of the authenticator app (6 digits,
   * 30 s of clock drift either way, never twice), or a recovery code (used
   * up). Only then the session starts.
   */
  async verifyCode(challenge: string, code: string, client: string, now = new Date()): Promise<AdminSession> {
    this.enabled();
    this.notBlocked(client, now);
    const account = await this.stepAccount(challenge, 'code');
    if (!account.totpSecret) throw new GoneException('Login step expired'); // reset meanwhile

    const accepted = await this.checkCode(account, code, now);
    if (!accepted) throw this.wrongCode(client, now);
    this.limiter.succeed(client);
    return this.session(account, now);
  }

  /**
   * MEM-88: turns the two-step login of the logged-in account off. It takes
   * the password and a code (or a recovery code): an open session alone
   * can't weaken the access. The key and the recovery codes are deleted;
   * the next logins only ask for the password. Journaled.
   */
  async disableTwoFactor(admin: AdminUser, password: string, code: string, client: string, now = new Date()) {
    this.enabled();
    this.notBlocked(client, now);
    const account = await this.prisma.adminAccount.findUnique({ where: { id: admin.id } });
    if (!account) throw new UnauthorizedException();
    if (!account.totpEnabledAt) throw new ConflictException('The two-step login is already off');
    const passwordOk = await bcrypt.compare(password, account.passwordHash);
    // The code is checked only with the right password: a wrong password doesn't use up a recovery code.
    if (!passwordOk || !(await this.checkCode(account, code, now))) {
      this.limiter.fail(client, now.getTime());
      throw new UnauthorizedException('Invalid password or code');
    }
    this.limiter.succeed(client);
    await this.prisma.$transaction([
      this.prisma.adminAccount.update({
        where: { id: account.id },
        data: {
          totpSecret: null,
          totpEnabledAt: null,
          totpLastStep: null,
          totpPendingSecret: null,
          totpDisabledAt: now,
        },
      }),
      this.prisma.adminRecoveryCode.deleteMany({ where: { adminId: account.id } }),
      this.prisma.adminSecurityEvent.create({
        data: { adminId: account.id, email: account.email, event: '2fa-disabled', ip: client, createdAt: now },
      }),
    ]);
    this.logger.warn(`Two-step login turned off for ${account.email} from ${client}`);
  }

  /**
   * MEM-88: turns the two-step login on again, after the password: the step
   * of the activation of MEM-86 (QR code, first code, new recovery codes),
   * journaled when the first code confirms it.
   */
  async startActivation(admin: AdminUser, password: string, client: string, now = new Date()): Promise<LoginStep> {
    const { steps } = this.enabled();
    this.notBlocked(client, now);
    const account = await this.prisma.adminAccount.findUnique({ where: { id: admin.id } });
    if (!account) throw new UnauthorizedException();
    if (account.totpEnabledAt) throw new ConflictException('The two-step login is already on');
    if (!(await bcrypt.compare(password, account.passwordHash))) {
      this.limiter.fail(client, now.getTime());
      throw new UnauthorizedException('Invalid password');
    }
    this.limiter.succeed(client);
    return {
      step: 'activation',
      challenge: await steps.signAsync({ sub: account.id, step: 'activation' }),
      expiresAt: new Date(now.getTime() + LOGIN_STEP_TTL * 1000),
    };
  }

  /** The administrator of a session token, or null: invalid, expired, not past the code, or deleted. */
  async verify(token: string): Promise<AdminUser | null> {
    const { sessions } = this.enabled();
    let payload: { sub?: string; mfa?: boolean };
    try {
      payload = await sessions.verifyAsync(token);
    } catch {
      return null;
    }
    if (!payload.sub) return null;
    // Deleted, or its two-step login reset on the command line: out. MEM-88:
    // on, or turned off by the administrator (then the password was enough).
    return this.prisma.adminAccount.findFirst({
      where: { id: payload.sub, OR: [{ totpEnabledAt: { not: null } }, { totpDisabledAt: { not: null } }] },
      select: { id: true, email: true },
    });
  }

  /** The administrator, with their recovery codes left (MEM-86) and their two-step login (MEM-88). */
  async profile(admin: AdminUser): Promise<AdminUser & { recoveryCodesLeft: number; twoFactor: TwoFactorState }> {
    const account = await this.prisma.adminAccount.findUniqueOrThrow({
      where: { id: admin.id },
      select: { totpEnabledAt: true, totpDisabledAt: true },
    });
    return {
      ...admin,
      recoveryCodesLeft: await this.recoveryCodesLeft(admin.id),
      twoFactor: {
        enabled: account.totpEnabledAt !== null,
        enabledAt: account.totpEnabledAt,
        disabledAt: account.totpDisabledAt,
      },
    };
  }

  /**
   * A code of the account: of its authenticator app (6 digits, 30 s of clock
   * drift either way, never twice), or a recovery code (used up).
   */
  private async checkCode(account: AdminAccount, code: string, now: Date): Promise<boolean> {
    const { key } = this.enabled();
    if (!account.totpSecret) return false;
    const step = verifyTotp(decrypt(account.totpSecret, key), code, now, account.totpLastStep);
    if (step !== null) {
      // Conditional: two requests with the same code, only one gets in.
      const { count } = await this.prisma.adminAccount.updateMany({
        where: { id: account.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
        data: { totpLastStep: step },
      });
      return count === 1;
    }
    if (normalizeRecoveryCode(code).length !== 10) return false;
    const { count } = await this.prisma.adminRecoveryCode.updateMany({
      where: { adminId: account.id, codeHash: hashRecoveryCode(code), usedAt: null },
      data: { usedAt: now },
    });
    return count === 1;
  }

  /** `mfa`: the session was opened with a code (MEM-86), or with the password alone (MEM-88). */
  private async session(account: AdminAccount, now: Date, mfa = true): Promise<AdminSession> {
    const { sessions } = this.enabled();
    await this.prisma.adminAccount.update({ where: { id: account.id }, data: { lastLoginAt: now } });
    return {
      accessToken: await sessions.signAsync({ sub: account.id, email: account.email, mfa }),
      expiresAt: new Date(now.getTime() + this.ttl * 1000),
      email: account.email,
      recoveryCodesLeft: await this.recoveryCodesLeft(account.id),
    };
  }

  private recoveryCodesLeft(adminId: string): Promise<number> {
    return this.prisma.adminRecoveryCode.count({ where: { adminId, usedAt: null } });
  }

  /** The account of a login step still running; 410 when it expired (5 minutes) or doesn't match. */
  private async stepAccount(challenge: string, expected: LoginStep['step']): Promise<AdminAccount> {
    const { steps } = this.enabled();
    let payload: { sub?: string; step?: string };
    try {
      payload = await steps.verifyAsync(challenge);
    } catch {
      throw new GoneException('Login step expired');
    }
    const account = payload.sub ? await this.prisma.adminAccount.findUnique({ where: { id: payload.sub } }) : null;
    if (!account || payload.step !== expected) throw new GoneException('Login step expired');
    if (expected === 'activation' && account.totpEnabledAt) throw new ConflictException('Already activated');
    return account;
  }

  private notBlocked(client: string, now: Date): void {
    if (this.limiter.blocked(client, now.getTime())) {
      throw new HttpException('Too many failed logins, try again later', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private wrongCode(client: string, now: Date): UnauthorizedException {
    this.limiter.fail(client, now.getTime());
    return new UnauthorizedException('Invalid code');
  }

  private enabled(): { sessions: JwtService; steps: JwtService; key: Buffer } {
    if (!this.sessions || !this.steps || !this.key) {
      throw new ServiceUnavailableException(
        'The administration console is off (ADMIN_JWT_SECRET or ADMIN_TOTP_ENCRYPTION_KEY missing)',
      );
    }
    return { sessions: this.sessions, steps: this.steps, key: this.key };
  }

  private dummy(): Promise<string> {
    this.dummyHash ??= bcrypt.hash('not an account', 12);
    return this.dummyHash;
  }
}
