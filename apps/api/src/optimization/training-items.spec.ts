import { describe, expect, it } from 'vitest';
import { trainingItems } from './training-items.js';

const at = (iso: string) => new Date(iso);

describe('trainingItems (MEM-76)', () => {
  it('gives one item per review after the first, with the days between reviews, in the user’s time zone', () => {
    const items = trainingItems(
      [
        { cardId: 'a', rating: 'Good', reviewedAt: at('2026-10-03T08:00:00Z') },
        { cardId: 'a', rating: 'Again', reviewedAt: at('2026-10-01T08:00:00Z') },
        { cardId: 'a', rating: 'Hard', reviewedAt: at('2026-10-01T08:10:00Z') }, // the same day
        // 00:30 in Paris on the 8th, though still the 7th in UTC: 5 days after the 3rd.
        { cardId: 'a', rating: 'Easy', reviewedAt: at('2026-10-07T22:30:00Z') },
        { cardId: 'b', rating: 'Good', reviewedAt: at('2026-10-02T08:00:00Z') }, // a single review: no item
      ],
      'Europe/Paris',
    );
    expect(items).toEqual([
      [
        { rating: 1, deltaT: 0 },
        { rating: 2, deltaT: 0 },
      ],
      [
        { rating: 1, deltaT: 0 },
        { rating: 2, deltaT: 0 },
        { rating: 3, deltaT: 2 },
      ],
      [
        { rating: 1, deltaT: 0 },
        { rating: 2, deltaT: 0 },
        { rating: 3, deltaT: 2 },
        { rating: 4, deltaT: 5 },
      ],
    ]);
  });

  it('leaves out « Appris », which is not a grade (MEM-22, MEM-48)', () => {
    const items = trainingItems(
      [
        { cardId: 'a', rating: 'Good', reviewedAt: at('2026-10-01T08:00:00Z') },
        { cardId: 'a', rating: 'Learned', reviewedAt: at('2026-10-02T08:00:00Z') },
        { cardId: 'a', rating: 'Good', reviewedAt: at('2026-10-05T08:00:00Z') },
      ],
      'UTC',
    );
    expect(items).toEqual([
      [
        { rating: 3, deltaT: 0 },
        { rating: 3, deltaT: 4 },
      ],
    ]);
  });
});
