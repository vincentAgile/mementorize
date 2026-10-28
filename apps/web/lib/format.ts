/**
 * Non-breaking space, between a number and its unit ("12 h", "3 cartes"):
 * the browser never puts them on two lines.
 */
export const NBSP = '\u00a0';

/** Narrow non-breaking space, before « ! », « ? », « : » and « ; » in French. */
export const NNBSP = '\u202f';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "10 min", "3 h", "4 j", "2 mois", "1 an": rough delay between two dates. */
export function formatDelay(from: Date, to: Date): string {
  const ms = Math.max(0, to.getTime() - from.getTime());
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / MINUTE))}${NBSP}min`;
  const hours = Math.round(ms / HOUR);
  if (hours < 24) return `${hours}${NBSP}h`;
  if (ms < 30 * DAY) return `${Math.max(1, Math.round(ms / DAY))}${NBSP}j`;
  if (ms < 365 * DAY) return `${Math.round(ms / (30 * DAY))}${NBSP}mois`;
  const years = Math.round(ms / (365 * DAY));
  return `${years}${NBSP}an${years > 1 ? 's' : ''}`;
}

/** First words of a text, used as a cue on the front of a card. */
export function firstWords(text: string, count = 3): string {
  const words = text.trim().split(/\s+/);
  return words.length <= count ? words.join(' ') : `${words.slice(0, count).join(' ')}…`;
}

/**
 * Shown instead of a review button when no card of the subject is due, as
 * lines: « Rien à réviser pour le moment ! », then when the next review is.
 */
export function nothingDueLines(due: { nextDueAt: string | null }, now: Date): string[] {
  const nothing = `Rien à réviser pour le moment${NNBSP}!`;
  return due.nextDueAt ? [nothing, `Prochaine révision dans ${formatDelay(now, new Date(due.nextDueAt))}`] : [nothing];
}

/** « 12/09/2026 », in the time zone of the app (the server and the browser render the same date). */
export const shortDate = (date: string) => new Date(date).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
