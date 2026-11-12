import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { localDate } from '../reminders/local-time.js';

/** The days of the console. */
export const CONSOLE_TIME_ZONE = 'Europe/Paris';
/** The counters are kept 13 months. */
export const KEPT_MONTHS = 13;
/** The table of the console: the last 30 days, today included. */
export const REPORT_DAYS = 30;
export const TOP_USERS = 10;

export interface UsageCounts {
  generations?: number;
  proposed?: number;
  added?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface UsageDay {
  /** YYYY-MM-DD, Europe/Paris. */
  day: string;
  generations: number;
  activeUsers: number;
  proposed: number;
  added: number;
  inputTokens: number;
  outputTokens: number;
}

export interface UsageTopUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  generations: number;
  inputTokens: number;
  outputTokens: number;
}

export interface UsageReport {
  days: UsageDay[];
  /** The month of the top users: YYYY-MM. */
  month: string;
  top: UsageTopUser[];
}

/** The day before a YYYY-MM-DD. */
const dayBefore = (day: string) => new Date(Date.parse(`${day}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

/**
 * MEM-143: what the generations of cards by the AI cost, for the console:
 * counters per user and per day (generations, cards proposed and added,
 * tokens), never a theme or a card. Written beside each call, without
 * holding it up; kept 13 months.
 */
@Injectable()
export class AiListUsageService {
  private readonly logger = new Logger('AiListUsage');

  constructor(private readonly prisma: PrismaService) {}

  /** Adds these counts to the user's day (a negative one takes back: a failed generation). */
  async record(userId: string, counts: UsageCounts, now = new Date()): Promise<void> {
    const values = Object.fromEntries(Object.entries(counts).filter(([, value]) => value)) as UsageCounts;
    if (Object.keys(values).length === 0) return;
    const day = localDate(now, CONSOLE_TIME_ZONE);
    try {
      await this.prisma.aiListUsage.upsert({
        where: { userId_day: { userId, day } },
        create: {
          userId,
          day,
          ...Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Math.max(0, value)])),
        },
        update: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { increment: value }])),
      });
    } catch (error) {
      // a counter missed must never fail the generation
      this.logger.warn(`usage not recorded for user=${userId}: ${(error as Error).message}`);
    }
  }

  /** The last 30 days (each one, even without a generation), and the 10 biggest users of the month. */
  async report(now = new Date()): Promise<UsageReport> {
    const today = localDate(now, CONSOLE_TIME_ZONE);
    const days = [today];
    while (days.length < REPORT_DAYS) days.push(dayBefore(days.at(-1)!));
    const first = days.at(-1)!;
    const month = today.slice(0, 7);

    const rows = await this.prisma.aiListUsage.findMany({
      where: { day: { gte: first, lte: today } },
      select: {
        day: true,
        generations: true,
        proposed: true,
        added: true,
        inputTokens: true,
        outputTokens: true,
      },
    });
    const byDay = new Map<string, UsageDay>(
      days.map((day) => [
        day,
        { day, generations: 0, activeUsers: 0, proposed: 0, added: 0, inputTokens: 0, outputTokens: 0 },
      ]),
    );
    for (const row of rows) {
      const total = byDay.get(row.day);
      if (!total) continue;
      total.generations += row.generations;
      total.proposed += row.proposed;
      total.added += row.added;
      total.inputTokens += row.inputTokens;
      total.outputTokens += row.outputTokens;
      if (row.generations > 0) total.activeUsers++;
    }

    const grouped = await this.prisma.aiListUsage.groupBy({
      by: ['userId'],
      where: { day: { startsWith: `${month}-` }, generations: { gt: 0 } },
      _sum: { generations: true, inputTokens: true, outputTokens: true },
      orderBy: [{ _sum: { generations: 'desc' } }, { _sum: { outputTokens: 'desc' } }],
      take: TOP_USERS,
    });
    const users = await this.prisma.user.findMany({
      where: { id: { in: grouped.map((group) => group.userId) } },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    const userOf = new Map(users.map((user) => [user.id, user]));
    const top = grouped.flatMap((group) => {
      const user = userOf.get(group.userId);
      return user
        ? [
            {
              ...user,
              generations: group._sum.generations ?? 0,
              inputTokens: group._sum.inputTokens ?? 0,
              outputTokens: group._sum.outputTokens ?? 0,
            },
          ]
        : [];
    });
    return { days: days.map((day) => byDay.get(day)!), month, top };
  }

  /** Every night: the counters of more than 13 months. */
  @Cron('47 3 * * *', { name: 'ai-list-usage-purge', waitForCompletion: true })
  async purge(now = new Date()): Promise<number> {
    const limit = new Date(now);
    limit.setUTCMonth(limit.getUTCMonth() - KEPT_MONTHS);
    const { count } = await this.prisma.aiListUsage.deleteMany({
      where: { day: { lt: localDate(limit, CONSOLE_TIME_ZONE) } },
    });
    return count;
  }
}
