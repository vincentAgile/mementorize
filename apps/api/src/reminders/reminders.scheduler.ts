import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RemindersService } from './reminders.service.js';

/**
 * The scheduled task (@nestjs/schedule): every 10 minutes, a look at whose
 * reminder is due. Each user chooses an hour in their own time zone, so a
 * fixed daily time wouldn't do; and running often lets a reminder missed
 * during a restart go out a little later.
 */
@Injectable()
export class RemindersScheduler {
  constructor(private readonly reminders: RemindersService) {}

  // waitForCompletion: never two runs at once in the same process (a slow
  // SMTP server could make one last longer than 10 minutes).
  @Cron('*/10 * * * *', { name: 'reminders', waitForCompletion: true })
  run(): Promise<number> {
    return this.reminders.sendDueReminders();
  }
}
