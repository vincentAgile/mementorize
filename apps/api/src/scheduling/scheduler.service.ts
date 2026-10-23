import type { Card, CardState, ReviewRating } from '@prisma/client';
import {
  type Card as FsrsCard,
  type FSRS,
  type FSRSParameters,
  type Grade as FsrsGrade,
  createEmptyCard,
  fsrs,
  Rating,
  State,
} from 'ts-fsrs';

/** The scheduling columns of a card, as stored in the database. */
export type CardSchedule = Pick<
  Card,
  'due' | 'stability' | 'difficulty' | 'scheduledDays' | 'learningSteps' | 'reps' | 'lapses' | 'state' | 'lastReview'
>;

/** The four self-assessments FSRS knows; `Learned` is not one of them (MEM-22). */
export type Grade = Exclude<ReviewRating, 'Learned'>;

/** What gets written to review_logs after a self-assessment. */
export interface ReviewLogData {
  rating: ReviewRating;
  state: CardState;
  due: Date;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  learningSteps: number;
  reviewedAt: Date;
}

/** When the card would next be due, for each possible answer. */
export type NextDueByRating = Record<Grade, Date>;

const RATINGS: readonly Grade[] = ['Again', 'Hard', 'Good', 'Easy'];

/**
 * Thin wrapper around ts-fsrs. It's the only place in the app that knows
 * about the library: the rest of the code manipulates database rows, and
 * this class translates them to and from ts-fsrs's own types.
 *
 * Every method takes `now` as a parameter instead of reading the clock
 * itself: that's what makes the scheduling logic testable.
 */
export class SchedulerService {
  private readonly fsrs: FSRS;

  constructor(params: Partial<FSRSParameters> = {}) {
    this.fsrs = fsrs(params);
  }

  /** Scheduling state of a card that has never been reviewed (due now). */
  newCard(now: Date): CardSchedule {
    return fromFsrsCard(createEmptyCard(now));
  }

  /** Next due date for each of the 4 possible answers, without saving anything. */
  preview(card: CardSchedule, now: Date): NextDueByRating {
    const outcomes = this.fsrs.repeat(toFsrsCard(card), now);
    return Object.fromEntries(
      RATINGS.map((rating) => [rating, rating === 'Again' ? now : outcomes[Rating[rating] as FsrsGrade].card.due]),
    ) as NextDueByRating;
  }

  /**
   * Applies a self-assessment: returns the new card state and the log entry.
   * « À revoir » (Again) makes the card due at once, instead of FSRS's short
   * step (1 or 10 minutes): leaving a session and coming back finds it still
   * to review (MEM-47). The rest of FSRS's state (stability, difficulty,
   * lapses, step) is kept.
   */
  review(card: CardSchedule, rating: Grade, now: Date): { card: CardSchedule; log: ReviewLogData } {
    const { card: next, log } = this.fsrs.next(toFsrsCard(card), now, Rating[rating] as FsrsGrade);
    return {
      card: { ...fromFsrsCard(next), ...(rating === 'Again' && { due: now }) },
      log: {
        rating,
        state: State[log.state] as CardState,
        due: log.due,
        stability: log.stability,
        difficulty: log.difficulty,
        scheduledDays: log.scheduled_days,
        learningSteps: log.learning_steps,
        reviewedAt: log.review,
      },
    };
  }
}

// --- Mapping between our database columns and ts-fsrs's Card --------------

function toFsrsCard(card: CardSchedule): FsrsCard {
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: 0, // deprecated in ts-fsrs 5 (recomputed from last_review), not stored
    scheduled_days: card.scheduledDays,
    learning_steps: card.learningSteps,
    reps: card.reps,
    lapses: card.lapses,
    state: State[card.state],
    last_review: card.lastReview ?? undefined,
  };
}

function fromFsrsCard(card: FsrsCard): CardSchedule {
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: State[card.state] as CardState,
    lastReview: card.last_review ?? null,
  };
}
