import { describe, expect, it } from 'vitest';
import { isValidTimeZone, localDateAndHour } from './local-time.js';

describe('localDateAndHour', () => {
  it('follows the time zone, summer time included', () => {
    // Paris is UTC+2 in summer, UTC+1 in winter.
    expect(localDateAndHour(new Date('2026-07-01T06:30:00Z'), 'Europe/Paris')).toEqual({ date: '2026-07-01', hour: 8 });
    expect(localDateAndHour(new Date('2026-12-01T06:30:00Z'), 'Europe/Paris')).toEqual({ date: '2026-12-01', hour: 7 });
  });

  it('can be on another day than UTC', () => {
    expect(localDateAndHour(new Date('2026-10-13T23:30:00Z'), 'Europe/Paris')).toEqual({ date: '2026-10-14', hour: 1 });
    expect(localDateAndHour(new Date('2026-10-13T02:00:00Z'), 'America/New_York')).toEqual({
      date: '2026-10-12',
      hour: 22,
    });
  });

  it('writes midnight as 0, not 24', () => {
    expect(localDateAndHour(new Date('2026-10-13T22:00:00Z'), 'Europe/Paris').hour).toBe(0);
  });
});

describe('isValidTimeZone', () => {
  it('knows IANA names only', () => {
    expect(isValidTimeZone('Europe/Paris')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });
});
