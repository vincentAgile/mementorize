import { Injectable } from '@nestjs/common';
import { AppSettingsService } from '../app-settings/app-settings.service.js';

/** MEM-139: 10 generations per user and per day by default, apart from the messages of the Chat IA. */
export const DEFAULT_GENERATIONS_PER_DAY = 10;
/** MEM-143: the bounds of the console. */
export const MIN_GENERATIONS_PER_DAY = 1;
export const MAX_GENERATIONS_PER_DAY = 200;

/** The key of the parameters of « Générer avec l'IA », apart from those of the Chat IA. */
export const AI_LISTS_SETTINGS_KEY = 'ai-lists';

export interface AiListSettings {
  /** Off: « Générer avec l'IA » is off for everyone, even with an AI configured. */
  enabled: boolean;
  generationsPerDay: number;
}

export const DEFAULT_AI_LIST_SETTINGS: AiListSettings = {
  enabled: true,
  generationsPerDay: DEFAULT_GENERATIONS_PER_DAY,
};

/** What is stored, checked: the defaults for what is missing or wrong. */
export function aiListSettingsOf(value: unknown): AiListSettings {
  const saved = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const perDay = saved.generationsPerDay;
  return {
    enabled: typeof saved.enabled === 'boolean' ? saved.enabled : DEFAULT_AI_LIST_SETTINGS.enabled,
    generationsPerDay:
      Number.isInteger(perDay) &&
      (perDay as number) >= MIN_GENERATIONS_PER_DAY &&
      (perDay as number) <= MAX_GENERATIONS_PER_DAY
        ? (perDay as number)
        : DEFAULT_GENERATIONS_PER_DAY,
  };
}

/**
 * MEM-143: the parameters of « Générer avec l'IA », set in the console
 * (Console › Paramètres): the switch for everyone and the generations per
 * user and per day. Asked at each generation (60 seconds of cache at most),
 * so a change applies at once.
 */
@Injectable()
export class AiListLimitsService {
  constructor(private readonly settings: AppSettingsService) {}

  async current(): Promise<AiListSettings> {
    return aiListSettingsOf(await this.settings.get(AI_LISTS_SETTINGS_KEY));
  }

  async generationsPerDay(): Promise<number> {
    return (await this.current()).generationsPerDay;
  }

  async set(next: AiListSettings): Promise<AiListSettings> {
    await this.settings.set(AI_LISTS_SETTINGS_KEY, { ...next });
    return next;
  }
}
