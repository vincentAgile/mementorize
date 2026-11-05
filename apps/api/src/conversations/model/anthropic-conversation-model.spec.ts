import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { AnthropicConversationModel, toMessages, toModelError } from './anthropic-conversation-model.js';
import { ConversationModelError, sanitizeEvaluation } from './conversation-model.js';
import { EVALUATION_SCHEMA, REPLY_SYSTEM_PROMPT } from './prompts.js';

/** A client of the Anthropic API that answers what it is given, and keeps the requests. */
function fakeClient(answer: (params: Record<string, unknown>) => unknown) {
  const requests: Record<string, unknown>[] = [];
  const client = {
    messages: {
      create: async (params: Record<string, unknown>) => {
        requests.push(params);
        return answer(params);
      },
    },
  } as unknown as Anthropic;
  return { client, requests };
}

async function* events(texts: string[]) {
  yield { type: 'message_start', message: { usage: { input_tokens: 120, output_tokens: 1 } } };
  yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } };
  for (const text of texts) yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } };
  yield { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 42 } };
  yield { type: 'message_stop' };
}

const history = [
  { role: 'assistant' as const, text: 'What do you want to talk about today?' },
  { role: 'user' as const, text: 'I like cook.' },
];

describe('toMessages', () => {
  it('starts with the user and alternates the roles', () => {
    expect(toMessages(history)).toEqual([
      { role: 'user', content: '(The learner opens the chat.)' },
      { role: 'assistant', content: 'What do you want to talk about today?' },
      { role: 'user', content: 'I like cook.' },
    ]);
    expect(
      toMessages([
        { role: 'user', text: 'Hello.' },
        { role: 'user', text: 'Are you there?' },
      ]),
    ).toEqual([{ role: 'user', content: 'Hello.\n\nAre you there?' }]);
  });
});

describe('toModelError', () => {
  const apiError = (status: number) => Anthropic.APIError.generate(status, { error: {} }, 'error', new Headers());

  it('sees timeouts, rate limits and overloads as busy, the rest as failed', () => {
    expect(toModelError(new Anthropic.APIConnectionTimeoutError()).kind).toBe('busy');
    expect(toModelError(apiError(429)).kind).toBe('busy');
    expect(toModelError(apiError(529)).kind).toBe('busy');
    expect(toModelError(apiError(500)).kind).toBe('failed');
    expect(toModelError(apiError(401)).kind).toBe('failed');
    expect(toModelError(new Error('boom')).kind).toBe('failed');
    const refused = Anthropic.APIError.generate(
      400,
      {
        type: 'error',
        error: { type: 'invalid_request_error', message: 'tool_choice: type "tool" is not supported.' },
      },
      'refused',
      new Headers(),
    );
    expect(toModelError(refused).message).toBe('Provider error (400): tool_choice: type "tool" is not supported.');
  });
});

describe('AnthropicConversationModel', () => {
  it('evaluates with a structured output, on the question and the message only', async () => {
    const evaluation = {
      corrected: 'I like cooking.',
      corrections: [
        { type: 'grammar', original: 'like cook', suggestion: 'like cooking', explanation: 'Use -ing after like.' },
      ],
      praise: '',
    };
    const { client, requests } = fakeClient(() => ({
      // Recent models think first: the thinking comes before the answer.
      content: [
        { type: 'thinking', thinking: '', signature: 's' },
        { type: 'text', text: JSON.stringify(evaluation) },
      ],
      usage: { input_tokens: 300, output_tokens: 80 },
    }));
    const model = new AnthropicConversationModel('key', 'claude-test', 1000, 'low', client);
    const long = [
      { role: 'user' as const, text: 'Earlier.' },
      { role: 'assistant' as const, text: 'Old.' },
      ...history,
    ];

    expect(await model.evaluate(long)).toEqual({
      evaluation: { ...evaluation, praise: null },
      usage: { inputTokens: 300, outputTokens: 80 },
    });
    expect(requests[0]).toMatchObject({
      model: 'claude-test',
      messages: toMessages(history),
      output_config: { effort: 'low', format: { type: 'json_schema', schema: EVALUATION_SCHEMA } },
    });
    // No forced tool: Claude Sonnet 5.5 refuses it (400).
    expect(requests[0]).not.toHaveProperty('tool_choice');
    expect(requests[0]).not.toHaveProperty('tools');
  });

  it('sends no output_config for the reply without an effort', async () => {
    const { client, requests } = fakeClient(() => events(['Hi!']));
    const model = new AnthropicConversationModel('key', 'claude-test', 1000, undefined, client);
    await model.reply(history).next();
    expect(requests[0]).not.toHaveProperty('output_config');
  });

  it('fails on an unusable evaluation, never with an empty one', async () => {
    const { client } = fakeClient(() => ({ content: [{ type: 'text', text: 'Sure!' }], usage: {} }));
    const model = new AnthropicConversationModel('key', 'claude-test', 1000, undefined, client);
    await expect(model.evaluate(history)).rejects.toMatchObject({ kind: 'failed' });
  });

  it('streams the reply, then gives the usage', async () => {
    const { client, requests } = fakeClient(() => events(['Cooking', ' is fun!', ' What do you cook?']));
    const model = new AnthropicConversationModel('key', 'claude-test', 1000, 'medium', client);
    const reply = model.reply(history);
    const pieces: string[] = [];
    let next = await reply.next();
    while (!next.done) {
      pieces.push(next.value);
      next = await reply.next();
    }
    expect(pieces).toEqual(['Cooking', ' is fun!', ' What do you cook?']);
    expect(next.value).toEqual({ inputTokens: 120, outputTokens: 42 });
    expect(requests[0]).toMatchObject({
      system: REPLY_SYSTEM_PROMPT,
      stream: true,
      messages: toMessages(history),
      output_config: { effort: 'medium' },
    });
  });

  it('fails on an empty reply, or when the provider fails', async () => {
    const empty = new AnthropicConversationModel('key', 'm', 1000, undefined, fakeClient(() => events([])).client);
    await expect(empty.reply(history).next()).rejects.toBeInstanceOf(ConversationModelError);
    const busy = new AnthropicConversationModel(
      'key',
      'm',
      1000,
      undefined,
      fakeClient(() => {
        throw Anthropic.APIError.generate(429, { error: {} }, 'rate limited', new Headers());
      }).client,
    );
    await expect(busy.reply(history).next()).rejects.toMatchObject({ kind: 'busy' });
  });
});

describe('sanitizeEvaluation', () => {
  it('keeps the known types, and praises a message without correction', () => {
    expect(
      sanitizeEvaluation(
        {
          corrected: 'x',
          corrections: [
            { type: 'style', original: 'a', suggestion: 'b', explanation: 'c' },
            { type: 'spelling', original: '', suggestion: 'b', explanation: 'c' },
          ],
          praise: null,
        },
        'I like it.',
      ),
    ).toEqual({ corrected: 'I like it.', corrections: [], praise: 'Well written!' });
    expect(sanitizeEvaluation({ corrections: 'none' }, 'x')).toBeNull();
    expect(sanitizeEvaluation(null, 'x')).toBeNull();
  });
});
