import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service.js';

@Module({
  providers: [
    {
      provide: SchedulerService,
      // Default FSRS parameters; the target retention is that of the card's
      // space (MEM-75, 90 % by default). Fuzz, which adds a
      // little randomness to long intervals so that cards learned the same
      // day don't all come back the same day, stays off for now: this way
      // the delay shown on each button is exactly the one you get. Worth
      // turning on once there are hundreds of cards.
      useFactory: () => new SchedulerService({ enable_fuzz: false }),
    },
  ],
  exports: [SchedulerService],
})
export class SchedulingModule {}
