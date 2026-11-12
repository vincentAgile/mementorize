import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

/** A parameter is read again after this long at most: a change in the console applies within a minute. */
export const SETTINGS_CACHE_MS = 60_000;

/**
 * MEM-143: the parameters of the app set in the console, by key (a JSON
 * value; the service that reads a key checks it and applies its defaults).
 * Read with a cache of 60 seconds; a change made here applies at once.
 */
@Injectable()
export class AppSettingsService {
  private readonly cache = new Map<string, { value: unknown; at: number }>();

  constructor(private readonly prisma: PrismaService) {}

  /** The value set in the console, or null when none was. */
  async get(key: string, now = Date.now()): Promise<unknown> {
    const cached = this.cache.get(key);
    if (cached && now - cached.at < SETTINGS_CACHE_MS) return cached.value;
    const row = await this.prisma.appSetting.findUnique({ where: { key }, select: { value: true } });
    const value = row?.value ?? null;
    this.cache.set(key, { value, at: now });
    return value;
  }

  async set(key: string, value: Prisma.InputJsonValue): Promise<void> {
    await this.prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
    this.cache.set(key, { value, at: Date.now() });
  }
}
