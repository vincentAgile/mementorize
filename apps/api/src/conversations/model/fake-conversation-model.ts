import {
  type ChatTurn,
  type ConversationModel,
  ConversationModelError,
  type Evaluation,
  type ModelUsage,
} from './conversation-model.js';

/**
 * MEM-130: a model without AI, for the tests and for working on the web app
 * locally (CONVERSATION_AI_FAKE=true, refused in production). It corrects
 * « i » into « I », and replies by echoing the message. `failure` makes the
 * next calls fail like the provider would.
 */
export class FakeConversationModel implements ConversationModel {
  readonly name = 'fake';
  /** Every history received, for the tests. */
  readonly calls: { kind: 'evaluate' | 'reply'; history: ChatTurn[] }[] = [];
  failure: { kind: 'busy' | 'failed'; during: 'evaluate' | 'reply' | 'stream' } | null = null;

  async evaluate(history: ChatTurn[]): Promise<{ evaluation: Evaluation; usage: ModelUsage }> {
    this.calls.push({ kind: 'evaluate', history });
    if (this.failure?.during === 'evaluate') throw new ConversationModelError(this.failure.kind, 'Fake failure');
    const written = history.at(-1)?.text ?? '';
    const wrong = /(^|\s)i(\s|$)/.test(written);
    const evaluation: Evaluation = wrong
      ? {
          corrected: written.replace(/(^|\s)i(?=\s|$)/g, '$1I'),
          corrections: [
            {
              type: 'spelling',
              original: 'i',
              suggestion: 'I',
              explanation: 'The pronoun « I » is always written with a capital letter.',
            },
          ],
          praise: null,
        }
      : { corrected: written, corrections: [], praise: 'Well written!' };
    return { evaluation, usage: { inputTokens: 10 * history.length, outputTokens: 20 } };
  }

  async *reply(history: ChatTurn[]): AsyncGenerator<string, ModelUsage, void> {
    this.calls.push({ kind: 'reply', history });
    if (this.failure?.during === 'reply') throw new ConversationModelError(this.failure.kind, 'Fake failure');
    const words = `You said: « ${history.at(-1)?.text ?? ''} ». Tell me more?`.split(' ');
    for (const [index, word] of words.entries()) {
      if (index === 2 && this.failure?.during === 'stream') {
        throw new ConversationModelError(this.failure.kind, 'Fake failure');
      }
      yield index === 0 ? word : ` ${word}`;
    }
    return { inputTokens: 10 * history.length, outputTokens: words.length };
  }
}
