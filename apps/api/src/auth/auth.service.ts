import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { ActivityService } from '../users/activity.service.js';
import { UsersService } from '../users/users.service.js';
import type { AuthUser, JwtPayload } from './auth-user.js';
import { RegisterDto } from './dto/register.dto.js';
import { type IssuedRefreshToken, SessionsService } from './sessions.service.js';

// Cost factor: each +1 doubles the hashing time. 12 is a common default
// (a few hundred ms), slow enough to make brute force expensive.
const BCRYPT_ROUNDS = 12;

/**
 * A session (MEM-85): a short access token, sent to the API with each call,
 * and a long renewal token, to get a new access token without the password.
 */
export interface Session extends IssuedRefreshToken {
  accessToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly activity: ActivityService,
    private readonly sessions: SessionsService,
  ) {}

  /** `device`: the browser (its User-Agent), kept with the session. */
  async register(dto: RegisterDto, device?: string): Promise<Session> {
    const email = dto.email.trim().toLowerCase();
    if (await this.usersService.findByEmail(email)) {
      throw new ConflictException('An account already exists for this email');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.usersService.create(email, passwordHash);
    return this.login({ id: user.id, email: user.email }, device);
  }

  /**
   * Used by LocalStrategy. Returns null (never throws) on bad credentials,
   * without telling whether the email or the password was wrong.
   */
  async validateUser(email: string, password: string): Promise<AuthUser | null> {
    const user = await this.usersService.findByEmail(email.trim().toLowerCase());
    if (!user) {
      return null;
    }
    const matches = await bcrypt.compare(password, user.passwordHash);
    return matches ? { id: user.id, email: user.email } : null;
  }

  /** A new session on a device. */
  async login(user: AuthUser, device?: string): Promise<Session> {
    void this.activity.touch(user.id); // MEM-83: a login is an activity
    const refresh = await this.sessions.start(user.id, device);
    return { accessToken: await this.accessToken(user), ...refresh };
  }

  /**
   * The silent renewal of a session (MEM-85): a new access token and a new
   * renewal token for the one presented, which can't be used again. 401
   * when the session is over. An activity of the user (MEM-83).
   */
  async refresh(refreshToken: string): Promise<Session> {
    const { userId, ...refresh } = await this.sessions.renew(refreshToken);
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('Session expired');
    void this.activity.touch(user.id);
    return { accessToken: await this.accessToken({ id: user.id, email: user.email }), ...refresh };
  }

  /** Logout: the session of this device ends. */
  logout(refreshToken: string): Promise<void> {
    return this.sessions.revoke(refreshToken);
  }

  private accessToken(user: AuthUser): Promise<string> {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    return this.jwtService.signAsync(payload);
  }
}
