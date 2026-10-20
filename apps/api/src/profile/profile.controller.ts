import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ProfileDto } from './dto/profile.dto.js';
import { ProfileService } from './profile.service.js';

@Controller('profile')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  /** GET /profile — { email, firstName, lastName } */
  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.profile.get(user.id);
  }

  /** PUT /profile { firstName, lastName } — trimmed, at most 80 characters each; '' clears a value. */
  @Put()
  update(@CurrentUser() user: AuthUser, @Body() dto: ProfileDto) {
    return this.profile.update(user.id, dto);
  }
}
