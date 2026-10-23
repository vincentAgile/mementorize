import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PreferencesDto } from './dto/preferences.dto.js';
import { PreferencesService } from './preferences.service.js';

@Controller('preferences')
@UseGuards(JwtAuthGuard)
export class PreferencesController {
  constructor(private readonly preferences: PreferencesService) {}

  /** GET /preferences */
  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.preferences.get(user.id);
  }

  /** PUT /preferences { homeSpace?: Quote | Vocabulary | MindMap, translator?: DeepL | Google }: only what is sent changes. */
  @Put()
  update(@CurrentUser() user: AuthUser, @Body() dto: PreferencesDto) {
    return this.preferences.update(user.id, dto);
  }
}
