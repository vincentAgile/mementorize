/**
 * Date and hour of an instant, as a clock in the given time zone shows them
 * (Intl knows the time zone rules, summer time included).
 */
export function localDateAndHour(instant: Date, timeZone: string): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return { date: `${part('year')}-${part('month')}-${part('day')}`, hour: Number(part('hour')) };
}

/** True for a time zone name Intl knows (e.g. "Europe/Paris"). */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The local date (YYYY-MM-DD) of an instant in the given time zone. */
export function localDate(instant: Date, timeZone: string): string {
  return localDateAndHour(instant, timeZone).date;
}

/** How far the clock of the time zone is ahead of UTC at that instant, in ms. */
function offsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const n = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * MEM-130: the instant the next local day begins (midnight, on the clock of
 * the time zone), summer time included: when a daily cap is renewed.
 */
export function startOfNextLocalDay(instant: Date, timeZone: string): Date {
  const [year, month, day] = localDate(instant, timeZone).split('-').map(Number);
  const midnightAsUtc = Date.UTC(year, month - 1, day + 1);
  // The offset of the day before the change of time, then the one at the found instant.
  let guess = midnightAsUtc - offsetMs(new Date(midnightAsUtc), timeZone);
  guess = midnightAsUtc - offsetMs(new Date(guess), timeZone);
  return new Date(guess);
}
