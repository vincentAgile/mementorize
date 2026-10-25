import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Ip, Post, Req, UseGuards } from '@nestjs/common';
import { AdminAuthService, type AdminUser } from './admin-auth.service.js';
import { AdminJwtGuard, type AdminRequest } from './admin-jwt.guard.js';
import { AdminLoginDto } from './dto/admin-login.dto.js';

/**
 * The routes of the administration console (MEM-82). The API is not on the
 * Internet: only the web app calls it, and it says who its client is in
 * `X-Admin-Client-IP` (the address seen by Traefik), for the limit on
 * failed logins.
 */
@Controller('admin')
export class AdminController {
  constructor(private readonly auth: AdminAuthService) {}

  /** POST /admin/auth/login — 401 (wrong e-mail or password), 429 (too many failures), 503 (console off). */
  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: AdminLoginDto, @Headers('x-admin-client-ip') client: string | undefined, @Ip() ip: string) {
    return this.auth.login(dto.email, dto.password, client?.trim() || ip || 'unknown');
  }

  /** GET /admin/auth/me — the administrator of the token. */
  @Get('auth/me')
  @UseGuards(AdminJwtGuard)
  me(@Req() request: AdminRequest): AdminUser {
    return request.admin;
  }
}
