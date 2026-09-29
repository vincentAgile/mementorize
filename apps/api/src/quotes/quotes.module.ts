import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SchedulingModule } from '../scheduling/scheduling.module.js';
import { QuotesController } from './quotes.controller.js';
import { QuotesService } from './quotes.service.js';

@Module({
  imports: [AuthModule, SchedulingModule], // JwtAuthGuard, SchedulerService
  controllers: [QuotesController],
  providers: [QuotesService],
})
export class QuotesModule {}
