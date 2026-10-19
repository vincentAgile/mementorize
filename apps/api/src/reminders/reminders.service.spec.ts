import { BadRequestException, HttpException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MailService } from '../mail/mail.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { RemindersService } from './reminders.service.js';

describe('RemindersService', () => {
  // 08:05 in Paris (UTC+2 in October).
  const NOW = new Date('2026-10-13T06:05:00Z');

  const prisma = {
    user: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    card: { count: vi.fn() },
  };
  const mail = { enabled: true, send: vi.fn() };
  let service: RemindersService;

  const aUser = (overrides: Record<string, unknown> = {}) => ({
    id: 'user-1',
    email: 'alice@example.fr',
    reminderHour: 8,
    reminderTimeZone: 'Europe/Paris',
    reminderLastSentOn: '2026-10-12',
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mail.enabled = true;
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    prisma.card.count.mockResolvedValue(3);
    mail.send.mockResolvedValue(undefined);
    const config = new ConfigService({ APP_URL: 'https://app.example.fr/', JWT_SECRET: 'secret' });
    service = new RemindersService(prisma as unknown as PrismaService, mail as unknown as MailService, config);
  });

  describe('sendDueReminders', () => {
    it("sends today's reminder once the user's local hour has come", async () => {
      prisma.user.findMany.mockResolvedValue([aUser()]);

      await expect(service.sendDueReminders(NOW)).resolves.toBe(1);

      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'user-1',
          reminderEnabled: true,
          OR: [{ reminderLastSentOn: null }, { reminderLastSentOn: { not: '2026-10-13' } }],
        },
        data: { reminderLastSentOn: '2026-10-13' },
      });
      expect(prisma.card.count).toHaveBeenCalledWith({ where: { due: { lte: NOW }, item: { userId: 'user-1' } } });
      const sentMail = mail.send.mock.calls[0][0];
      expect(sentMail.to).toBe('alice@example.fr');
      expect(sentMail.subject).toContain('3 cartes');
      expect(sentMail.text).toContain('https://app.example.fr/review');
      expect(sentMail.text).toContain('https://app.example.fr/reglages');
      expect(sentMail.headers['List-Unsubscribe']).toMatch(
        /^<https:\/\/app\.example\.fr\/unsubscribe\?user=user-1&token=/,
      );
    });

    it('waits for the hour, in the time zone of the user', async () => {
      // 08:05 in Paris is 02:05 in New York.
      prisma.user.findMany.mockResolvedValue([
        aUser({ reminderHour: 9 }),
        aUser({ reminderTimeZone: 'America/New_York' }),
      ]);

      await expect(service.sendDueReminders(NOW)).resolves.toBe(0);
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('catches up a few hours late, not in the evening', async () => {
      prisma.user.findMany.mockResolvedValue([aUser({ reminderHour: 6 })]);
      await expect(service.sendDueReminders(NOW)).resolves.toBe(1);

      prisma.user.findMany.mockResolvedValue([aUser({ reminderHour: 5 })]);
      await expect(service.sendDueReminders(NOW)).resolves.toBe(0);
    });

    it('sends nothing when the day was already handled, here or by another API container', async () => {
      prisma.user.findMany.mockResolvedValue([aUser({ reminderLastSentOn: '2026-10-13' })]);
      await expect(service.sendDueReminders(NOW)).resolves.toBe(0);

      prisma.user.findMany.mockResolvedValue([aUser()]);
      prisma.user.updateMany.mockResolvedValue({ count: 0 }); // lost the race
      await expect(service.sendDueReminders(NOW)).resolves.toBe(0);
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('sends nothing when nothing is due, and keeps the day as handled', async () => {
      prisma.user.findMany.mockResolvedValue([aUser()]);
      prisma.card.count.mockResolvedValue(0);

      await expect(service.sendDueReminders(NOW)).resolves.toBe(0);
      expect(mail.send).not.toHaveBeenCalled();
      expect(prisma.user.updateMany).toHaveBeenCalledTimes(1);
    });

    it('gives the day back when sending fails, and goes on with the other users', async () => {
      prisma.user.findMany.mockResolvedValue([aUser(), aUser({ id: 'user-2', email: 'bob@example.fr' })]);
      mail.send.mockRejectedValueOnce(new Error('SMTP down'));

      await expect(service.sendDueReminders(NOW)).resolves.toBe(1);
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1', reminderLastSentOn: '2026-10-13' },
        data: { reminderLastSentOn: '2026-10-12' },
      });
      expect(mail.send).toHaveBeenLastCalledWith(expect.objectContaining({ to: 'bob@example.fr' }));
    });

    it('does nothing without SMTP settings', async () => {
      mail.enabled = false;
      await expect(service.sendDueReminders(NOW)).resolves.toBe(0);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });
  });

  describe('unsubscribe', () => {
    it('turns the reminders off with the signed link of the e-mail', async () => {
      await service.unsubscribe('user-1', service.unsubscribeToken('user-1'));
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { reminderEnabled: false },
      });
    });

    it("refuses another user's token, or a forged one", async () => {
      await expect(service.unsubscribe('user-2', service.unsubscribeToken('user-1'))).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.unsubscribe('user-1', 'forged')).rejects.toThrow(BadRequestException);
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('sendTest', () => {
    it('sends right away, then refuses a second test within a minute', async () => {
      prisma.user.findUnique.mockResolvedValue({ email: 'alice@example.fr' });

      await service.sendTest('user-1', NOW);
      expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Mementorize : e-mail de test' }));
      await expect(service.sendTest('user-1', new Date(NOW.getTime() + 30_000))).rejects.toThrow(HttpException);
    });

    it('says so when the server has no SMTP settings', async () => {
      mail.enabled = false;
      await expect(service.sendTest('user-1', NOW)).rejects.toThrow(ServiceUnavailableException);
    });
  });
});
