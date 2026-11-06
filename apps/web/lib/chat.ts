import type { SpokenPronunciation } from './voice-input';

/**
 * MEM-131: the « Chat IA » of the Anglais space, what the page and the
 * server share: the types of the API (MEM-130), the reading of the stream of
 * a message, the highlighting of the corrections and the messages of the
 * limits. No server-only code here: the page's client component uses it.
 */

export const CHAT_HREF = '/anglais/chat';
/** Where the page sends a message: a route that passes the stream of the API on. */
export const CHAT_SEND_HREF = '/anglais/chat/envoyer';
/** The conversation opened on arrival, if the last message is more recent. */
export const RECENT_MS = 24 * 60 * 60 * 1000;
/** The counter of characters shows from there. */
export const COUNTER_FROM = 800;
export const OPENING_QUESTION = 'What do you want to talk about today?';

export type CorrectionType = 'grammar' | 'vocabulary' | 'spelling' | 'phrasing';

export interface Correction {
  type: CorrectionType;
  original: string;
  suggestion: string;
  explanation: string;
}

export interface Evaluation {
  corrected: string;
  corrections: Correction[];
  praise: string | null;
  /** MEM-133: the message was said aloud: its pronunciation, measured by Azure. */
  pronunciation?: SpokenPronunciation;
}

export interface ChatMessage {
  id: string;
  position: number;
  role: 'Assistant' | 'User';
  text: string;
  evaluation: Evaluation | null;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export interface ConversationSummary {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface ChatLimits {
  messagesPerDay: number;
  messagesPerConversation: number;
  maxLength: number;
}

export type ChatStatus =
  | { enabled: false }
  /** voiceInput (MEM-133): the microphone is offered (Azure configured). */
  | { enabled: true; limits: ChatLimits; usedToday: number; resetAt: string; voiceInput?: boolean };

/** The conversation opened on arrival: the most recent one, if it was used in the last 24 hours. */
export function recentConversation(list: ConversationSummary[], now = Date.now()): ConversationSummary | null {
  const last = list[0];
  return last && now - new Date(last.updatedAt).getTime() < RECENT_MS ? last : null;
}

// ---------------------------------------------------------------------------
// The stream of a message (server-sent events)
// ---------------------------------------------------------------------------

export type ChatEvent =
  | { event: 'evaluation'; data: { message: ChatMessage } }
  | { event: 'delta'; data: { text: string } }
  | { event: 'done'; data: { message: ChatMessage } }
  | { event: 'error'; data: { statusCode: number; message: string } };

/**
 * Reads server-sent events as they come: `push` takes the next piece of
 * text and gives the events it completes; the rest waits for the next piece.
 */
export function sseReader() {
  let buffer = '';
  return {
    push(chunk: string): ChatEvent[] {
      buffer += chunk.replace(/\r\n/g, '\n');
      const events: ChatEvent[] = [];
      let end = buffer.indexOf('\n\n');
      while (end !== -1) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const event = /^event: ?(.*)$/m.exec(block)?.[1];
        const data = block
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).replace(/^ /, ''))
          .join('\n');
        if (event && data) {
          try {
            events.push({ event, data: JSON.parse(data) } as ChatEvent);
          } catch {
            // A broken event is skipped: the end of the stream says whether the reply came.
          }
        }
        end = buffer.indexOf('\n\n');
      }
      return events;
    },
  };
}

// ---------------------------------------------------------------------------
// The corrected version, with its changes highlighted
// ---------------------------------------------------------------------------

export interface DiffPart {
  text: string;
  changed: boolean;
}

const words = (text: string) => text.split(/(\s+)/).filter((part) => part !== '');
const isSpace = (part: string) => /^\s+$/.test(part);

/**
 * The corrected text in pieces, the words that differ from the original
 * marked `changed` (the longest common sequence of words stays as it is).
 * The spaces between two changed words belong to the change.
 */
export function correctedParts(original: string, corrected: string): DiffPart[] {
  const a = words(original).filter((part) => !isSpace(part));
  const b = words(corrected);
  const bWords = b.map((part, index) => ({ part, index })).filter(({ part }) => !isSpace(part));
  // Lengths of the longest common sequences, from the end.
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(bWords.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = bWords.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === bWords[j].part ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const kept = new Set<number>();
  for (let i = 0, j = 0; i < a.length && j < bWords.length;) {
    if (a[i] === bWords[j].part) {
      kept.add(bWords[j].index);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) i++;
    else j++;
  }

  const parts: DiffPart[] = [];
  b.forEach((part, index) => {
    let changed = !isSpace(part) && !kept.has(index);
    if (isSpace(part)) {
      // A space is changed when the words on both sides are.
      const before = index > 0 && !kept.has(index - 1);
      const after = index < b.length - 1 && !kept.has(index + 1);
      changed = before && after;
    }
    const last = parts.at(-1);
    if (last && last.changed === changed) last.text += part;
    else parts.push({ text: part, changed });
  });
  return parts;
}

// ---------------------------------------------------------------------------
// The limits and the errors, in French (the interface stays in French)
// ---------------------------------------------------------------------------

/** « à 18:00 », « demain à 00:00 », or a date, in the browser's time zone. */
export function whenBack(retryAt: string, now = new Date(), timeZone?: string): string {
  const at = new Date(retryAt);
  const day = (date: Date) => new Intl.DateTimeFormat('fr-FR', { timeZone, dateStyle: 'short' }).format(date);
  const time = new Intl.DateTimeFormat('fr-FR', { timeZone, hour: '2-digit', minute: '2-digit' }).format(at);
  if (day(at) === day(now)) return `à ${time}`;
  if (day(at) === day(new Date(now.getTime() + 24 * 60 * 60 * 1000))) return `demain à ${time}`;
  return `le ${day(at)} à ${time}`;
}

export type ChatLimit = { kind: 'daily'; retryAt: string } | { kind: 'conversation' };

export function limitText(limit: ChatLimit, limits: ChatLimits, now = new Date(), timeZone?: string): string {
  return limit.kind === 'daily'
    ? `Tu as atteint la limite de ${limits.messagesPerDay} messages par jour. Tu pourras reprendre ${whenBack(limit.retryAt, now, timeZone)}.`
    : `Cette conversation a atteint la limite de ${limits.messagesPerConversation} messages. Démarre une nouvelle conversation pour continuer.`;
}

/** The limit reached before sending anything, from the status and the conversation. */
export function limitBefore(status: Extract<ChatStatus, { enabled: true }>, messages: ChatMessage[]): ChatLimit | null {
  if (messages.filter((m) => m.role === 'User').length >= status.limits.messagesPerConversation) {
    return { kind: 'conversation' };
  }
  if (status.usedToday >= status.limits.messagesPerDay) return { kind: 'daily', retryAt: status.resetAt };
  return null;
}

export const SOMETHING_WENT_WRONG = 'Une erreur est survenue, réessaie.';
export const UNAVAILABLE = 'Le Chat IA n’est pas disponible pour le moment.';

/** What a refused message becomes: a limit, or an error to try again. */
export function refusal(
  status: number,
  body: { reason?: string; retryAt?: string } | null,
): { limit: ChatLimit } | { error: string; retry: boolean } {
  if (status === 429 && body?.reason === 'daily-limit' && body.retryAt) {
    return { limit: { kind: 'daily', retryAt: body.retryAt } };
  }
  if (status === 429 && body?.reason === 'conversation-limit') return { limit: { kind: 'conversation' } };
  if (status === 403) return { error: UNAVAILABLE, retry: false };
  if (status === 404)
    return { error: 'Cette conversation n’existe plus : démarre une nouvelle conversation.', retry: false };
  return { error: SOMETHING_WENT_WRONG, retry: true };
}
