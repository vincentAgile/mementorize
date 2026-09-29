const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "10 min", "3 h", "4 j", "2 mois", "1 an": rough delay between two dates. */
export function formatDelay(from: Date, to: Date): string {
  const ms = Math.max(0, to.getTime() - from.getTime());
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / MINUTE))} min`;
  const hours = Math.round(ms / HOUR);
  if (hours < 24) return `${hours} h`;
  if (ms < 30 * DAY) return `${Math.max(1, Math.round(ms / DAY))} j`;
  if (ms < 365 * DAY) return `${Math.round(ms / (30 * DAY))} mois`;
  const years = Math.round(ms / (365 * DAY));
  return `${years} an${years > 1 ? 's' : ''}`;
}

/** First words of a text, used as a cue on the front of a card. */
export function firstWords(text: string, count = 3): string {
  const words = text.trim().split(/\s+/);
  return words.length <= count ? words.join(' ') : `${words.slice(0, count).join(' ')}…`;
}
