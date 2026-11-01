import { describe, expect, it } from 'vitest';
import { axisTicks, longDay, parisDay, relativeDay, shortDay } from './progress';

describe('progress: the days', () => {
  // Sunday 1 November 2026, 23:30 in Paris (UTC+1).
  const now = new Date('2026-11-01T22:30:00Z');

  it('the day of Paris, the next review seen from now', () => {
    expect(parisDay(now)).toBe('2026-11-01');
    expect(parisDay(new Date('2026-11-01T23:30:00Z'))).toBe('2026-11-02');
    expect(relativeDay('2026-11-01', now)).toBe('aujourd’hui');
    expect(relativeDay('2026-10-30', now)).toBe('aujourd’hui'); // overdue cards
    expect(relativeDay('2026-11-02', now)).toBe('demain');
    expect(relativeDay('2026-11-05', now)).toBe('dans 4 jours');
  });

  it('a day in full and on the axis', () => {
    expect(longDay('2026-11-02')).toBe('lundi 2 novembre');
    expect(shortDay('2026-11-02')).toBe('2 nov.');
    expect(longDay('2026-11-01')).toBe('dimanche 1er novembre');
    expect(shortDay('2026-11-01')).toBe('1er nov.');
    expect(longDay('2026-11-11')).toBe('mercredi 11 novembre');
  });
});

describe('axisTicks', () => {
  it('0, then round steps up to at least the top value', () => {
    expect(axisTicks(0)).toEqual([0, 1]);
    expect(axisTicks(3)).toEqual([0, 1, 2, 3]);
    expect(axisTicks(7)).toEqual([0, 2, 4, 6, 8]);
    expect(axisTicks(37)).toEqual([0, 10, 20, 30, 40]);
    expect(axisTicks(180)).toEqual([0, 50, 100, 150, 200]);
  });
});
