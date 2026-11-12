import { describe, expect, it, vi } from 'vitest';
import { AppSettingsService, SETTINGS_CACHE_MS } from '../app-settings/app-settings.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { aiListSettingsOf } from './ai-list-limits.js';

describe('The parameters of « Générer avec l’IA » (MEM-143)', () => {
  it('what is stored, checked: the defaults for what is missing or wrong', () => {
    expect(aiListSettingsOf(null)).toEqual({ enabled: true, generationsPerDay: 10 });
    expect(aiListSettingsOf({ enabled: false, generationsPerDay: 25 })).toEqual({
      enabled: false,
      generationsPerDay: 25,
    });
    for (const generationsPerDay of [0, 201, 2.5, '10', null]) {
      expect(aiListSettingsOf({ enabled: false, generationsPerDay }).generationsPerDay).toBe(10);
    }
    expect(aiListSettingsOf({ enabled: 'no' }).enabled).toBe(true);
    expect(aiListSettingsOf([1, 2])).toEqual({ enabled: true, generationsPerDay: 10 });
  });

  it('read again after 60 seconds at most; a change made here applies at once', async () => {
    const findUnique = vi.fn().mockResolvedValue({ value: { generationsPerDay: 5 } });
    const upsert = vi.fn().mockResolvedValue(undefined);
    const settings = new AppSettingsService({ appSetting: { findUnique, upsert } } as unknown as PrismaService);
    expect(await settings.get('ai-lists', 0)).toEqual({ generationsPerDay: 5 });
    expect(await settings.get('ai-lists', SETTINGS_CACHE_MS - 1)).toEqual({ generationsPerDay: 5 });
    expect(findUnique).toHaveBeenCalledTimes(1);
    findUnique.mockResolvedValue({ value: { generationsPerDay: 7 } });
    expect(await settings.get('ai-lists', SETTINGS_CACHE_MS)).toEqual({ generationsPerDay: 7 });
    await settings.set('ai-lists', { generationsPerDay: 9 });
    expect(await settings.get('ai-lists')).toEqual({ generationsPerDay: 9 });
    expect(findUnique).toHaveBeenCalledTimes(2);
  });
});
