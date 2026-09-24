import { ConflictException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service.js';
import type { AuthUser, JwtPayload } from './auth-user.js';
import { RegisterDto } from './dto/register.dto.js';

// Cost factor: each +1 doubles the hashing time. 12 is a common default
// (a few hundred ms), slow enough to make brute force expensive.
const BCRYPT_ROUNDS = 12;

export interface AccessToken {
  accessToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AccessToken> {
    const email = dto.email.trim().toLowerCase();
    if (await this.usersService.findByEmail(email)) {
      throw new ConflictException('An account already exists for this email');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.usersService.create(email, passwordHash);
    return this.login({ id: user.id, email: user.email });
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

  async login(user: AuthUser): Promise<AccessToken> {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    return { accessToken: await this.jwtService.signAsync(payload) };
  }
}
