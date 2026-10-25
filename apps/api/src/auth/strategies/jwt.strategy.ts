import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ActivityService } from '../../users/activity.service.js';
import type { AuthUser, JwtPayload } from '../auth-user.js';

/**
 * "jwt" = `Authorization: Bearer <token>` header. Passport checks the
 * signature and expiry before calling validate(); if either fails, the
 * request is rejected with a 401 and validate() is never reached.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly activity: ActivityService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  validate(payload: JwtPayload): AuthUser {
    void this.activity.touch(payload.sub); // MEM-83: not awaited, the request doesn't wait for it
    return { id: payload.sub, email: payload.email }; // becomes request.user
  }
}
