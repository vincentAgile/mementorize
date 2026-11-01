import { describe, expect, it } from 'vitest';
import { dayOf, endOfDay, nextDay, progressDays } from './progress.js';

describe('progress: the days of Paris', () => {
  it('the day of an instant, in Paris: 23:30 on Sunday is Sunday, 0:30 is Monday', () => {
    expect(dayOf(new Date('2026-11-01T22:30:00Z'))).toBe('2026-11-01');
    expect(dayOf(new Date('2026-11-01T23:30:00Z'))).toBe('2026-11-02');
  });

  it('the day after, across a month and a year', () => {
    expect(nextDay('2026-11-30')).toBe('2026-12-01');
    expect(nextDay('2026-12-31')).toBe('2027-01-01');
  });

  it('the end of a day, winter and summer time, and the nights the clock changes', () => {
    expect(endOfDay('2026-11-01').toISOString()).toBe('2026-11-01T23:00:00.000Z'); // UTC+1
    expect(endOfDay('2026-07-14').toISOString()).toBe('2026-07-14T22:00:00.000Z'); // UTC+2
    expect(endOfDay('2026-03-28').toISOString()).toBe('2026-03-28T23:00:00.000Z'); // the eve of summer time
    expect(endOfDay('2026-03-29').toISOString()).toBe('2026-03-29T22:00:00.000Z'); // a 23-hour day
    expect(endOfDay('2026-10-25').toISOString()).toBe('2026-10-25T23:00:00.000Z'); // a 25-hour day
  });
});

describe('progressDays', () => {
  const at = (iso: string) => new Date(iso);
  const now = at('2026-11-03T10:00:00Z');

  it('nothing ever learned: no day', () => {
    expect(progressDays([{ itemId: 'a', status: 'ToLearn', changedAt: at('2026-11-01T08:00:00Z') }], now)).toEqual([]);
  });

  it('from the first day in learning to today, the state of each item at the end of each day', () => {
    const days = progressDays(
      [
        { itemId: 'a', status: 'ToLearn', changedAt: at('2026-10-30T08:00:00Z') }, // before: not counted
        { itemId: 'a', status: 'Learning', changedAt: at('2026-11-01T08:00:00Z') },
        { itemId: 'b', status: 'ToLearn', changedAt: at('2026-10-30T08:00:00Z') },
        { itemId: 'b', status: 'Learned', changedAt: at('2026-11-01T22:30:00Z') }, // 23:30 in Paris: Sunday
        { itemId: 'c', status: 'Learning', changedAt: at('2026-11-01T23:30:00Z') }, // 0:30 in Paris: Monday
        { itemId: 'a', status: 'Learned', changedAt: at('2026-11-03T09:00:00Z') },
        { itemId: 'b', status: 'Learning', changedAt: at('2026-11-03T09:30:00Z') }, // « Revoir »
      ],
      now,
    );
    expect(days).toEqual([
      { day: '2026-11-01', learning: 1, learned: 1 },
      { day: '2026-11-02', learning: 2, learned: 1 },
      { day: '2026-11-03', learning: 2, learned: 1 },
    ]);
  });

  it('a reset (back to « À apprendre ») leaves the counts; the history in any order', () => {
    const days = progressDays(
      [
        { itemId: 'a', status: 'ToLearn', changedAt: at('2026-11-02T09:00:00Z') },
        { itemId: 'a', status: 'Learning', changedAt: at('2026-11-01T09:00:00Z') },
      ],
      at('2026-11-02T10:00:00Z'),
    );
    expect(days).toEqual([
      { day: '2026-11-01', learning: 1, learned: 0 },
      { day: '2026-11-02', learning: 0, learned: 0 },
    ]);
  });
});
