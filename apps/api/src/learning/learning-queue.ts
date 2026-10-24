import { Prisma } from '@prisma/client';

/** What the queue functions need: the Prisma client, or a transaction. */
type Db = Pick<Prisma.TransactionClient, 'item' | '$executeRaw'>;

/** The order of the learning queue (MEM-61): by position, items without one last, then the oldest first. */
export const QUEUE_ORDER = [
  { learnPosition: { sort: 'asc', nulls: 'last' } },
  { createdAt: 'asc' },
  { id: 'asc' },
] satisfies Prisma.ItemOrderByWithRelationInput[];

/** The vocabulary items of the user's learning queue. */
export const IN_QUEUE = (userId: string) =>
  ({ userId, type: 'Vocabulary', learningStatus: 'ToLearn' }) satisfies Prisma.ItemWhereInput;

/** The ids of the queue, in its order. */
export async function queueIds(db: Db, userId: string): Promise<string[]> {
  const items = await db.item.findMany({ where: IN_QUEUE(userId), orderBy: QUEUE_ORDER, select: { id: true } });
  return items.map((item) => item.id);
}

/**
 * Numbers the learning queue 1, 2, 3… (MEM-61): in the given order, or in
 * its current one (an item that left it leaves no gap, a new one without
 * position goes last). The items out of the queue lose their position. Two
 * queries, whatever the size of the queue.
 */
export async function renumberQueue(db: Db, userId: string, order?: string[]): Promise<void> {
  const ids = order ?? (await queueIds(db, userId));
  const positions = ids.map((_, index) => index + 1);
  await db.$executeRaw`
    UPDATE "items" SET "learnPosition" = CASE
      WHEN "learningStatus" = 'ToLearn' THEN queue.position
      ELSE NULL
    END
    FROM unnest(${ids}::text[], ${positions}::int[]) AS queue(id, position)
    WHERE "items"."id" = queue.id AND "items"."userId" = ${userId}`;
  await db.$executeRaw`
    UPDATE "items" SET "learnPosition" = NULL
    WHERE "userId" = ${userId} AND "learnPosition" IS NOT NULL AND NOT ("id" = ANY(${ids}::text[]))`;
}
