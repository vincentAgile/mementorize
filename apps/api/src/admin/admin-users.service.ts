import { Injectable } from '@nestjs/common';
import type { ItemType, LearningStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

/** The items of a space (Anglais, Citations), per state. */
export type StatusCounts = Record<LearningStatus, number> & { total: number };

/** The mind maps: how many maps, and their branches in review or learned (MEM-48). */
export interface MindMapCounts {
  total: number;
  branchesInReview: number;
  branchesLearned: number;
}

export interface SpaceCounts {
  Vocabulary: StatusCounts;
  Quote: StatusCounts;
  MindMap: MindMapCounts;
  /** Every item, all spaces. */
  total: number;
}

/** A user as the console shows them (MEM-84): their account and counters, never the content of an item. */
export interface AdminUserRow {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  createdAt: Date;
  lastActiveAt: Date | null;
  counts: SpaceCounts;
}

export interface AdminUserList {
  users: AdminUserRow[];
  /** The same counters, for all the users together. */
  totals: SpaceCounts;
}

/** One row of the aggregation: the items of a user, of a type, in a state. */
interface CountRow {
  userId: string;
  type: ItemType;
  learningStatus: LearningStatus;
  items: number;
  branchesInReview: number;
  branchesLearned: number;
}

const statusCounts = (): StatusCounts => ({ Waiting: 0, ToLearn: 0, Learning: 0, Learned: 0, total: 0 });
const emptyCounts = (): SpaceCounts => ({
  Vocabulary: statusCounts(),
  Quote: statusCounts(),
  MindMap: { total: 0, branchesInReview: 0, branchesLearned: 0 },
  total: 0,
});

function add(counts: SpaceCounts, row: CountRow): void {
  counts.total += row.items;
  if (row.type === 'MindMap') {
    counts.MindMap.total += row.items;
    counts.MindMap.branchesInReview += row.branchesInReview;
    counts.MindMap.branchesLearned += row.branchesLearned;
  } else {
    counts[row.type][row.learningStatus] += row.items;
    counts[row.type].total += row.items;
  }
}

/**
 * MEM-84: the users of the console, with their counters. The counters come
 * from one grouped query (per user, type and state), never one per user;
 * nothing of the content of the items leaves the database.
 */
@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<AdminUserList> {
    const [users, rows] = await Promise.all([
      this.prisma.user.findMany({
        select: { id: true, email: true, firstName: true, lastName: true, createdAt: true, lastActiveAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      // The branches of a mind map are its cards: in review, or learned (« Appris », MEM-48).
      this.prisma.$queryRaw<CountRow[]>`
        SELECT i."userId", i."type", i."learningStatus",
               COUNT(*)::int AS "items",
               COALESCE(SUM(b."inReview"), 0)::int AS "branchesInReview",
               COALESCE(SUM(b."learned"), 0)::int AS "branchesLearned"
        FROM "items" i
        LEFT JOIN LATERAL (
          SELECT COUNT(*) FILTER (WHERE c."learnedAt" IS NULL) AS "inReview",
                 COUNT(*) FILTER (WHERE c."learnedAt" IS NOT NULL) AS "learned"
          FROM "cards" c
          WHERE c."itemId" = i."id" AND i."type" = 'MindMap'
        ) b ON TRUE
        GROUP BY i."userId", i."type", i."learningStatus"`,
    ]);

    const byUser = new Map(users.map((user) => [user.id, { ...user, counts: emptyCounts() }]));
    const totals = emptyCounts();
    for (const row of rows) {
      const user = byUser.get(row.userId);
      if (!user) continue; // registered after the list of users was read
      add(user.counts, row);
      add(totals, row);
    }
    return { users: [...byUser.values()], totals };
  }
}
