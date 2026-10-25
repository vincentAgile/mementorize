import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service.js';

@Module({
  providers: [
    {
      provide: SchedulerService,
      // How Mementorize schedules: SCHEDULER_PARAMS (MEM-74).
      useFactory: () => new SchedulerService(),
    },
  ],
  exports: [SchedulerService],
})
export class SchedulingModule {}
