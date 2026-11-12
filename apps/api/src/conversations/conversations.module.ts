import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module.js';
import { PronunciationModule } from '../pronunciation/pronunciation.module.js';
import { PronunciationAssessmentModule } from '../pronunciation-assessment/pronunciation-assessment.module.js';
import { ChatUsageService } from './chat-usage.service.js';
import { ConversationAccess, ConversationAccessGuard } from './conversation-access.js';
import { ConversationLimitsService } from './conversation-limits.js';
import { ConversationRateGuard, ConversationSpeechRateGuard } from './conversation-rate.guard.js';
import { ConversationSpeech } from './conversation-speech.js';
import { ConversationVoiceInput } from './conversation-voice-input.js';
import { ConversationsController } from './conversations.controller.js';
import { ConversationsService } from './conversations.service.js';
import { AnthropicConversationModel, type Effort } from './model/anthropic-conversation-model.js';
import { CONVERSATION_MODEL } from './model/conversation-model.js';
import { FakeConversationModel } from './model/fake-conversation-model.js';

export const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * MEM-130: the conversations with the AI. Claude when ANTHROPIC_API_KEY and
 * ANTHROPIC_MODEL are set; the fake model when CONVERSATION_AI_FAKE=true
 * (local work only); otherwise null: the feature is off. Open only to the
 * accounts of CONVERSATION_ALLOWED_EMAILS (`*`: everyone).
 */
@Module({
  imports: [AuthModule, PronunciationModule, PronunciationAssessmentModule],
  controllers: [ConversationsController],
  providers: [
    ConversationsService,
    ConversationLimitsService,
    ChatUsageService,
    ConversationRateGuard,
    ConversationSpeechRateGuard,
    ConversationSpeech,
    ConversationVoiceInput,
    ConversationAccess,
    ConversationAccessGuard,
    {
      provide: CONVERSATION_MODEL,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const text = (name: string) => String(config.get(name) ?? '').trim();
        const logger = new Logger('ConversationsModule');
        if (text('CONVERSATION_AI_FAKE') === 'true') {
          logger.warn('Conversations with the fake AI model (CONVERSATION_AI_FAKE=true)');
          return new FakeConversationModel();
        }
        if (!text('ANTHROPIC_API_KEY') || !text('ANTHROPIC_MODEL')) {
          logger.log('Conversations with the AI off (no ANTHROPIC_API_KEY / ANTHROPIC_MODEL)');
          return null;
        }
        return new AnthropicConversationModel(
          text('ANTHROPIC_API_KEY'),
          text('ANTHROPIC_MODEL'),
          Number(text('ANTHROPIC_TIMEOUT_MS') || DEFAULT_TIMEOUT_MS),
          (text('ANTHROPIC_EFFORT') || undefined) as Effort | undefined,
        );
      },
    },
  ],
  // MEM-139: the same model for the cards proposed by the AI; MEM-135: the console.
  exports: [CONVERSATION_MODEL, ConversationsService, ConversationLimitsService, ChatUsageService],
})
export class ConversationsModule {}
