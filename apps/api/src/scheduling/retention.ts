import type { ItemType } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service.js';
import { DEFAULT_RETENTION, type Retention, RETENTIONS } from './scheduler.service.js';

/** The column of the target retention of each space (MEM-75), on the user's account. */
export const RETENTION_FIELDS = {
  Vocabulary: 'vocabularyRetention',
  Quote: 'quoteRetention',
  MindMap: 'mindMapRetention',
} as const satisfies Record<ItemType, string>;

/** A stored value as a retention: 90 % if it isn't one (it always is: the API checks it). */
const asRetention = (value: number): Retention =>
  (RETENTIONS as readonly number[]).includes(value) ? (value as Retention) : DEFAULT_RETENTION;

/** The target retention of each space of the user (MEM-75): one query, for a whole session. */
export async function userRetentions(prisma: PrismaService, userId: string): Promise<Record<ItemType, Retention>> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { vocabularyRetention: true, quoteRetention: true, mindMapRetention: true },
  });
  return {
    Vocabulary: asRetention(user?.vocabularyRetention ?? DEFAULT_RETENTION),
    Quote: asRetention(user?.quoteRetention ?? DEFAULT_RETENTION),
    MindMap: asRetention(user?.mindMapRetention ?? DEFAULT_RETENTION),
  };
}
