import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AdminAuthService, type AdminUser } from './admin-auth.service.js';

/** The request of an administrator: `admin` is set by AdminJwtGuard. */
export interface AdminRequest extends Request {
  admin: AdminUser;
}

/**
 * MEM-82: every route of the console needs an administration token
 * (`Authorization: Bearer`), checked with ADMIN_JWT_SECRET: 401 otherwise,
 * a user token included.
 */
@Injectable()
export class AdminJwtGuard implements CanActivate {
  constructor(private readonly auth: AdminAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const [scheme, token] = (request.headers.authorization ?? '').split(' ');
    const admin = scheme === 'Bearer' && token ? await this.auth.verify(token) : null;
    if (!admin) throw new UnauthorizedException();
    request.admin = admin;
    return true;
  }
}
