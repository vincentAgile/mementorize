import { default_w } from 'ts-fsrs';
import { describe, expect, it } from 'vitest';
import { type CardSchedule, SchedulerService } from './scheduler.service.js';

// The settings of Mementorize (MEM-74), without the fuzz, and a fixed clock:
// the same inputs always give the same outputs, so we can make precise
// assertions about the schedule.
const scheduler = new SchedulerService({ enable_fuzz: false });
const T0 = new Date('2026-09-29T08:00:00Z');

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const after = (from: Date, to: Date) => to.getTime() - from.getTime();

/** A card in review, last seen 20 days ago with a stability of 20 days: due now. */
const reviewed = (): CardSchedule => ({
  due: T0,
  stability: 20,
  difficulty: 5,
  scheduledDays: 20,
  learningSteps: 0,
  reps: 5,
  lapses: 0,
  state: 'Review',
  lastReview: new Date(T0.getTime() - 20 * DAY),
});

describe('SchedulerService', () => {
  it('creates a new card that is due immediately', () => {
    const card = scheduler.newCard(T0);

    expect(card).toMatchObject({ state: 'New', due: T0, reps: 0, lapses: 0, lastReview: null });
  });

  it('has a single short step of 10 minutes for a new card (MEM-74): « Correct » graduates it', () => {
    const card = scheduler.newCard(T0);
    const hard = scheduler.review(card, 'Hard', T0).card;
    expect(hard.state).toBe('Learning');
    expect(after(T0, hard.due)).toBe(15 * MINUTE); // « Difficile »: 1.5 × the step of 10 minutes

    const good = scheduler.review(card, 'Good', T0).card;
    expect(good.state).toBe('Review');
    expect(good.scheduledDays).toBeGreaterThanOrEqual(1);
    expect(good.reps).toBe(1);
    expect(good.lastReview).toEqual(T0);
  });

  it('has a single short step of 10 minutes for a forgotten card too (MEM-74)', () => {
    const forgotten = scheduler.review(reviewed(), 'Again', T0).card;
    expect(forgotten.state).toBe('Relearning');
    expect(forgotten.due).toEqual(T0); // due at once, at the bottom of the pile (MEM-47)
    const later = new Date(T0.getTime() + 10 * MINUTE);
    expect(after(later, scheduler.review(forgotten, 'Hard', later).card.due)).toBe(15 * MINUTE);
    expect(scheduler.review(forgotten, 'Good', later).card.state).toBe('Review');
  });

  it('never schedules a card further than a year (MEM-74), even with the fuzz', () => {
    const fuzzy = new SchedulerService();
    // A card known for years: FSRS alone would send it back in several years.
    const card = { ...reviewed(), stability: 3000, scheduledDays: 900, lastReview: new Date(T0.getTime() - 900 * DAY) };
    expect(after(T0, scheduler.preview(card, T0).Easy)).toBe(365 * DAY);
    expect(scheduler.review(card, 'Easy', T0).card.scheduledDays).toBe(365);
    for (const one of [scheduler, fuzzy]) {
      const next = one.preview(card, T0);
      for (const rating of ['Hard', 'Good', 'Easy'] as const) {
        expect(after(T0, next[rating])).toBeLessThanOrEqual(365 * DAY);
        expect(one.review(card, rating, T0).card.scheduledDays).toBeLessThanOrEqual(365);
      }
    }
  });

  it('spreads the cards learned the same day with the fuzz (MEM-74), as shown on the buttons', () => {
    const fuzzy = new SchedulerService();
    const intervals = new Set<number>();
    for (let index = 0; index < 20; index++) {
      // The same card, reviewed a few seconds apart: as twenty words learned in a row.
      const card = { ...reviewed(), lastReview: new Date(T0.getTime() - 20 * DAY + index * 7_000) };
      const shown = fuzzy.preview(card, T0).Good;
      // Pressed a few minutes later: the same interval as the one shown (MEM-49).
      const later = new Date(T0.getTime() + 5 * MINUTE);
      const { card: next } = fuzzy.review(card, 'Good', later);
      expect(after(T0, shown)).toBe(next.scheduledDays * DAY);
      intervals.add(next.scheduledDays);
    }
    expect(intervals.size).toBeGreaterThan(1);
  });

  it('graduates a new card rated "Easy" straight to review, days later', () => {
    const { card } = scheduler.review(scheduler.newCard(T0), 'Easy', T0);

    expect(card.state).toBe('Review');
    expect(card.scheduledDays).toBeGreaterThanOrEqual(1);
    expect(after(T0, card.due)).toBe(card.scheduledDays * DAY);
  });

  it('previews one due date per answer, from soonest (Again) to latest (Easy)', () => {
    const next = scheduler.preview(scheduler.newCard(T0), T0);

    expect(next.Again).toEqual(T0); // due at once (MEM-47)
    expect(next.Again.getTime()).toBeLessThanOrEqual(next.Hard.getTime());
    expect(next.Hard.getTime()).toBeLessThanOrEqual(next.Good.getTime());
    expect(next.Good.getTime()).toBeLessThan(next.Easy.getTime());
  });

  it('spaces reviews further and further apart when the answer is always "Good"', () => {
    let card: CardSchedule = scheduler.newCard(T0);
    let now = T0;
    const intervals: number[] = [];

    for (let i = 0; i < 4; i++) {
      card = scheduler.review(card, 'Good', now).card;
      intervals.push(after(now, card.due));
      now = card.due; // review exactly when due
    }

    for (let i = 1; i < intervals.length; i++) {
      expect(intervals[i]).toBeGreaterThan(intervals[i - 1]);
    }
    expect(card.state).toBe('Review');
    expect(intervals.at(-1)!).toBeGreaterThan(30 * DAY); // over a month after 4 successful reviews

    // Then up to a year, not further (MEM-74).
    for (let i = 0; i < 4; i++) {
      card = scheduler.review(card, 'Good', now).card;
      now = card.due;
    }
    expect(card.scheduledDays).toBe(365);
  });

  it('counts a lapse and relearns the card when a known card is forgotten ("Again")', () => {
    let card = scheduler.review(scheduler.newCard(T0), 'Easy', T0).card; // now in Review
    const now = card.due;
    const before = card;

    card = scheduler.review(card, 'Again', now).card;

    expect(card.state).toBe('Relearning');
    expect(card.lapses).toBe(before.lapses + 1);
    expect(card.stability).toBeLessThan(before.stability); // the memory is weaker than we thought
    expect(card.due).toEqual(now); // due at once: still to review after leaving the session (MEM-47)
  });

  it('returns a log entry describing the review', () => {
    const card = scheduler.newCard(T0);
    const { log } = scheduler.review(card, 'Hard', T0);

    expect(log).toMatchObject({ rating: 'Hard', state: 'New', reviewedAt: T0 });
  });

  it('brings a card back sooner when the target retention is higher (MEM-75)', () => {
    const scheduler = new SchedulerService({ enable_fuzz: false });
    const now = new Date('2026-10-25T08:00:00Z');
    let card = scheduler.newCard(now);
    for (const day of [0, 1, 4]) card = scheduler.review(card, 'Good', new Date(now.getTime() + day * 86_400_000)).card;
    const later = new Date(card.due);
    const good = (retention: 85 | 90 | 95) => scheduler.preview(card, later, { retention }).Good.getTime();
    expect(good(85)).toBeGreaterThan(good(90));
    expect(good(90)).toBeGreaterThan(good(95));
    expect(scheduler.preview(card, later)).toEqual(scheduler.preview(card, later, { retention: 90 })); // 90 % by default
  });

  it('schedules with the weights optimized on the history of the space, if any (MEM-76)', () => {
    const scheduler = new SchedulerService({ enable_fuzz: false });
    const now = new Date('2026-10-25T08:00:00Z');
    let card = scheduler.newCard(now);
    for (const day of [0, 1, 4]) card = scheduler.review(card, 'Good', new Date(now.getTime() + day * 86_400_000)).card;
    const later = new Date(card.due);
    // Weights where a success strengthens the memory more (w[8]: the growth of the stability).
    const weights = [...default_w];
    weights[8] += 1;
    expect(scheduler.preview(card, later, { weights }).Good.getTime()).toBeGreaterThan(
      scheduler.preview(card, later).Good.getTime(),
    );
    // No weights, or none stored: the default ones.
    expect(scheduler.preview(card, later, { weights: [] })).toEqual(scheduler.preview(card, later));
    expect(scheduler.preview(card, later, { weights: null })).toEqual(scheduler.preview(card, later));
  });
});
