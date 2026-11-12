import { Injectable } from '@nestjs/common';
import { AppSettingsService } from '../app-settings/app-settings.service.js';
import { DEFAULT_REPLY_WORDS } from './model/prompts.js';

/** MEM-130: the limits of the conversations with the AI, to keep the cost in hand. */
export interface ConversationLimits {
  /** Messages of a user per day, in the user's time zone. */
  messagesPerDay: number;
  /** Messages of the user in one conversation. */
  messagesPerConversation: number;
  /** Characters of a message of the user. */
  maxLength: number;
  /** MEM-135: words of a reply of the AI, at most (asked in its instructions). */
  maxReplyWords: number;
}

export const DEFAULT_LIMITS: ConversationLimits = {
  messagesPerDay: 30,
  messagesPerConversation: 20,
  maxLength: 1000,
  maxReplyWords: DEFAULT_REPLY_WORDS,
};

/** MEM-135: the bounds of the console. */
export const CHAT_BOUNDS = {
  messagesPerDay: { min: 1, max: 500 },
  messagesPerConversation: { min: 2, max: 100 },
  maxReplyWords: { min: 30, max: 300 },
} as const;

/** The key of the parameters of the Chat IA, apart from those of « Générer avec l'IA ». */
export const CHAT_SETTINGS_KEY = 'chat';

/** MEM-135: what the console sets. */
export interface ChatSettings {
  /** Off: the Chat IA is off for everyone, even with an AI configured. */
  enabled: boolean;
  messagesPerDay: number;
  messagesPerConversation: number;
  maxReplyWords: number;
}

export const DEFAULT_CHAT_SETTINGS: ChatSettings = {
  enabled: true,
  messagesPerDay: DEFAULT_LIMITS.messagesPerDay,
  messagesPerConversation: DEFAULT_LIMITS.messagesPerConversation,
  maxReplyWords: DEFAULT_LIMITS.maxReplyWords,
};

/** What is stored, checked: the default for what is missing or out of its bounds. */
export function chatSettingsOf(value: unknown): ChatSettings {
  const saved = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const bounded = (key: keyof typeof CHAT_BOUNDS) => {
    const number = saved[key];
    const { min, max } = CHAT_BOUNDS[key];
    return Number.isInteger(number) && (number as number) >= min && (number as number) <= max
      ? (number as number)
      : DEFAULT_CHAT_SETTINGS[key];
  };
  return {
    enabled: typeof saved.enabled === 'boolean' ? saved.enabled : DEFAULT_CHAT_SETTINGS.enabled,
    messagesPerDay: bounded('messagesPerDay'),
    messagesPerConversation: bounded('messagesPerConversation'),
    maxReplyWords: bounded('maxReplyWords'),
  };
}

/** Requests per second and per user, on every route of the conversations. */
export const REQUESTS_PER_SECOND = 3;

/**
 * Where the limits are read: the parameters of the app, set in the console
 * (MEM-135, Console › Paramètres), with a cache of 60 seconds at most. The
 * service asks for them at each message, so a change applies at once.
 */
@Injectable()
export class ConversationLimitsService {
  constructor(private readonly settings: AppSettingsService) {}

  async settingsNow(): Promise<ChatSettings> {
    return chatSettingsOf(await this.settings.get(CHAT_SETTINGS_KEY));
  }

  async current(): Promise<ConversationLimits> {
    const { messagesPerDay, messagesPerConversation, maxReplyWords } = await this.settingsNow();
    return { messagesPerDay, messagesPerConversation, maxLength: DEFAULT_LIMITS.maxLength, maxReplyWords };
  }

  async set(next: ChatSettings): Promise<ChatSettings> {
    await this.settings.set(CHAT_SETTINGS_KEY, { ...next });
    return next;
  }
}
