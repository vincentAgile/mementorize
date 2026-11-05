/**
 * MEM-130: the AI of the written conversations, behind a provider-free
 * interface (like the voice layer of MEM-90): Claude in production, a fake in
 * the tests and locally. Replacing the provider means writing another
 * implementation of this interface, nothing else.
 */

/** A message of the history, as the model sees it. */
export interface ChatTurn {
  role: 'assistant' | 'user';
  text: string;
}

export const CORRECTION_TYPES = ['grammar', 'vocabulary', 'spelling', 'phrasing'] as const;
export type CorrectionType = (typeof CORRECTION_TYPES)[number];

export interface Correction {
  type: CorrectionType;
  /** The words of the user, as written. */
  original: string;
  suggestion: string;
  /** One sentence, in English. */
  explanation: string;
}

/** The evaluation of a message of the user, apart from the reply. */
export interface Evaluation {
  /** The whole message, corrected (the same text when nothing is wrong). */
  corrected: string;
  /** Empty when the message is correct. */
  corrections: Correction[];
  /** A short praise when the message is correct; null otherwise. */
  praise: string | null;
}

/** What a call costs, for the usage log. */
export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ConversationModel {
  /** The model's name, for the usage log. */
  readonly name: string;
  /**
   * The evaluation of the last message of the user: `history` ends with it.
   * Throws a ConversationModelError when the provider fails.
   */
  evaluate(history: ChatTurn[]): Promise<{ evaluation: Evaluation; usage: ModelUsage }>;
  /**
   * The reply of the AI to the history (ending with the message of the user),
   * piece by piece as it is written; the generator returns the usage at the
   * end. Throws a ConversationModelError when the provider fails.
   */
  reply(history: ChatTurn[]): AsyncGenerator<string, ModelUsage, void>;
}

/** Nest token of the model; null when the feature is off (no configuration). */
export const CONVERSATION_MODEL = Symbol('CONVERSATION_MODEL');

/**
 * The provider failed. `busy`: timeout, rate limit, overload (try again
 * later: 503); `failed`: an error of the provider or an unusable answer (502).
 */
export class ConversationModelError extends Error {
  constructor(
    readonly kind: 'busy' | 'failed',
    message: string,
  ) {
    super(message);
    this.name = 'ConversationModelError';
  }
}

/**
 * Checks and tidies an evaluation given by a model: unknown types and empty
 * corrections are dropped, the lengths are bounded. Null if it is unusable.
 */
export function sanitizeEvaluation(value: unknown, written: string): Evaluation | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  if (!Array.isArray(raw.corrections)) return null;
  const corrections = raw.corrections
    .map((c): Correction | null => {
      if (!c || typeof c !== 'object') return null;
      const item = c as Record<string, unknown>;
      const type = CORRECTION_TYPES.find((t) => t === item.type);
      const original = text(item.original, 500);
      const suggestion = text(item.suggestion, 500);
      if (!type || !original || !suggestion) return null;
      return { type, original, suggestion, explanation: text(item.explanation, 300) };
    })
    .filter((c): c is Correction => c !== null)
    .slice(0, 10);
  const corrected = text(raw.corrected, 4000) || written;
  const praise = corrections.length === 0 ? text(raw.praise, 300) || 'Well written!' : null;
  return { corrected: corrections.length === 0 ? written : corrected, corrections, praise };
}
