import { describe, expect, it } from 'vitest';
import {
  type ChatMessage,
  correctedParts,
  limitBefore,
  limitText,
  recentConversation,
  refusal,
  sseReader,
  whenBack,
} from './chat';

describe('sseReader (MEM-131)', () => {
  it('gives the events as they complete, even cut anywhere', () => {
    const reader = sseReader();
    const stream =
      'event: evaluation\ndata: {"message":{"id":"m1"}}\n\n' +
      'event: delta\ndata: {"text":"Hi"}\n\n' +
      'event: delta\ndata: {"text":" there"}\n\n' +
      'event: done\ndata: {"message":{"id":"m2"}}\n\n';
    const events = [stream.slice(0, 20), stream.slice(20, 61), stream.slice(61, 62), stream.slice(62)].flatMap((c) =>
      reader.push(c),
    );
    expect(events.map((e) => e.event)).toEqual(['evaluation', 'delta', 'delta', 'done']);
    expect(events[2].data).toEqual({ text: ' there' });
    expect(reader.push('event: delta\ndata: {"te')).toEqual([]);
    expect(reader.push('xt":"!"}\r\n\r\n')).toEqual([{ event: 'delta', data: { text: '!' } }]);
  });
});

describe('correctedParts (MEM-131)', () => {
  const changed = (original: string, corrected: string) =>
    correctedParts(original, corrected)
      .filter((part) => part.changed)
      .map((part) => part.text);

  it('marks the words that differ from the original', () => {
    expect(correctedParts('yesterday i go to cinema', 'Yesterday I went to the cinema')).toEqual([
      { text: 'Yesterday I went', changed: true },
      { text: ' to ', changed: false },
      { text: 'the', changed: true },
      { text: ' cinema', changed: false },
    ]);
    expect(changed('I like cook.', 'I like cooking.')).toEqual(['cooking.']);
    expect(changed('I love hiking.', 'I love hiking.')).toEqual([]);
  });

  it('gives back the corrected text, whole', () => {
    const corrected = 'She  doesn’t like\nit, does she?';
    expect(
      correctedParts('she dont like it', corrected)
        .map((part) => part.text)
        .join(''),
    ).toBe(corrected);
  });
});

describe('the limits (MEM-131)', () => {
  const limits = { messagesPerDay: 30, messagesPerConversation: 20, maxLength: 1000 };
  const status = { enabled: true as const, limits, usedToday: 3, resetAt: '2026-11-05T23:00:00.000Z' };
  const user = { role: 'User' } as ChatMessage;

  it('says when the user can come back, in the time zone', () => {
    const now = new Date('2026-11-05T20:00:00Z');
    expect(whenBack('2026-11-05T23:00:00.000Z', now, 'Europe/Paris')).toBe('demain à 00:00');
    expect(whenBack('2026-11-05T21:30:00.000Z', now, 'Europe/Paris')).toBe('à 22:30');
    expect(limitText({ kind: 'daily', retryAt: '2026-11-05T23:00:00.000Z' }, limits, now, 'Europe/Paris')).toBe(
      'Tu as atteint la limite de 30 messages par jour. Tu pourras reprendre demain à 00:00.',
    );
    expect(limitText({ kind: 'conversation' }, limits)).toBe(
      'Cette conversation a atteint la limite de 20 messages. Démarre une nouvelle conversation pour continuer.',
    );
  });

  it('knows a limit reached before sending', () => {
    expect(limitBefore(status, [user])).toBeNull();
    expect(limitBefore({ ...status, usedToday: 30 }, [])).toEqual({
      kind: 'daily',
      retryAt: '2026-11-05T23:00:00.000Z',
    });
    expect(limitBefore(status, new Array(20).fill(user))).toEqual({ kind: 'conversation' });
  });

  it('turns the refusals of the API into a limit or an error', () => {
    expect(refusal(429, { reason: 'daily-limit', retryAt: 'x' })).toEqual({ limit: { kind: 'daily', retryAt: 'x' } });
    expect(refusal(429, { reason: 'conversation-limit' })).toEqual({ limit: { kind: 'conversation' } });
    expect(refusal(429, { reason: 'rate-limit' })).toEqual({
      error: 'Une erreur est survenue, réessaie.',
      retry: true,
    });
    expect(refusal(502, null)).toEqual({ error: 'Une erreur est survenue, réessaie.', retry: true });
    expect(refusal(403, null)).toMatchObject({ retry: false });
  });
});

describe('recentConversation (MEM-131)', () => {
  const now = new Date('2026-11-05T20:00:00Z').getTime();
  const summary = (updatedAt: string) => ({ id: 'c', title: null, createdAt: updatedAt, updatedAt, messageCount: 1 });

  it('opens the most recent conversation, if used in the last 24 hours', () => {
    expect(recentConversation([summary('2026-11-05T08:00:00Z'), summary('2026-11-01T08:00:00Z')], now)?.updatedAt).toBe(
      '2026-11-05T08:00:00Z',
    );
    expect(recentConversation([summary('2026-11-04T19:59:00Z')], now)).toBeNull();
    expect(recentConversation([], now)).toBeNull();
  });
});
