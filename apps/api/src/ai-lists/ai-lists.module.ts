import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ConversationsModule } from '../conversations/conversations.module.js';
import { ItemsModule } from '../items/items.module.js';
import { PronunciationModule } from '../pronunciation/pronunciation.module.js';
import { AiListLimitsService } from './ai-list-limits.js';
import { AiListUsageService } from './ai-list-usage.service.js';
import { AiListsController } from './ai-lists.controller.js';
import { AiListsAddService } from './ai-lists-add.service.js';
import { AiListsService } from './ai-lists.service.js';

/**
 * MEM-139: the cards proposed by the AI, with the model of the Chat IA
 * (ConversationsModule); MEM-141: added as by hand (ItemsModule).
 */
@Module({
  imports: [AuthModule, ConversationsModule, ItemsModule, PronunciationModule],
  controllers: [AiListsController],
  providers: [AiListsService, AiListsAddService, AiListLimitsService, AiListUsageService],
  // MEM-143: the console sets the parameters and reads the counters.
  exports: [AiListsService, AiListLimitsService, AiListUsageService],
})
export class AiListsModule {}
