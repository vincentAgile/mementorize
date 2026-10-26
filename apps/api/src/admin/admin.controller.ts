import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Ip, Post, Req, UseGuards } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service.js';
import { AdminJwtGuard, type AdminRequest } from './admin-jwt.guard.js';
import { type AdminUserList, AdminUsersService } from './admin-users.service.js';
import { AdminLoginDto } from './dto/admin-login.dto.js';
import { AdminChallengeDto, AdminCodeDto, AdminDisableTwoFactorDto, AdminPasswordDto } from './dto/admin-step.dto.js';

/**
 * The routes of the administration console (MEM-82). The API is not on the
 * Internet: only the web app calls it, and it says who its client is in
 * `X-Admin-Client-IP` (the address seen by Traefik), for the limit on
 * failed logins.
 */
@Controller('admin')
export class AdminController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly users: AdminUsersService,
  ) {}

  /**
   * POST /admin/auth/login — the password, first step: then the code
   * (`step: 'code'`), or the activation of the two-step login the first time
   * (`step: 'activation'`), with `challenge`, for 5 minutes (MEM-86). No
   * session yet. 401 (wrong e-mail or password), 429 (too many failures),
   * 503 (console off).
   */
  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: AdminLoginDto, @Headers('x-admin-client-ip') client: string | undefined, @Ip() ip: string) {
    return this.auth.login(dto.email, dto.password, clientOf(client, ip));
  }

  /** POST /admin/auth/enrollment — MEM-86: the key to add to the authenticator app. 410: the step expired. */
  @Post('auth/enrollment')
  @HttpCode(HttpStatus.OK)
  enrollment(@Body() dto: AdminChallengeDto) {
    return this.auth.enrollment(dto.challenge);
  }

  /**
   * POST /admin/auth/activate — MEM-86: a first code confirms the key; the
   * session starts, with the 10 recovery codes, shown this once only.
   */
  @Post('auth/activate')
  @HttpCode(HttpStatus.OK)
  activate(@Body() dto: AdminCodeDto, @Headers('x-admin-client-ip') client: string | undefined, @Ip() ip: string) {
    return this.auth.activate(dto.challenge, dto.code, clientOf(client, ip));
  }

  /**
   * POST /admin/auth/verify — MEM-86: the code of the authenticator app, or
   * a recovery code; the session starts. 401 (wrong or used code), 410 (the
   * step expired), 429 (too many failures).
   */
  @Post('auth/verify')
  @HttpCode(HttpStatus.OK)
  verify(@Body() dto: AdminCodeDto, @Headers('x-admin-client-ip') client: string | undefined, @Ip() ip: string) {
    return this.auth.verifyCode(dto.challenge, dto.code, clientOf(client, ip));
  }

  /** GET /admin/auth/me — the administrator of the token, their recovery codes left and their two-step login. */
  @Get('auth/me')
  @UseGuards(AdminJwtGuard)
  me(@Req() request: AdminRequest) {
    return this.auth.profile(request.admin);
  }

  /**
   * POST /admin/auth/2fa/disable — MEM-88: the logged-in administrator turns
   * their own two-step login off, with their password and a code. 204; 401
   * (wrong password or code), 409 (already off), 429.
   */
  @Post('auth/2fa/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AdminJwtGuard)
  async disableTwoFactor(
    @Req() request: AdminRequest,
    @Body() dto: AdminDisableTwoFactorDto,
    @Headers('x-admin-client-ip') client: string | undefined,
    @Ip() ip: string,
  ): Promise<void> {
    await this.auth.disableTwoFactor(request.admin, dto.password, dto.code, clientOf(client, ip));
  }

  /**
   * POST /admin/auth/2fa/enable — MEM-88: after the password, the step of the
   * activation (as at a first login): POST /admin/auth/enrollment, then
   * /admin/auth/activate. 401 (wrong password), 409 (already on), 429.
   */
  @Post('auth/2fa/enable')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminJwtGuard)
  enableTwoFactor(
    @Req() request: AdminRequest,
    @Body() dto: AdminPasswordDto,
    @Headers('x-admin-client-ip') client: string | undefined,
    @Ip() ip: string,
  ) {
    return this.auth.startActivation(request.admin, dto.password, clientOf(client, ip));
  }

  /** GET /admin/users — MEM-84: the users, their last activity and the number of their items; read only. */
  @Get('users')
  @UseGuards(AdminJwtGuard)
  listUsers(): Promise<AdminUserList> {
    return this.users.list();
  }
}

/** The client of a login: as the web app says (the address seen by Traefik), or as seen here. */
function clientOf(header: string | undefined, ip: string): string {
  return header?.trim() || ip || 'unknown';
}
