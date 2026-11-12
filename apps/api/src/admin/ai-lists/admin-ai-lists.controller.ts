import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { IsBoolean, IsInt, Max, Min } from 'class-validator';
import {
  type AiListSettings,
  AiListLimitsService,
  MAX_GENERATIONS_PER_DAY,
  MIN_GENERATIONS_PER_DAY,
} from '../../ai-lists/ai-list-limits.js';
import { AiListUsageService, type UsageReport } from '../../ai-lists/ai-list-usage.service.js';
import { type AiListState, AiListsService } from '../../ai-lists/ai-lists.service.js';
import { AdminJwtGuard } from '../admin-jwt.guard.js';

export class AiListSettingsDto {
  @IsBoolean()
  enabled!: boolean;

  @IsInt()
  @Min(MIN_GENERATIONS_PER_DAY)
  @Max(MAX_GENERATIONS_PER_DAY)
  generationsPerDay!: number;
}

export type AdminAiListSettings = AiListSettings & { state: AiListState };

/**
 * MEM-143: « Générer avec l'IA » in the console: its parameters (Console ›
 * Paramètres) and what it costs (Console › Consommation IA). Apart from the
 * Chat IA: turning one off leaves the other. Every route needs an
 * administration token (AdminJwtGuard): 401 with a user token.
 */
@Controller('admin/ai-lists')
@UseGuards(AdminJwtGuard)
export class AdminAiListsController {
  constructor(
    private readonly limits: AiListLimitsService,
    private readonly aiLists: AiListsService,
    private readonly usage: AiListUsageService,
  ) {}

  /** GET /admin/ai-lists/settings — { enabled, generationsPerDay, state }. */
  @Get('settings')
  async settings(): Promise<AdminAiListSettings> {
    const [settings, state] = await Promise.all([this.limits.current(), this.aiLists.state()]);
    return { ...settings, state };
  }

  /** PUT /admin/ai-lists/settings { enabled, generationsPerDay (1 to 200) } — applies at once. */
  @Put('settings')
  async update(@Body() dto: AiListSettingsDto): Promise<AdminAiListSettings> {
    const settings = await this.limits.set({ enabled: dto.enabled, generationsPerDay: dto.generationsPerDay });
    return { ...settings, state: await this.aiLists.state() };
  }

  /** GET /admin/ai-lists/usage — the last 30 days, and the 10 biggest users of the month; numbers only. */
  @Get('usage')
  usageReport(): Promise<UsageReport> {
    return this.usage.report();
  }
}
