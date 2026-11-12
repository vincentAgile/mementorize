import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { IsBoolean, IsInt, Max, Min } from 'class-validator';
import { ChatUsageService, type ChatUsageReport } from '../../conversations/chat-usage.service.js';
import { CHAT_BOUNDS, type ChatSettings, ConversationLimitsService } from '../../conversations/conversation-limits.js';
import { type ChatState, ConversationsService } from '../../conversations/conversations.service.js';
import { AdminJwtGuard } from '../admin-jwt.guard.js';

export class ChatSettingsDto {
  @IsBoolean()
  enabled!: boolean;

  @IsInt()
  @Min(CHAT_BOUNDS.messagesPerDay.min)
  @Max(CHAT_BOUNDS.messagesPerDay.max)
  messagesPerDay!: number;

  @IsInt()
  @Min(CHAT_BOUNDS.messagesPerConversation.min)
  @Max(CHAT_BOUNDS.messagesPerConversation.max)
  messagesPerConversation!: number;

  @IsInt()
  @Min(CHAT_BOUNDS.maxReplyWords.min)
  @Max(CHAT_BOUNDS.maxReplyWords.max)
  maxReplyWords!: number;
}

export type AdminChatSettings = ChatSettings & { state: ChatState };

/**
 * MEM-135: the Chat IA in the console: its parameters (Console ›
 * Paramètres) and what it costs (Console › Consommation IA). Apart from
 * « Générer avec l'IA »: turning one off leaves the other. Every route needs
 * an administration token (AdminJwtGuard): 401 with a user token. No route
 * gives the text of a conversation.
 */
@Controller('admin/chat')
@UseGuards(AdminJwtGuard)
export class AdminChatController {
  constructor(
    private readonly limits: ConversationLimitsService,
    private readonly conversations: ConversationsService,
    private readonly usage: ChatUsageService,
  ) {}

  /** GET /admin/chat/settings — { enabled, messagesPerDay, messagesPerConversation, maxReplyWords, state }. */
  @Get('settings')
  async settings(): Promise<AdminChatSettings> {
    const [settings, state] = await Promise.all([this.limits.settingsNow(), this.conversations.state()]);
    return { ...settings, state };
  }

  /** PUT /admin/chat/settings — bounded: 1 to 500 per day, 2 to 100 per conversation, 30 to 300 words. */
  @Put('settings')
  async update(@Body() dto: ChatSettingsDto): Promise<AdminChatSettings> {
    const settings = await this.limits.set({
      enabled: dto.enabled,
      messagesPerDay: dto.messagesPerDay,
      messagesPerConversation: dto.messagesPerConversation,
      maxReplyWords: dto.maxReplyWords,
    });
    return { ...settings, state: await this.conversations.state() };
  }

  /** GET /admin/chat/usage — the last 30 days, and the 10 biggest users of the month; numbers only. */
  @Get('usage')
  usageReport(): Promise<ChatUsageReport> {
    return this.usage.report();
  }
}
