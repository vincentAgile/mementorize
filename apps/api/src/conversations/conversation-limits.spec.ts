import { describe, expect, it } from 'vitest';
import { chatSettingsOf } from './conversation-limits.js';
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
