import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * MEM-144: who may use the Chat IA: the accounts the administrator granted
 * it to, one by one in the console (users.chatAiEnabled, off by default).
 * Read at each request: a change applies at once. It replaces the list of
 * addresses of CONVERSATION_ALLOWED_EMAILS (MEM-130), no longer read.
 */
@Injectable()
export class ConversationAccess {
  constructor(private readonly prisma: PrismaService) {}

  async allows(user: AuthUser | undefined): Promise<boolean> {
    if (!user) return false;
    const account = await this.prisma.user.findUnique({ where: { id: user.id }, select: { chatAiEnabled: true } });
    return account?.chatAiEnabled === true;
  }
}

/** 403 for an account the Chat IA is not granted to (after JwtAuthGuard). */
@Injectable()
export class ConversationAccessGuard implements CanActivate {
  constructor(private readonly access: ConversationAccess) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = context.switchToHttp().getRequest<Request & { user?: AuthUser }>().user;
    if (!(await this.access.allows(user))) {
      throw new ForbiddenException('The Chat IA is not granted to this account');
    }
    return true;
  }
}
