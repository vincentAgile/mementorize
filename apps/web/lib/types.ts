export type CardState = 'New' | 'Learning' | 'Review' | 'Relearning';
export type ReviewRating = 'Again' | 'Hard' | 'Good' | 'Easy';

export interface Quote {
  id: string;
  text: string;
  author: string | null;
  source: string | null;
  userId: string;
  createdAt: string;
  updatedAt: string;
  card?: { due: string; state: CardState } | null; // included by GET /quotes
}

/** A quote waiting to be reviewed, as returned by GET /reviews/due. */
export interface DueItem {
  quote: Quote;
  card: { id: string; due: string; state: CardState; reps: number; lapses: number };
  nextDue: Record<ReviewRating, string>; // ISO dates
}

export interface DueReviews {
  total: number;
  items: DueItem[];
  nextDueAt: string | null;
}

export interface CreateQuoteInput {
  text: string;
  author?: string;
  source?: string;
}

export interface AuthUser {
  id: string;
  email: string;
}

export interface Credentials {
  email: string;
  password: string;
}
