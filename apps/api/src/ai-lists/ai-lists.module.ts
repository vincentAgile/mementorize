import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ConversationsModule } from '../conversations/conversations.module.js';
import { AiListLimitsService } from './ai-list-limits.js';
import { AiListsController } from './ai-lists.controller.js';
import { AiListsService } from './ai-lists.service.js';

/** MEM-139: the cards proposed by the AI, with the model of the Chat IA (ConversationsModule). */
@Module({
  imports: [AuthModule, ConversationsModule],
  controllers: [AiListsController],
  providers: [AiListsService, AiListLimitsService],
})
export class AiListsModule {}
