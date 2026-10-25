import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import type { AuthUser } from './auth-user.js';
import { CurrentUser } from './current-user.decorator.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { LocalAuthGuard } from './guards/local-auth.guard.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** Creates the account and logs the user in right away. */
  @Post('register')
  register(@Body() dto: RegisterDto, @Headers('user-agent') device?: string) {
    return this.authService.register(dto, device);
  }

  /**
   * LocalAuthGuard checks email + password before this method runs. The
   * User-Agent (the browser's, forwarded by the web app) is kept with the
   * session (MEM-85).
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(LocalAuthGuard)
  login(@CurrentUser() user: AuthUser, @Headers('user-agent') device?: string) {
    return this.authService.login(user, device);
  }

  /**
   * MEM-85: a new access token, and a new renewal token for the one sent
   * (which can't be used again). 401 when the session is over.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  /** MEM-85: ends the session of the device. Without an access token: it may have expired. */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Body() dto: RefreshTokenDto): Promise<void> {
    return this.authService.logout(dto.refreshToken);
  }

  /** Handy to check a token: returns who it belongs to. */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}
