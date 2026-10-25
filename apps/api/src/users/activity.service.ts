import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/** The last activity is kept to the hour: rewritten only when it is older. */
export const ACTIVITY_PRECISION_MS = 60 * 60 * 1000;

/** Beyond this many users remembered, the memory starts over (it is only a shortcut). */
const MAX_REMEMBERED = 10_000;

/**
 * The date of the last use of the app, per user (MEM-83): an authenticated
 * call to the API, a login, a renewal of the session (MEM-85). The
 * automatic tasks (reminders, purges) don't go through here.
 *
 * Not on every request: the date is rewritten only when it is more than an
 * hour old, and this process remembers when it last wrote it for each user,
 * so most requests don't touch the database at all. Never awaited by the
 * request: a failure is logged, the request goes on.
 */
@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);
  /** userId → when this process last recorded an activity for them. */
  private readonly recorded = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  /** Records an activity of the user now, if the last one is more than an hour old. Never throws. */
  async touch(userId: string, now = new Date()): Promise<void> {
    const last = this.recorded.get(userId);
    if (last !== undefined && now.getTime() - last < ACTIVITY_PRECISION_MS) return;
    if (this.recorded.size >= MAX_REMEMBERED) this.recorded.clear();
    this.recorded.set(userId, now.getTime());
    try {
      // Conditional: another API container (during a deployment) may have written it already.
      await this.prisma.user.updateMany({
        where: {
          id: userId,
          OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: new Date(now.getTime() - ACTIVITY_PRECISION_MS) } }],
        },
        data: { lastActiveAt: now },
      });
    } catch (error) {
      this.recorded.delete(userId); // to try again at the next request
      this.logger.warn(`Could not record the activity of user ${userId}: ${String(error)}`);
    }
  }
}
