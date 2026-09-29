import { describe, expect, it } from 'vitest';
import { type CardSchedule, SchedulerService } from './scheduler.service.js';

// Fuzz disabled + a fixed clock: the same inputs always give the same
// outputs, so we can make precise assertions about the schedule.
const scheduler = new SchedulerService({ enable_fuzz: false });
const T0 = new Date('2026-09-29T08:00:00Z');

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const after = (from: Date, to: Date) => to.getTime() - from.getTime();

describe('SchedulerService', () => {
  it('creates a new card that is due immediately', () => {
    const card = scheduler.newCard(T0);

    expect(card).toMatchObject({ state: 'New', due: T0, reps: 0, lapses: 0, lastReview: null });
  });

  it('keeps a new card rated "Good" in short-term learning (10 min)', () => {
    const { card } = scheduler.review(scheduler.newCard(T0), 'Good', T0);

    expect(card.state).toBe('Learning');
    expect(after(T0, card.due)).toBe(10 * MINUTE);
    expect(card.reps).toBe(1);
    expect(card.lastReview).toEqual(T0);
  });

  it('graduates a new card rated "Easy" straight to review, days later', () => {
    const { card } = scheduler.review(scheduler.newCard(T0), 'Easy', T0);

    expect(card.state).toBe('Review');
    expect(card.scheduledDays).toBeGreaterThanOrEqual(1);
    expect(after(T0, card.due)).toBe(card.scheduledDays * DAY);
  });

  it('previews one due date per answer, from soonest (Again) to latest (Easy)', () => {
    const next = scheduler.preview(scheduler.newCard(T0), T0);

    expect(next.Again.getTime()).toBeLessThanOrEqual(next.Hard.getTime());
    expect(next.Hard.getTime()).toBeLessThanOrEqual(next.Good.getTime());
    expect(next.Good.getTime()).toBeLessThan(next.Easy.getTime());
  });

  it('spaces reviews further and further apart when the answer is always "Good"', () => {
    let card: CardSchedule = scheduler.newCard(T0);
    let now = T0;
    const intervals: number[] = [];

    for (let i = 0; i < 6; i++) {
      card = scheduler.review(card, 'Good', now).card;
      intervals.push(after(now, card.due));
      now = card.due; // review exactly when due
    }

    for (let i = 1; i < intervals.length; i++) {
      expect(intervals[i]).toBeGreaterThan(intervals[i - 1]);
    }
    expect(card.state).toBe('Review');
    expect(intervals.at(-1)!).toBeGreaterThan(30 * DAY); // over a month after 6 successful reviews
  });

  it('counts a lapse and relearns the card when a known card is forgotten ("Again")', () => {
    let card = scheduler.review(scheduler.newCard(T0), 'Easy', T0).card; // now in Review
    const now = card.due;
    const before = card;

    card = scheduler.review(card, 'Again', now).card;

    expect(card.state).toBe('Relearning');
    expect(card.lapses).toBe(before.lapses + 1);
    expect(card.stability).toBeLessThan(before.stability); // the memory is weaker than we thought
    expect(after(now, card.due)).toBeLessThanOrEqual(10 * MINUTE); // shown again shortly
  });

  it('returns a log entry describing the review', () => {
    const card = scheduler.newCard(T0);
    const { log } = scheduler.review(card, 'Hard', T0);

    expect(log).toMatchObject({ rating: 'Hard', state: 'New', reviewedAt: T0 });
  });
});
