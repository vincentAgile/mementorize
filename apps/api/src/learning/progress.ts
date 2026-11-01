import type { LearningStatus } from '@prisma/client';
import { localDateAndHour } from '../reminders/local-time.js';

/** The days of the progress are those of a clock in Paris, as the dates of the web app. */
export const PROGRESS_TIME_ZONE = 'Europe/Paris';

/** « 2026-11-01 »: the day of an instant, in the time zone. */
export const dayOf = (instant: Date, timeZone = PROGRESS_TIME_ZONE) => localDateAndHour(instant, timeZone).date;

/** The day after « 2026-11-01 »: « 2026-11-02 ». */
export function nextDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + 1)).toISOString().slice(0, 10);
}

/**
 * The instant a day ends in the time zone: the midnight that starts the next
 * one (summer time included: tried at each whole hour of offset).
 */
export function endOfDay(day: string, timeZone = PROGRESS_TIME_ZONE): Date {
  const next = nextDay(day);
  const midnightUtc = Date.parse(`${next}T00:00:00Z`);
  for (let offset = -14; offset <= 14; offset++) {
    const instant = new Date(midnightUtc - offset * 3_600_000);
    const local = localDateAndHour(instant, timeZone);
    if (local.date === next && local.hour === 0 && dayOf(new Date(instant.getTime() - 1), timeZone) === day) {
      return instant;
    }
  }
  throw new Error(`No end found for ${day} in ${timeZone}`);
}

/** One day of the progress: how many items were « En cours d'apprentissage » and « Appris » at its end. */
export interface ProgressDay {
  day: string;
  learning: number;
  learned: number;
}

/**
 * The progress of a space, day by day, from the first day an item was in
 * learning (or learned) to today: the state of each item at the end of each
 * day, from the history of its states, oldest first. Empty when no item was
 * ever learned.
 */
export function progressDays(
  changes: { itemId: string; status: LearningStatus; changedAt: Date }[],
  now: Date,
  timeZone = PROGRESS_TIME_ZONE,
): ProgressDay[] {
  const sorted = [...changes].sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime());
  const first = sorted.find((change) => change.status === 'Learning' || change.status === 'Learned');
  if (!first) return [];

  const today = dayOf(now, timeZone);
  const status = new Map<string, LearningStatus>();
  const days: ProgressDay[] = [];
  let next = 0;
  for (let day = dayOf(first.changedAt, timeZone); day <= today; day = nextDay(day)) {
    const end = endOfDay(day, timeZone).getTime();
    while (next < sorted.length && sorted[next].changedAt.getTime() < end) {
      status.set(sorted[next].itemId, sorted[next].status);
      next++;
    }
    let learning = 0;
    let learned = 0;
    for (const state of status.values()) {
      if (state === 'Learning') learning++;
      else if (state === 'Learned') learned++;
    }
    days.push({ day, learning, learned });
  }
  return days;
}
