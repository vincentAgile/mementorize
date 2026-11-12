import { localDate } from '../reminders/local-time.js';

/**
 * MEM-135/143: the days of the consumption shown in the console (Chat IA,
 * « Générer avec l'IA »): Europe/Paris, the last 30, kept 13 months.
 */
export const CONSOLE_TIME_ZONE = 'Europe/Paris';
export const KEPT_MONTHS = 13;
export const REPORT_DAYS = 30;
export const TOP_USERS = 10;

/** Today in the console's time zone: YYYY-MM-DD. */
export const consoleDay = (now: Date) => localDate(now, CONSOLE_TIME_ZONE);

/** The day before a YYYY-MM-DD. */
const dayBefore = (day: string) => new Date(Date.parse(`${day}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

/** The last 30 days, today first. */
export function reportDays(now: Date): string[] {
  const days = [consoleDay(now)];
  while (days.length < REPORT_DAYS) days.push(dayBefore(days.at(-1)!));
  return days;
}

/** The first day kept: 13 months ago. */
export function firstKeptDay(now: Date): string {
  const limit = new Date(now);
  limit.setUTCMonth(limit.getUTCMonth() - KEPT_MONTHS);
  return consoleDay(limit);
}

/** Only the counts given (not zero), as increments; for the creation, never below zero. */
export function increments<T extends Record<string, number | undefined>>(counts: T) {
  const entries = Object.entries(counts).filter(([, value]) => value) as [string, number][];
  return {
    empty: entries.length === 0,
    create: Object.fromEntries(entries.map(([key, value]) => [key, Math.max(0, value)])),
    update: Object.fromEntries(entries.map(([key, value]) => [key, { increment: value }])),
  };
}
