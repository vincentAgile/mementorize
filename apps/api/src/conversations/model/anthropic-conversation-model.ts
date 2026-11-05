import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, OutputConfig } from '@anthropic-ai/sdk/resources/messages/messages';
import {
  type ChatTurn,
  type ConversationModel,
  ConversationModelError,
  type Evaluation,
  type ModelUsage,
  sanitizeEvaluation,
} from './conversation-model.js';
import { EVALUATION_SCHEMA, EVALUATION_SYSTEM_PROMPT, REPLY_SYSTEM_PROMPT } from './prompts.js';

/**
 * Upper bounds, thinking included: recent models think before they answer
 * (adaptive thinking), and that thinking counts in max_tokens. The length of
 * the reply itself is set by the instructions (120 words).
 */
const REPLY_MAX_TOKENS = 4000;
const EVALUATION_MAX_TOKENS = 6000;

export type Effort = 'low' | 'medium' | 'high';

/** The words of the provider about a refused request (never the user's text): for the log. */
function providerMessage(error: InstanceType<typeof Anthropic.APIError>): string {
  const body = error.error as { error?: { message?: unknown } } | undefined;
  const message = typeof body?.error?.message === 'string' ? body.error.message : '';
  return message ? `: ${message.replace(/\s+/g, ' ').slice(0, 300)}` : '';
}

/**
 * The messages as the Messages API wants them: starting with the user, one
 * role after the other. The conversation opens with a question of the app,
 * so a first turn of the user is added before it.
 */
export function toMessages(history: ChatTurn[]): MessageParam[] {
  const turns: ChatTurn[] =
    history[0]?.role === 'assistant' ? [{ role: 'user', text: '(The learner opens the chat.)' }, ...history] : history;
  const messages: MessageParam[] = [];
  for (const turn of turns) {
    const last = messages.at(-1);
    if (last && last.role === turn.role) last.content = `${last.content as string}\n\n${turn.text}`;
    else messages.push({ role: turn.role, content: turn.text });
  }
  return messages;
}

/**
 * The provider errors, as the app sees them: timeout, 429 and overload are
 * « busy » (503), the rest « failed » (502). Never retried here: the message
 * of the user would count twice against the quota.
 */
export function toModelError(error: unknown): ConversationModelError {
  if (error instanceof ConversationModelError) return error;
  if (error instanceof Anthropic.APIConnectionTimeoutError) return new ConversationModelError('busy', 'Timeout');
  if (error instanceof Anthropic.APIError) {
    const status = error.status ?? 0;
    if (status === 429 || status === 529) return new ConversationModelError('busy', `Provider busy (${status})`);
    return new ConversationModelError('failed', `Provider error (${status || 'connection'})${providerMessage(error)}`);
  }
  return new ConversationModelError('failed', 'Provider error');
}

/** MEM-130: the conversations with Claude, by the Anthropic API. */
export class AnthropicConversationModel implements ConversationModel {
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    readonly name: string,
    timeoutMs: number,
    /** ANTHROPIC_EFFORT: how much the model thinks; unset, the model's default. */
    private readonly effort?: Effort,
    client?: Anthropic,
  ) {
    this.client = client ?? new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 0 });
  }

  private outputConfig(format?: OutputConfig['format']): { output_config?: OutputConfig } {
    const config: OutputConfig = { ...(this.effort && { effort: this.effort }), ...(format && { format }) };
    return Object.keys(config).length > 0 ? { output_config: config } : {};
  }

  async evaluate(history: ChatTurn[]): Promise<{ evaluation: Evaluation; usage: ModelUsage }> {
    const written = history.at(-1)?.text ?? '';
    try {
      const message = await this.client.messages.create({
        model: this.name,
        max_tokens: EVALUATION_MAX_TOKENS,
        system: EVALUATION_SYSTEM_PROMPT,
        // The question it answers, and the message: the rest is not needed to correct it.
        messages: toMessages(history.slice(-2)),
        // Structured output: the answer is JSON that follows the schema.
        ...this.outputConfig({ type: 'json_schema', schema: EVALUATION_SCHEMA }),
      });
      const text = message.content.find((b) => b.type === 'text');
      let parsed: unknown = null;
      try {
        parsed = text && 'text' in text ? JSON.parse(text.text) : null;
      } catch {
        parsed = null;
      }
      const evaluation = sanitizeEvaluation(parsed, written);
      if (!evaluation) throw new ConversationModelError('failed', 'Unusable evaluation');
      return {
        evaluation,
        usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens },
      };
    } catch (error) {
      throw toModelError(error);
    }
  }

  async *reply(history: ChatTurn[]): AsyncGenerator<string, ModelUsage, void> {
    const usage: ModelUsage = { inputTokens: 0, outputTokens: 0 };
    let written = false;
    try {
      const stream = await this.client.messages.create({
        model: this.name,
        max_tokens: REPLY_MAX_TOKENS,
        system: REPLY_SYSTEM_PROMPT,
        messages: toMessages(history),
        ...this.outputConfig(),
        stream: true,
      });
      for await (const event of stream) {
        if (event.type === 'message_start') usage.inputTokens = event.message.usage.input_tokens;
        else if (event.type === 'message_delta') usage.outputTokens = event.usage.output_tokens;
        else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta' && event.delta.text) {
          written = true;
          yield event.delta.text;
        }
      }
    } catch (error) {
      throw toModelError(error);
    }
    if (!written) throw new ConversationModelError('failed', 'Empty reply');
    return usage;
  }
}
