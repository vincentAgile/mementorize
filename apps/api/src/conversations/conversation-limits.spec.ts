import { describe, expect, it, vi } from 'vitest';
import type { AppSettingsService } from '../app-settings/app-settings.service.js';
import { AiListLimitsService } from '../ai-lists/ai-list-limits.js';
import { chatSettingsOf, ConversationLimitsService } from './conversation-limits.js';
import { replySystemPrompt, REPLY_SYSTEM_PROMPT } from './model/prompts.js';

describe('The parameters of the Chat IA (MEM-135)', () => {
  it('what is stored, checked: the default for what is missing or out of its bounds', () => {
    const defaults = { enabled: true, messagesPerDay: 30, messagesPerConversation: 20, maxReplyWords: 120 };
    expect(chatSettingsOf(null)).toEqual(defaults);
    expect(
      chatSettingsOf({ enabled: false, messagesPerDay: 500, messagesPerConversation: 2, maxReplyWords: 30 }),
    ).toEqual({ enabled: false, messagesPerDay: 500, messagesPerConversation: 2, maxReplyWords: 30 });
    expect(chatSettingsOf({ messagesPerDay: 0, messagesPerConversation: 101, maxReplyWords: 301 })).toEqual(defaults);
    expect(chatSettingsOf({ enabled: 'no', messagesPerDay: 12.5, maxReplyWords: '80' })).toEqual(defaults);
  });

  it('the length of the replies in the instructions of the model', () => {
    expect(replySystemPrompt(45)).toContain('Keep every reply under 45 words.');
    expect(REPLY_SYSTEM_PROMPT).toBe(replySystemPrompt(120));
  });
});

describe('The Chat IA and « Générer avec l’IA », apart (MEM-135, MEM-143)', () => {
  it('each one writes its own parameters only', async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const settings = { set, get: vi.fn().mockResolvedValue(null) } as unknown as AppSettingsService;
    const chat = { enabled: false, messagesPerDay: 5, messagesPerConversation: 4, maxReplyWords: 60 };
    await new ConversationLimitsService(settings).set(chat);
    expect(set).toHaveBeenCalledExactlyOnceWith('chat', chat);
    set.mockClear();
    await new AiListLimitsService(settings).set({ enabled: false, generationsPerDay: 3 });
    expect(set).toHaveBeenCalledExactlyOnceWith('ai-lists', { enabled: false, generationsPerDay: 3 });
  });
});
