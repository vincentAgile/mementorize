import type { Prisma } from '@prisma/client';

/**
 * The items whose cards are reviewed and counted (MEM-15): only those being
 * learned. A new vocabulary word waits in `ToLearn`, a learned one is out of
 * the review. Every query on due cards (review, counters, reminder e-mail)
 * goes through it.
 */
export const IN_REVIEW = { learningStatus: 'Learning' } as const satisfies Prisma.ItemWhereInput;

/**
 * The cards that are reviewed and counted (MEM-40): vocabulary is reviewed
 * French → English only, the French as the question, the English as the
 * answer. The English → French cards are kept, with their schedule and
 * history, but ignored: they can come back (a setting, later). Used with
 * IN_REVIEW by every query on due cards.
 */
export const REVIEWED_CARD = { kind: { not: 'EnglishToFrench' } } as const satisfies Prisma.CardWhereInput;
