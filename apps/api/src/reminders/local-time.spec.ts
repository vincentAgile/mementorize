import { describe, expect, it } from 'vitest';
import { isValidTimeZone, localDateAndHour, startOfNextLocalDay } from './local-time.js';

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

describe('startOfNextLocalDay (MEM-130)', () => {
  it('is the next local midnight, as an instant', () => {
    expect(startOfNextLocalDay(new Date('2026-07-01T10:00:00Z'), 'Europe/Paris').toISOString()).toBe(
      '2026-07-01T22:00:00.000Z',
    );
    expect(startOfNextLocalDay(new Date('2026-12-01T10:00:00Z'), 'Europe/Paris').toISOString()).toBe(
      '2026-12-01T23:00:00.000Z',
    );
    expect(startOfNextLocalDay(new Date('2026-10-13T02:00:00Z'), 'America/New_York').toISOString()).toBe(
      '2026-10-13T04:00:00.000Z',
    );
    expect(startOfNextLocalDay(new Date('2026-10-13T23:30:00Z'), 'UTC').toISOString()).toBe('2026-10-14T00:00:00.000Z');
  });

  it('follows the changes of time', () => {
    // Paris goes back to UTC+1 on 25 October 2026, at 3 a.m.: that night is one hour longer.
    expect(startOfNextLocalDay(new Date('2026-10-24T12:00:00Z'), 'Europe/Paris').toISOString()).toBe(
      '2026-10-24T22:00:00.000Z',
    );
    expect(startOfNextLocalDay(new Date('2026-10-25T12:00:00Z'), 'Europe/Paris').toISOString()).toBe(
      '2026-10-25T23:00:00.000Z',
    );
    // And to UTC+2 on 29 March 2026.
    expect(startOfNextLocalDay(new Date('2026-03-29T12:00:00Z'), 'Europe/Paris').toISOString()).toBe(
      '2026-03-29T22:00:00.000Z',
    );
  });
});
