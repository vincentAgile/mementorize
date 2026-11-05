import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth-user.js';

/**
 * MEM-130: who may use the conversations with the AI, while they are tried
 * out. CONVERSATION_ALLOWED_EMAILS: e-mail addresses separated by commas, or
 * `*` for everyone; empty, nobody.
 */
@Injectable()
export class ConversationAccess {
  private readonly everyone: boolean;
  private readonly emails: Set<string>;

  constructor(config: ConfigService) {
    const value = String(config.get('CONVERSATION_ALLOWED_EMAILS') ?? '').trim();
    this.everyone = value === '*';
    this.emails = new Set(
      value
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter((email) => email && email !== '*'),
    );
  }

  allows(user: AuthUser | undefined): boolean {
    return !!user && (this.everyone || this.emails.has(user.email.trim().toLowerCase()));
  }
}

/** 403 for an account that may not use the conversations (after JwtAuthGuard). */
@Injectable()
export class ConversationAccessGuard implements CanActivate {
  constructor(private readonly access: ConversationAccess) {}

  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<Request & { user?: AuthUser }>().user;
    if (!this.access.allows(user)) {
      throw new ForbiddenException('The conversations with the AI are not open to this account');
    }
    return true;
  }
}
