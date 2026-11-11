import {
  type ChatTurn,
  type GenerationRequest,
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
  failure: { kind: 'busy' | 'failed'; during: 'evaluate' | 'reply' | 'stream' | 'generate' } | null = null;
  /** MEM-139: every generation asked, and the entries to give next (else made up from the request). */
  readonly generations: GenerationRequest[] = [];
  nextEntries: unknown[] | null = null;
  /** MEM-139: a pause before each entry, to test what happens meanwhile (ms). */
  entryDelay = 0;
  /** MEM-139: with failure « generate », how many entries are given before it fails. */
  failAfter = 0;

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

  /**
   * MEM-139: `count` entries « <theme> <level> <n> », or `nextEntries`
   * when a test sets them (taken once).
   */
  async *generateEntries(request: GenerationRequest): AsyncGenerator<unknown, ModelUsage, void> {
    this.generations.push(request);
    const entries =
      this.nextEntries ??
      Array.from({ length: request.count }, (_, i) => ({
        english: `${request.theme} ${request.level.toLowerCase()} ${request.kind === 'Expressions' ? 'phrase' : 'word'} ${i + 1}`,
        french: `${request.theme} ${i + 1} (fr)`,
        example: `An example with ${request.theme} ${i + 1}.`,
        frenchExample: `Un exemple avec ${request.theme} ${i + 1}.`,
        topic: request.theme.slice(0, 30),
      }));
    this.nextEntries = null;
    for (const [index, entry] of entries.entries()) {
      if (this.entryDelay) await new Promise((resolve) => setTimeout(resolve, this.entryDelay));
      if (this.failure?.during === 'generate' && index === this.failAfter) {
        throw new ConversationModelError(this.failure.kind, 'Fake failure');
      }
      yield entry;
    }
    if (entries.length === 0) throw new ConversationModelError('failed', 'No entry');
    return { inputTokens: 100, outputTokens: 40 * entries.length };
  }
}
