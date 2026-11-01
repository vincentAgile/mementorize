import { NBSP } from './format';

const ZONE = 'Europe/Paris'; // the days of the API (src/learning/progress.ts)

/** « 2026-11-01 »: the day of an instant in Paris. */
export const parisDay = (instant: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, dateStyle: 'short' }).format(instant);

/** Days from one « 2026-11-01 » to another. */
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/** « 1er » rather than « 1 », the first day of a month in French. */
const first = (text: string) => text.replace(/(^|\s)1(\s)/, '$11er$2');

/** « lundi 2 novembre », « dimanche 1er novembre »: a day in full. */
export const longDay = (day: string) =>
  first(
    new Date(`${day}T12:00:00Z`).toLocaleDateString('fr-FR', {
      timeZone: 'UTC',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }),
  );

/** « 2 nov. », « 1er nov. »: a day on the axis of the chart. */
export const shortDay = (day: string) =>
  first(new Date(`${day}T12:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'short' }));

/** « aujourd'hui », « demain », « dans 3 jours »: when the next review is, seen from now. */
export function relativeDay(day: string, now: Date): string {
  const days = daysBetween(parisDay(now), day);
  if (days <= 0) return 'aujourd’hui';
  if (days === 1) return 'demain';
  return `dans ${days}${NBSP}jours`;
}

/** The marks of the vertical axis: 0, then about three round steps up to the top value. */
export function axisTicks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  const step = steps.find((candidate) => max / candidate <= 4) ?? Math.ceil(max / 4);
  const ticks: number[] = [];
  for (let value = 0; value < max + step; value += step) ticks.push(value);
  return ticks;
}
