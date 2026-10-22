import type { Prisma } from '@prisma/client';

/**
 * The items whose cards are reviewed and counted (MEM-15): only those being
 * learned. A new vocabulary word waits in `ToLearn`, a learned one is out of
 * the review. Every query on due cards (review, counters, reminder e-mail)
 * goes through it.
 */
export const IN_REVIEW = { learningStatus: 'Learning' } as const satisfies Prisma.ItemWhereInput;
