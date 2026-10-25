import type { ReviewRating } from '@prisma/client';

/** A review of the history (review_logs), as the optimizer needs it. */
export interface LoggedReview {
  cardId: string;
  rating: ReviewRating;
  reviewedAt: Date;
}

/** A review given to the FSRS optimizer: its grade (1-4), and the days since the previous review of the card. */
export interface TrainingReview {
  rating: 1 | 2 | 3 | 4;
  deltaT: number;
}

const GRADES: Partial<Record<ReviewRating, TrainingReview['rating']>> = { Again: 1, Hard: 2, Good: 3, Easy: 4 };

/** The reviews that train FSRS (MEM-76): its four grades; « Appris » is not one (MEM-22, MEM-48). */
export const isGrade = (rating: ReviewRating) => rating in GRADES;

const DAY = 24 * 60 * 60 * 1000;

/** The number of the day of a date, in the user's time zone: reviews on the same day are 0 days apart. */
function dayNumber(date: Date, timeZone: string): number {
  const local = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return Math.round(Date.parse(`${local}T00:00:00Z`) / DAY);
}

/**
 * The training set of the FSRS optimizer (MEM-76), from a review history:
 * for each card, its graded reviews in their order, the first 0 days after
 * nothing, the next ones the days since the previous one (calendar days,
 * in the user's time zone). As FSRS expects, one item per review after the
 * first, holding the reviews of the card up to it.
 */
export function trainingItems(logs: LoggedReview[], timeZone: string): TrainingReview[][] {
  const byCard = new Map<string, LoggedReview[]>();
  for (const log of logs) {
    if (!isGrade(log.rating)) continue;
    const reviews = byCard.get(log.cardId) ?? [];
    reviews.push(log);
    byCard.set(log.cardId, reviews);
  }

  const items: TrainingReview[][] = [];
  for (const reviews of byCard.values()) {
    reviews.sort((a, b) => a.reviewedAt.getTime() - b.reviewedAt.getTime());
    const days = reviews.map((review) => dayNumber(review.reviewedAt, timeZone));
    const history = reviews.map((review, index) => ({
      rating: GRADES[review.rating]!,
      deltaT: index === 0 ? 0 : days[index] - days[index - 1],
    }));
    for (let end = 2; end <= history.length; end++) items.push(history.slice(0, end));
  }
  return items;
}
