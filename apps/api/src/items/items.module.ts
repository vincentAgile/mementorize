import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SchedulingModule } from '../scheduling/scheduling.module.js';
import { ItemsController } from './items.controller.js';
import { ItemsService } from './items.service.js';
import { QuotesController } from './quotes/quotes.controller.js';
import { VocabularyController } from './vocabulary/vocabulary.controller.js';

@Module({
  imports: [AuthModule, SchedulingModule], // JwtAuthGuard, SchedulerService
  controllers: [ItemsController, QuotesController, VocabularyController],
  providers: [ItemsService],
})
export class ItemsModule {}
