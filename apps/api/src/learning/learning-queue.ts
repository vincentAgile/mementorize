import type { ItemType } from '@prisma/client';
import { Prisma } from '@prisma/client';

/** What the queue functions need: the Prisma client, or a transaction. */
type Db = Pick<Prisma.TransactionClient, 'item' | '$executeRaw'>;

/**
 * The types of item that have a learning queue: the vocabulary (MEM-61)
 * and the quotes (MEM-67), each with its own queue and its own positions.
 */
export const QUEUE_TYPES = ['Vocabulary', 'Quote'] as const satisfies readonly ItemType[];
export type QueueType = (typeof QUEUE_TYPES)[number];

export const hasQueue = (type: ItemType): type is QueueType => (QUEUE_TYPES as readonly ItemType[]).includes(type);

/** The order of the learning queue (MEM-61): by position, items without one last, then the oldest first. */
export const QUEUE_ORDER = [
  { learnPosition: { sort: 'asc', nulls: 'last' } },
  { createdAt: 'asc' },
  { id: 'asc' },
] satisfies Prisma.ItemOrderByWithRelationInput[];

/** The items of the user's learning queue of this type. */
export const IN_QUEUE = (userId: string, type: QueueType) =>
  ({ userId, type, learningStatus: 'ToLearn' }) satisfies Prisma.ItemWhereInput;

/** The ids of the queue, in its order. */
export async function queueIds(db: Db, userId: string, type: QueueType): Promise<string[]> {
  const items = await db.item.findMany({ where: IN_QUEUE(userId, type), orderBy: QUEUE_ORDER, select: { id: true } });
  return items.map((item) => item.id);
}

/**
 * Numbers the learning queue of this type 1, 2, 3… (MEM-61): in the given
 * order, or in its current one (an item that left it leaves no gap, a new
 * one without position goes last). The items of this type out of the queue
 * lose their position; the queue of the other type is not touched (MEM-67).
 * Two queries, whatever the size of the queue.
 */
export async function renumberQueue(db: Db, userId: string, type: QueueType, order?: string[]): Promise<void> {
  const ids = order ?? (await queueIds(db, userId, type));
  const positions = ids.map((_, index) => index + 1);
  await db.$executeRaw`
    UPDATE "items" SET "learnPosition" = CASE
      WHEN "learningStatus" = 'ToLearn' THEN queue.position
      ELSE NULL
    END
    FROM unnest(${ids}::text[], ${positions}::int[]) AS queue(id, position)
    WHERE "items"."id" = queue.id AND "items"."userId" = ${userId} AND "items"."type" = ${type}::"ItemType"`;
  await db.$executeRaw`
    UPDATE "items" SET "learnPosition" = NULL
    WHERE "userId" = ${userId} AND "type" = ${type}::"ItemType" AND "learnPosition" IS NOT NULL
      AND NOT ("id" = ANY(${ids}::text[]))`;
}
