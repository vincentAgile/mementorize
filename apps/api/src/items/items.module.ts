import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PronunciationModule } from '../pronunciation/pronunciation.module.js';
import { SchedulingModule } from '../scheduling/scheduling.module.js';
import { ItemsController } from './items.controller.js';
import { ItemsService } from './items.service.js';
import { MindMapsController } from './mind-maps/mind-maps.controller.js';
import { QuotesController } from './quotes/quotes.controller.js';
import { VocabularyCsvController } from './vocabulary/csv/vocabulary-csv.controller.js';
import { VocabularyCsvService } from './vocabulary/csv/vocabulary-csv.service.js';
import { VocabularyController } from './vocabulary/vocabulary.controller.js';

@Module({
  imports: [AuthModule, SchedulingModule, PronunciationModule], // JwtAuthGuard, SchedulerService, PronunciationService
  controllers: [ItemsController, QuotesController, VocabularyController, VocabularyCsvController, MindMapsController],
  providers: [ItemsService, VocabularyCsvService],
})
export class ItemsModule {}
