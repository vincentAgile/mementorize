import type { ItemType } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service.js';
import { DEFAULT_RETENTION, type Retention, RETENTIONS, type SchedulingOptions } from './scheduler.service.js';

/** The column of the target retention of each space (MEM-75), on the user's account. */
export const RETENTION_FIELDS = {
  Vocabulary: 'vocabularyRetention',
  Quote: 'quoteRetention',
  MindMap: 'mindMapRetention',
} as const satisfies Record<ItemType, string>;

/** A stored value as a retention: 90 % if it isn't one (it always is: the API checks it). */
const asRetention = (value: number | undefined): Retention =>
  (RETENTIONS as readonly number[]).includes(value ?? NaN) ? (value as Retention) : DEFAULT_RETENTION;

/**
 * How each space of the user is scheduled: its target retention (MEM-75)
 * and its optimized FSRS weights, if any (MEM-76). Two queries, for a whole
 * session.
 */
export async function spaceScheduling(
  prisma: PrismaService,
  userId: string,
): Promise<Record<ItemType, SchedulingOptions>> {
  const [user, parameters] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { vocabularyRetention: true, quoteRetention: true, mindMapRetention: true },
    }),
    prisma.fsrsParameters.findMany({ where: { userId }, select: { type: true, weights: true } }),
  ]);
  const weights = (type: ItemType) => parameters.find((one) => one.type === type)?.weights ?? null;
  return {
    Vocabulary: { retention: asRetention(user?.vocabularyRetention), weights: weights('Vocabulary') },
    Quote: { retention: asRetention(user?.quoteRetention), weights: weights('Quote') },
    MindMap: { retention: asRetention(user?.mindMapRetention), weights: weights('MindMap') },
  };
}
