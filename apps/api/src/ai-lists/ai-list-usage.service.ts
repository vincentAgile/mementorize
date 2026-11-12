import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { consoleDay, firstKeptDay, increments, reportDays, TOP_USERS } from '../app-settings/console-usage.js';
import { PrismaService } from '../prisma/prisma.service.js';

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
    const { empty, create, update } = increments({ ...counts });
    if (empty) return;
    const day = consoleDay(now);
    try {
      await this.prisma.aiListUsage.upsert({
        where: { userId_day: { userId, day } },
        create: { userId, day, ...create },
        update,
      });
    } catch (error) {
      // a counter missed must never fail the generation
      this.logger.warn(`usage not recorded for user=${userId}: ${(error as Error).message}`);
    }
  }

  /** The last 30 days (each one, even without a generation), and the 10 biggest users of the month. */
  async report(now = new Date()): Promise<UsageReport> {
    const days = reportDays(now);
    const today = days[0];
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
    const { count } = await this.prisma.aiListUsage.deleteMany({ where: { day: { lt: firstKeptDay(now) } } });
    return count;
  }
}
