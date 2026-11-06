import { type CanActivate, type ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { LoginLimiter } from '../admin/login-limiter.js';
import type { AuthUser } from '../auth/auth-user.js';
import { REQUESTS_PER_SECOND } from './conversation-limits.js';

/** MEM-130: at most 3 requests per second and per user on the conversations (after JwtAuthGuard). */
@Injectable()
export class ConversationRateGuard implements CanActivate {
  private readonly limiter = new LoginLimiter(REQUESTS_PER_SECOND, 1000);

  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<Request & { user?: AuthUser }>().user;
    if (!user) return true;
    const now = Date.now();
    if (this.limiter.blocked(user.id, now)) {
      throw new HttpException(
        { statusCode: HttpStatus.TOO_MANY_REQUESTS, reason: 'rate-limit', message: 'Too many requests: slow down' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.limiter.fail(user.id, now); // counts the request
    return true;
  }
}

/**
 * MEM-132: the same limit, 3 per second, for the sentences read aloud, but
 * counted apart: reading a reply never prevents sending the next message.
 */
@Injectable()
export class ConversationSpeechRateGuard extends ConversationRateGuard {}
