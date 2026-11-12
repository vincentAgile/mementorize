import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { consoleDay, firstKeptDay, increments, reportDays, TOP_USERS } from '../app-settings/console-usage.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface ChatCounts {
  conversations?: number;
  messages?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface ChatUsageDay {
  /** YYYY-MM-DD, Europe/Paris. */
  day: string;
  conversations: number;
  messages: number;
  activeUsers: number;
  inputTokens: number;
  outputTokens: number;
}

export interface ChatTopUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  messages: number;
  inputTokens: number;
  outputTokens: number;
}

export interface ChatUsageReport {
  days: ChatUsageDay[];
  /** YYYY-MM. */
  month: string;
  top: ChatTopUser[];
}

/**
 * MEM-135: what the Chat IA costs, for the console: counters per user and
 * per day (conversations started, messages answered, tokens of the
 * evaluations and replies), never a text. Written beside each call, without
 * holding it up; kept 13 months.
 */
@Injectable()
export class ChatUsageService {
  private readonly logger = new Logger('ChatUsage');

  constructor(private readonly prisma: PrismaService) {}

  /** Adds these counts to the user's day (a negative one takes back: a failed message). */
  async record(userId: string, counts: ChatCounts, now = new Date()): Promise<void> {
    const { empty, create, update } = increments({ ...counts });
    if (empty) return;
    const day = consoleDay(now);
    try {
      await this.prisma.chatUsage.upsert({
        where: { userId_day: { userId, day } },
        create: { userId, day, ...create },
        update,
      });
    } catch (error) {
      // a counter missed must never fail the conversation
      this.logger.warn(`usage not recorded for user=${userId}: ${(error as Error).message}`);
    }
  }

  /** The last 30 days (each one, even without a message), and the 10 biggest users of the month. */
  async report(now = new Date()): Promise<ChatUsageReport> {
    const days = reportDays(now);
    const month = days[0].slice(0, 7);
    const rows = await this.prisma.chatUsage.findMany({
      where: { day: { gte: days.at(-1)!, lte: days[0] } },
      select: { day: true, conversations: true, messages: true, inputTokens: true, outputTokens: true },
    });
    const byDay = new Map<string, ChatUsageDay>(
      days.map((day) => [day, { day, conversations: 0, messages: 0, activeUsers: 0, inputTokens: 0, outputTokens: 0 }]),
    );
    for (const row of rows) {
      const total = byDay.get(row.day);
      if (!total) continue;
      total.conversations += row.conversations;
      total.messages += row.messages;
      total.inputTokens += row.inputTokens;
      total.outputTokens += row.outputTokens;
      if (row.messages > 0 || row.conversations > 0) total.activeUsers++;
    }

    const grouped = await this.prisma.chatUsage.groupBy({
      by: ['userId'],
      where: { day: { startsWith: `${month}-` }, messages: { gt: 0 } },
      _sum: { messages: true, inputTokens: true, outputTokens: true },
      orderBy: [{ _sum: { messages: 'desc' } }, { _sum: { outputTokens: 'desc' } }],
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
              messages: group._sum.messages ?? 0,
              inputTokens: group._sum.inputTokens ?? 0,
              outputTokens: group._sum.outputTokens ?? 0,
            },
          ]
        : [];
    });
    return { days: days.map((day) => byDay.get(day)!), month, top };
  }

  /** Every night: the counters of more than 13 months. */
  @Cron('53 3 * * *', { name: 'chat-usage-purge', waitForCompletion: true })
  async purge(now = new Date()): Promise<number> {
    const { count } = await this.prisma.chatUsage.deleteMany({ where: { day: { lt: firstKeptDay(now) } } });
    return count;
  }
}
