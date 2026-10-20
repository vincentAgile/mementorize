import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ReminderSettingsDto } from './dto/reminder-settings.dto.js';
import { localDateAndHour } from './local-time.js';
import { type ReminderLinks, reminderEmail } from './reminder-email.js';

export interface ReminderSettings {
  enabled: boolean;
  hour: number;
  timeZone: string;
  /** False when the server has no SMTP settings: nothing can be sent. */
  emailAvailable: boolean;
}

/**
 * If the API was down (a deployment, a restart) at the chosen hour, the
 * reminder still goes out during the following hours, but not later: a
 * reminder at 8 shouldn't arrive in the evening.
 */
export const CATCH_UP_HOURS = 3;

/** Minimum delay between two test e-mails of the same user. */
const TEST_INTERVAL_MS = 60_000;

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);
  private readonly appUrl: string;
  private readonly secret: string;
  private readonly lastTest = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    config: ConfigService,
  ) {
    this.appUrl = (config.get<string>('APP_URL') ?? '').trim().replace(/\/+$/, '');
    this.secret = config.getOrThrow<string>('JWT_SECRET');
  }

  async getSettings(userId: string): Promise<ReminderSettings> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { reminderEnabled: true, reminderHour: true, reminderTimeZone: true },
    });
    if (!user) throw new NotFoundException();
    return this.toSettings(user);
  }

  async updateSettings(userId: string, dto: ReminderSettingsDto): Promise<ReminderSettings> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { reminderEnabled: dto.enabled, reminderHour: dto.hour, reminderTimeZone: dto.timeZone },
      select: { reminderEnabled: true, reminderHour: true, reminderTimeZone: true },
    });
    return this.toSettings(user);
  }

  /** Sends the reminder right away, whatever the settings: checks that e-mails work. */
  async sendTest(userId: string, now = new Date()): Promise<void> {
    if (!this.mail.enabled) {
      throw new ServiceUnavailableException("L'envoi d'e-mails n'est pas configuré sur ce serveur.");
    }
    const last = this.lastTest.get(userId);
    if (last !== undefined && now.getTime() - last < TEST_INTERVAL_MS) {
      throw new HttpException(
        'Un e-mail de test vient de partir : réessaie dans une minute.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) throw new NotFoundException();

    this.lastTest.set(userId, now.getTime());
    const due = await this.dueCount(userId, now);
    try {
      await this.mail.send(reminderEmail(user.email, due, this.links(userId), true));
    } catch (error) {
      this.logger.error(`Test e-mail to user ${userId} failed: ${String(error)}`);
      throw new BadGatewayException("Le serveur d'e-mails a refusé l'envoi.");
    }
  }

  /**
   * Turns the reminders off from the link of an e-mail, without being
   * logged in: the link carries a signature of the user id, which only the
   * API can produce.
   */
  async unsubscribe(userId: string, token: string): Promise<void> {
    const expected = Buffer.from(this.unsubscribeToken(userId));
    const given = Buffer.from(token);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      throw new BadRequestException('Lien de désinscription invalide.');
    }
    await this.prisma.user.updateMany({ where: { id: userId }, data: { reminderEnabled: false } });
  }

  /**
   * Run every few minutes (RemindersScheduler): sends today's reminder to
   * the users whose hour has come and who have something to review.
   * Returns how many e-mails were sent.
   */
  async sendDueReminders(now = new Date()): Promise<number> {
    if (!this.mail.enabled) return 0;

    const users = await this.prisma.user.findMany({
      where: { reminderEnabled: true },
      select: { id: true, email: true, reminderHour: true, reminderTimeZone: true, reminderLastSentOn: true },
    });

    let sent = 0;
    for (const user of users) {
      let claimedDay: string | null = null;
      try {
        const { date, hour } = localDateAndHour(now, user.reminderTimeZone);
        const inWindow = hour >= user.reminderHour && hour < user.reminderHour + CATCH_UP_HOURS;
        if (!inWindow || user.reminderLastSentOn === date) continue;

        // Claims the day before sending, in one atomic UPDATE: if two API
        // containers run this at the same time (during a deployment), only
        // one of them gets count = 1 and sends.
        const claim = await this.prisma.user.updateMany({
          where: {
            id: user.id,
            reminderEnabled: true,
            OR: [{ reminderLastSentOn: null }, { reminderLastSentOn: { not: date } }],
          },
          data: { reminderLastSentOn: date },
        });
        if (claim.count === 0) continue;
        claimedDay = date;

        // Nothing due at the chosen hour: no e-mail today.
        const due = await this.dueCount(user.id, now);
        if (due === 0) continue;

        await this.mail.send(reminderEmail(user.email, due, this.links(user.id)));
        sent++;
      } catch (error) {
        this.logger.error(`Reminder for user ${user.id} failed: ${String(error)}`);
        // Gives the day back, so that the next run tries again.
        if (claimedDay) {
          await this.prisma.user
            .updateMany({
              where: { id: user.id, reminderLastSentOn: claimedDay },
              data: { reminderLastSentOn: user.reminderLastSentOn },
            })
            .catch(() => undefined);
        }
      }
    }
    if (sent > 0) this.logger.log(`${sent} reminder(s) sent`);
    return sent;
  }

  unsubscribeToken(userId: string): string {
    return createHmac('sha256', this.secret).update(`reminders-unsubscribe:${userId}`).digest('base64url');
  }

  private links(userId: string): ReminderLinks {
    const query = new URLSearchParams({ user: userId, token: this.unsubscribeToken(userId) });
    return {
      home: `${this.appUrl}/`,
      settings: `${this.appUrl}/reglages`,
      unsubscribe: `${this.appUrl}/unsubscribe?${query.toString()}`,
    };
  }

  private dueCount(userId: string, now: Date): Promise<number> {
    return this.prisma.card.count({ where: { due: { lte: now }, item: { userId } } });
  }

  private toSettings(user: { reminderEnabled: boolean; reminderHour: number; reminderTimeZone: string }) {
    return {
      enabled: user.reminderEnabled,
      hour: user.reminderHour,
      timeZone: user.reminderTimeZone,
      emailAvailable: this.mail.enabled,
    };
  }
}
