import { Body, Controller, Get, HttpCode, Post, Put, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ReminderSettingsDto, UnsubscribeDto } from './dto/reminder-settings.dto.js';
import { RemindersService } from './reminders.service.js';

@Controller('reminders')
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  /** GET /reminders/settings */
  @Get('settings')
  @UseGuards(JwtAuthGuard)
  getSettings(@CurrentUser() user: AuthUser) {
    return this.reminders.getSettings(user.id);
  }

  /** PUT /reminders/settings { enabled, hour, timeZone } */
  @Put('settings')
  @UseGuards(JwtAuthGuard)
  updateSettings(@CurrentUser() user: AuthUser, @Body() dto: ReminderSettingsDto) {
    return this.reminders.updateSettings(user.id, dto);
  }

  /** POST /reminders/test — sends the reminder now, to check the e-mails. */
  @Post('test')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  sendTest(@CurrentUser() user: AuthUser): Promise<void> {
    return this.reminders.sendTest(user.id);
  }

  /** POST /reminders/unsubscribe { user, token } — public: the link of the e-mail. */
  @Post('unsubscribe')
  @HttpCode(204)
  unsubscribe(@Body() dto: UnsubscribeDto): Promise<void> {
    return this.reminders.unsubscribe(dto.user, dto.token);
  }
}
