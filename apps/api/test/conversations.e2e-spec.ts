import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { ConfigService } from '@nestjs/config';
import { ConversationAccess } from '../src/conversations/conversation-access.js';
import { ConversationRateGuard, ConversationSpeechRateGuard } from '../src/conversations/conversation-rate.guard.js';
import { KokoroClient } from '../src/pronunciation/kokoro.client.js';
import { VoiceUnavailableError } from '../src/voice/pronunciation-assessor.js';
import { SPEECH_TOKEN_ISSUER, type SpeechTokenIssuer } from '../src/voice/speech-token.js';
import { ConversationsService } from '../src/conversations/conversations.service.js';
import { CONVERSATION_MODEL, type ConversationModel } from '../src/conversations/model/conversation-model.js';
import { FakeConversationModel } from '../src/conversations/model/fake-conversation-model.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { run } from '../src/admin/admin-cli.js';
import { ChatUsageService } from '../src/conversations/chat-usage.service.js';

/** The accounts the conversations are open to, as CONVERSATION_ALLOWED_EMAILS would say. */
const accessFor = (value: string) => new ConversationAccess({ get: () => value } as unknown as ConfigService);

/** MEM-132: a Kokoro without Kokoro: the « audio » is the text read, and every text is kept. */
const kokoro = {
  enabled: true,
  voice: 'af_heart',
  failing: false,
  texts: [] as string[],
  async speak(text: string) {
    this.texts.push(text);
    if (this.failing) throw new Error('Kokoro down');
    return { audio: new TextEncoder().encode(`mp3:${text}`), mimeType: 'audio/mpeg' };
  },
};

/** MEM-133: Azure's token service, without Azure. */
const tokens = {
  failing: false,
  issued: 0,
  async issue() {
    if (this.failing) throw new VoiceUnavailableError('Azure down');
    this.issued++;
    return {
      token: `token-${this.issued}`,
      region: 'westeurope',
      expiresAt: new Date(Date.now() + 540_000).toISOString(),
    };
  },
};

async function start(
  model: ConversationModel | null | undefined,
  {
    rateLimit = false,
    allowed = '*',
    issuer = tokens as SpeechTokenIssuer | null,
  }: { rateLimit?: boolean; allowed?: string; issuer?: SpeechTokenIssuer | null } = {},
) {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  builder = builder.overrideProvider(ConversationAccess).useValue(accessFor(allowed));
  builder = builder.overrideProvider(KokoroClient).useValue(kokoro);
  builder = builder.overrideProvider(SPEECH_TOKEN_ISSUER).useValue(issuer);
  if (model !== undefined) builder = builder.overrideProvider(CONVERSATION_MODEL).useValue(model);
  // 3 requests per second would slow the scenarios down: tested on its own.
  if (!rateLimit) {
    builder = builder
      .overrideGuard(ConversationRateGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ConversationSpeechRateGuard)
      .useValue({ canActivate: () => true });
  }
  const app = (await builder.compile()).createNestApplication<NestExpressApplication>();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  return app;
}

interface SseEvent {
  event: string;
  data: Record<string, unknown>;
}

/** The server-sent events of a response, in order. */
function parseSse(body: string): SseEvent[] {
  return body
    .split('\n\n')
    .filter((block) => block.trim())
    .map((block) => {
      const event = /^event: (.*)$/m.exec(block)?.[1] ?? '';
      const data = JSON.parse(/^data: (.*)$/m.exec(block)?.[1] ?? 'null') as Record<string, unknown>;
      return { event, data };
    });
}

const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('Conversations with the AI (e2e, MEM-130)', () => {
  const fake = new FakeConversationModel();
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

  async function register(name: string) {
    const email = `chat-${name}-${unique}@e2e.test`;
    const res = await http().post('/auth/register').send({ email, password: 'password123' }).expect(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } });
    return { auth: { Authorization: `Bearer ${res.body.accessToken as string}` }, userId: user.id };
  }

  function send(auth: Record<string, string>, id: string, text: unknown) {
    return http()
      .post(`/conversations/${id}/messages`)
      .set(auth)
      .send({ text })
      .buffer(true)
      .parse((res, callback) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (data += chunk));
        res.on('end', () => callback(null, data));
      });
  }

  beforeAll(async () => {
    app = await start(fake);
    prisma = app.get(PrismaService);
    // The parameters of the console (MEM-135): the defaults, whatever an earlier run left.
    await prisma.appSetting.deleteMany({ where: { key: 'chat' } });
  });
  beforeEach(() => {
    fake.failure = null;
    fake.calls.length = 0;
  });
  afterAll(async () => {
    await app?.close();
  });

  it('creates a conversation opened by the question of the AI', async () => {
    const { auth } = await register('create');
    expect((await http().get('/conversations/status').set(auth).expect(200)).body).toEqual({
      enabled: true,
      limits: { messagesPerDay: 30, messagesPerConversation: 20, maxLength: 1000, maxReplyWords: 120 },
      usedToday: 0,
      resetAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
      voiceInput: true, // MEM-133: Azure configured
    });
    const res = await http().post('/conversations').set(auth).expect(201);
    expect(res.body).toMatchObject({
      title: null,
      messages: [{ position: 0, role: 'Assistant', text: 'What do you want to talk about today?', evaluation: null }],
    });
    expect(fake.calls).toEqual([]); // the opening question is not written by the model
  });

  it('streams the evaluation, then the reply, and saves both', async () => {
    const { auth } = await register('message');
    const { body: conversation } = await http().post('/conversations').set(auth).expect(201);

    const res = await send(auth, conversation.id, '  yesterday i went to the cinema  ').expect(200);
    expect(res.headers['content-type']).toMatch(/^text\/event-stream/);
    const events = parseSse(res.body as string);
    // The evaluation first, then the reply in several pieces, then the reply saved.
    const kinds = events.map((e) => e.event);
    expect(kinds[0]).toBe('evaluation');
    expect(kinds.at(-1)).toBe('done');
    expect(kinds.slice(1, -1).every((kind) => kind === 'delta')).toBe(true);
    expect(kinds.length).toBeGreaterThan(4);
    expect(events[0].data.message).toMatchObject({
      position: 1,
      role: 'User',
      text: 'yesterday i went to the cinema',
      evaluation: {
        corrected: 'yesterday I went to the cinema',
        corrections: [{ type: 'spelling', original: 'i', suggestion: 'I', explanation: expect.any(String) }],
        praise: null,
      },
    });
    const streamed = events
      .filter((e) => e.event === 'delta')
      .map((e) => e.data.text)
      .join('');
    expect(streamed).toBe('You said: « yesterday i went to the cinema ». Tell me more?');
    expect(events.at(-1)?.data.message).toMatchObject({ position: 2, role: 'Assistant', text: streamed });

    const saved = await http().get(`/conversations/${conversation.id}`).set(auth).expect(200);
    expect(saved.body.title).toBe('yesterday i went to the cinema');
    expect(saved.body.messages.map((m: { role: string; position: number }) => [m.position, m.role])).toEqual([
      [0, 'Assistant'],
      [1, 'User'],
      [2, 'Assistant'],
    ]);
    expect(saved.body.messages[1].evaluation.corrections).toHaveLength(1);
    expect((await http().get('/conversations/status').set(auth).expect(200)).body.usedToday).toBe(1);
  });

  it('praises a correct message, with no correction', async () => {
    const { auth } = await register('praise');
    const { body: conversation } = await http().post('/conversations').set(auth).expect(201);
    const events = parseSse((await send(auth, conversation.id, 'I love hiking.').expect(200)).body as string);
    expect(events[0].data.message).toMatchObject({
      evaluation: { corrected: 'I love hiking.', corrections: [], praise: 'Well written!' },
    });
  });

  it('gives the model the history, in order', async () => {
    const { auth } = await register('history');
    const { body: conversation } = await http().post('/conversations').set(auth).expect(201);
    await send(auth, conversation.id, 'Football.').expect(200);
    fake.calls.length = 0;
    await send(auth, conversation.id, 'I play on Sundays.').expect(200);

    const reply = fake.calls.find((c) => c.kind === 'reply');
    expect(reply?.history).toEqual([
      { role: 'assistant', text: 'What do you want to talk about today?' },
      { role: 'user', text: 'Football.' },
      { role: 'assistant', text: 'You said: « Football. ». Tell me more?' },
      { role: 'user', text: 'I play on Sundays.' },
    ]);
    expect(fake.calls.find((c) => c.kind === 'evaluate')?.history.at(-1)).toEqual({
      role: 'user',
      text: 'I play on Sundays.',
    });
  });

  it('keeps only the last 20 exchanges in the history', async () => {
    const { auth } = await register('long');
    const { body: conversation } = await http().post('/conversations').set(auth).expect(201);
    const long = new Date(Date.now() - 60 * 60 * 1000);
    await prisma.conversationMessage.createMany({
      data: Array.from({ length: 50 }, (_, i) => ({
        conversationId: conversation.id,
        position: i + 1,
        role: i % 2 === 0 ? ('User' as const) : ('Assistant' as const),
        text: `message ${i + 1}`,
        createdAt: long,
      })),
    });
    // 25 messages of the user: over the cap of a conversation; raised for this test.
    await prisma.conversationMessage.updateMany({
      where: { conversationId: conversation.id, position: { lte: 30 } },
      data: { role: 'Assistant' },
    });
    await send(auth, conversation.id, 'And now?').expect(200);
    const history = fake.calls.find((c) => c.kind === 'reply')?.history ?? [];
    expect(history).toHaveLength(40);
    expect(history[0]).toEqual({ role: 'assistant', text: 'message 12' });
    expect(history.at(-1)).toEqual({ role: 'user', text: 'And now?' });
  });

  it('refuses an empty, too long or missing message', async () => {
    const { auth } = await register('invalid');
    const { body: conversation } = await http().post('/conversations').set(auth).expect(201);
    await send(auth, conversation.id, '').expect(400);
    await send(auth, conversation.id, '   \n\t ').expect(400);
    await send(auth, conversation.id, 'a'.repeat(1001)).expect(400);
    await send(auth, conversation.id, 42).expect(400);
    await send(auth, conversation.id, 'a'.repeat(1000)).expect(200);
    expect(fake.calls.filter((c) => c.kind === 'reply')).toHaveLength(1);
  });

  it('caps the messages of a day, until the next local midnight', async () => {
    const { auth, userId } = await register('daily');
    await prisma.user.update({ where: { id: userId }, data: { reminderTimeZone: 'America/New_York' } });
    const { body: conversation } = await http().post('/conversations').set(auth).expect(201);
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
    await prisma.conversationUsage.create({ data: { userId, day, count: 29 } });

    await send(auth, conversation.id, 'One more.').expect(200);
    const res = await send(auth, conversation.id, 'And another.').expect(429);
    const body = JSON.parse(res.body as string) as { reason: string; message: string; retryAt: string };
    expect(body).toMatchObject({ reason: 'daily-limit', message: 'Daily limit of 30 messages reached' });
    const retryAt = new Date(body.retryAt);
    expect(retryAt.getTime()).toBeGreaterThan(Date.now());
    expect(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', timeStyle: 'short' }).format(retryAt)).toBe(
      '00:00',
    );
    expect(await prisma.conversationMessage.count({ where: { conversationId: conversation.id } })).toBe(3);
  });

  it('caps the messages of a conversation, and deleting one gives none back for the day', async () => {
    const { auth, userId } = await register('cap');
    const { body: conversation } = await http().post('/conversations').set(auth).expect(201);
    const long = new Date(Date.now() - 60 * 60 * 1000);
    await prisma.conversationMessage.createMany({
      data: Array.from({ length: 20 }, (_, i) => ({
        conversationId: conversation.id,
        position: i + 1,
        role: 'User' as const,
        text: `message ${i + 1}`,
        createdAt: long,
      })),
    });
    const res = await send(auth, conversation.id, 'One too many.').expect(429);
    expect(JSON.parse(res.body as string)).toMatchObject({ reason: 'conversation-limit' });
    expect(res.body).not.toContain('retryAt');
    expect(fake.calls).toEqual([]);

    const other = (await http().post('/conversations').set(auth).expect(201)).body;
    await send(auth, other.id, 'Hello.').expect(200);
    await http().delete(`/conversations/${other.id}`).set(auth).expect(204);
    const usage = await prisma.conversationUsage.findMany({ where: { userId } });
    expect(usage.map((u) => u.count)).toEqual([1]);
  });

  it('refuses a message while the previous one waits for its reply', async () => {
    const { auth } = await register('pending');
    const { body: conversation } = await http().post('/conversations').set(auth).expect(201);
    await prisma.conversationMessage.create({
      data: { conversationId: conversation.id, position: 1, role: 'User', text: 'Hello?' },
    });
    await send(auth, conversation.id, 'Anyone?').expect(409);
  });

  it('lists the conversations, the most recent first, and deletes them', async () => {
    const { auth } = await register('list');
    const first = (await http().post('/conversations').set(auth).expect(201)).body;
    const second = (await http().post('/conversations').set(auth).expect(201)).body;
    await send(auth, first.id, 'Travel.').expect(200); // the first becomes the most recent

    const list = await http().get('/conversations').set(auth).expect(200);
    expect(list.body).toEqual([
      expect.objectContaining({ id: first.id, title: 'Travel.', messageCount: 3 }),
      expect.objectContaining({ id: second.id, title: null, messageCount: 1 }),
    ]);

    await http().delete(`/conversations/${first.id}`).set(auth).expect(204);
    await http().get(`/conversations/${first.id}`).set(auth).expect(404);
    await http().delete(`/conversations/${first.id}`).set(auth).expect(404);
    expect(await prisma.conversationMessage.count({ where: { conversationId: first.id } })).toBe(0);
    expect((await http().get('/conversations').set(auth).expect(200)).body).toHaveLength(1);
  });

  it('keeps each user to their own conversations (404)', async () => {
    const owner = await register('owner');
    const other = await register('other');
    const { body: conversation } = await http().post('/conversations').set(owner.auth).expect(201);

    await http().get(`/conversations/${conversation.id}`).set(other.auth).expect(404);
    await send(other.auth, conversation.id, 'Hi!').expect(404);
    await http().delete(`/conversations/${conversation.id}`).set(other.auth).expect(404);
    expect((await http().get('/conversations').set(other.auth).expect(200)).body).toEqual([]);
    await http().get('/conversations/not-a-uuid').set(owner.auth).expect(400);
    await http().get('/conversations').expect(401);
    await http().get(`/conversations/${conversation.id}`).set(owner.auth).expect(200);
    expect(fake.calls).toEqual([]);
  });

  it('answers 503 or 502 when the provider fails, and the message does not count', async () => {
    const { auth, userId } = await register('failure');
    const { body: conversation } = await http().post('/conversations').set(auth).expect(201);

    fake.failure = { kind: 'busy', during: 'evaluate' };
    const busy = await send(auth, conversation.id, 'Hello there.').expect(503);
    expect(JSON.parse(busy.body as string).message).toBe('The AI is busy: try again in a moment');
    fake.failure = { kind: 'failed', during: 'reply' };
    const failed = await send(auth, conversation.id, 'Hello there.').expect(502);
    expect(JSON.parse(failed.body as string).message).toBe('The AI did not answer: try again');

    // Failing in the middle of the reply: an error event, never an empty reply.
    fake.failure = { kind: 'busy', during: 'stream' };
    const events = parseSse((await send(auth, conversation.id, 'Hello there.').expect(200)).body as string);
    expect(events.map((e) => e.event)).toEqual(['evaluation', 'delta', 'delta', 'error']);
    expect(events.at(-1)?.data).toEqual({ statusCode: 503, message: 'The AI is busy: try again in a moment' });

    const saved = await http().get(`/conversations/${conversation.id}`).set(auth).expect(200);
    expect(saved.body.messages).toHaveLength(1); // only the opening question
    const usage = await prisma.conversationUsage.findMany({ where: { userId } });
    expect(usage.map((u) => u.count)).toEqual([0]);

    fake.failure = null;
    await send(auth, conversation.id, 'Hello there.').expect(200); // tried again: it works
  });

  it('reads a sentence aloud with Kokoro, neither kept nor too long (MEM-132)', async () => {
    const { auth } = await register('speech');
    kokoro.texts.length = 0;
    const res = await http()
      .post('/conversations/speech')
      .set(auth)
      .send({ text: '  Nice!\n What did you see?  ' })
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(res.headers['content-type']).toBe('audio/mpeg');
    expect(res.headers['cache-control']).toBe('no-store');
    expect((res.body as Buffer).toString()).toBe('mp3:Nice! What did you see?');
    expect(kokoro.texts).toEqual(['Nice! What did you see?']);

    await http().post('/conversations/speech').set(auth).send({ text: '   ' }).expect(400);
    await http()
      .post('/conversations/speech')
      .set(auth)
      .send({ text: 'a'.repeat(501) })
      .expect(400);
    await http().post('/conversations/speech').set(auth).send({}).expect(400);
    await http().post('/conversations/speech').send({ text: 'Hi' }).expect(401);
    expect(kokoro.texts).toHaveLength(1);

    kokoro.failing = true;
    await http().post('/conversations/speech').set(auth).send({ text: 'Hello.' }).expect(502);
    kokoro.failing = false;
    kokoro.enabled = false;
    await http().post('/conversations/speech').set(auth).send({ text: 'Hello.' }).expect(503);
    kokoro.enabled = true;
  });

  it('reads the opening question once, in advance (MEM-132)', async () => {
    const { auth } = await register('opening');
    kokoro.texts.length = 0;
    for (let i = 0; i < 2; i++) {
      const res = await http().get('/conversations/speech/opening').set(auth).expect(200);
      expect(res.headers['content-type']).toBe('audio/mpeg');
    }
    // Already read at the first request (or at the start of the API): never twice.
    expect(kokoro.texts.filter((text) => text === 'What do you want to talk about today?').length).toBeLessThanOrEqual(
      1,
    );
  });

  it('gives a short token for the microphone, within the limits of the pronunciation assessment (MEM-133)', async () => {
    const { auth } = await register('token');
    const res = await http().post('/conversations/voice-token').set(auth).expect(200);
    expect(res.body).toEqual({
      token: expect.stringMatching(/^token-/),
      region: 'westeurope',
      expiresAt: expect.any(String),
    });
    expect(new Date(res.body.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(10 * 60 * 1000);
    await http().post('/conversations/voice-token').expect(401);

    tokens.failing = true;
    await http().post('/conversations/voice-token').set(auth).expect(503);
    tokens.failing = false;
    // 10 per minute, shared with the assessment of the cards: the failed one counted too.
    const statuses: number[] = [];
    for (let i = 0; i < 9; i++) statuses.push((await http().post('/conversations/voice-token').set(auth)).status);
    expect(statuses.slice(0, 8).every((status) => status === 200)).toBe(true);
    expect(statuses[8]).toBe(429);
  });

  it('keeps the pronunciation of a message said aloud with its evaluation (MEM-133)', async () => {
    const { auth } = await register('spoken');
    const { body: conversation } = await http().post('/conversations').set(auth).expect(201);
    const res = await http()
      .post(`/conversations/${conversation.id}/messages`)
      .set(auth)
      .send({
        text: 'I like hiking.',
        pronunciation: { score: 87.44, accuracy: 120, fluency: 80, completeness: 'x', words: ['hiking', 'hiking', 7] },
      })
      .buffer(true)
      .parse((response, callback) => {
        let data = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => (data += chunk));
        response.on('end', () => callback(null, data));
      })
      .expect(200);
    const expected = { score: 87.4, accuracy: 100, fluency: 80, completeness: null, words: ['hiking'] };
    expect(parseSse(res.body as string)[0].data.message).toMatchObject({ evaluation: { pronunciation: expected } });
    const saved = await http().get(`/conversations/${conversation.id}`).set(auth).expect(200);
    expect(saved.body.messages[1].evaluation.pronunciation).toEqual(expected);

    // Without scores, or typed: no pronunciation.
    await prisma.conversationMessage.updateMany({
      where: { conversationId: conversation.id },
      data: { createdAt: new Date(0) },
    });
    await send(auth, conversation.id, 'Typed.').expect(200);
    const typed = await http().get(`/conversations/${conversation.id}`).set(auth).expect(200);
    expect(typed.body.messages[3].evaluation).not.toHaveProperty('pronunciation');
    await http()
      .post(`/conversations/${conversation.id}/messages`)
      .set(auth)
      .send({ text: 'Hi.', pronunciation: 'great' })
      .expect(400);
  });

  it('deletes the conversations of more than 90 days, every night', async () => {
    const { auth } = await register('purge');
    const old = (await http().post('/conversations').set(auth).expect(201)).body;
    const recent = (await http().post('/conversations').set(auth).expect(201)).body;
    const now = new Date();
    await prisma.conversation.update({
      where: { id: old.id },
      data: { createdAt: new Date(now.getTime() - 91 * 24 * 60 * 60 * 1000) },
    });
    await prisma.conversation.update({
      where: { id: recent.id },
      data: { createdAt: new Date(now.getTime() - 89 * 24 * 60 * 60 * 1000) },
    });

    expect(await app.get(ConversationsService).purge(now)).toBeGreaterThanOrEqual(1);
    await http().get(`/conversations/${old.id}`).set(auth).expect(404);
    await http().get(`/conversations/${recent.id}`).set(auth).expect(200);
    expect(await prisma.conversationMessage.count({ where: { conversationId: old.id } })).toBe(0);
  });
});

describe('Conversations open to some accounts only (e2e, MEM-130)', () => {
  const allowedEmail = `chat-Allowed-${unique}@e2e.test`;
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());
  const login = async (email: string) => {
    const res = await http().post('/auth/register').send({ email, password: 'password123' }).expect(201);
    return { Authorization: `Bearer ${res.body.accessToken as string}` };
  };

  beforeAll(async () => {
    app = await start(new FakeConversationModel(), {
      allowed: ` ${allowedEmail.toUpperCase()} , someone@else.test`,
      issuer: null, // and no Azure: no microphone (MEM-133)
    });
  });
  afterAll(async () => {
    await app?.close();
  });

  it('is off for the other accounts: the status says so, the other routes answer 403', async () => {
    const allowed = await login(allowedEmail);
    const other = await login(`chat-closed-${unique}@e2e.test`);
    const { body: conversation } = await http().post('/conversations').set(allowed).expect(201);
    expect((await http().get('/conversations/status').set(allowed).expect(200)).body).toMatchObject({
      enabled: true,
      voiceInput: false,
    });
    await http().post('/conversations/voice-token').set(allowed).expect(503);
    await http().post('/conversations/voice-token').set(other).expect(403);

    expect((await http().get('/conversations/status').set(other).expect(200)).body).toEqual({ enabled: false });
    const closed = await http().post('/conversations').set(other).expect(403);
    expect(closed.body.message).toBe('The conversations with the AI are not open to this account');
    await http().get('/conversations').set(other).expect(403);
    await http().get(`/conversations/${conversation.id}`).set(other).expect(403);
    await http().delete(`/conversations/${conversation.id}`).set(other).expect(403);
    await http().post(`/conversations/${conversation.id}/messages`).set(other).send({ text: 'Hi' }).expect(403);
    await http().post('/conversations/speech').set(other).send({ text: 'Hi' }).expect(403);
    await http().get('/conversations/speech/opening').set(other).expect(403);
  });

  it('is open to nobody when the setting is empty', () => {
    expect(accessFor('').allows({ id: 'u', email: allowedEmail })).toBe(false);
    expect(accessFor('*').allows({ id: 'u', email: 'anyone@e2e.test' })).toBe(true);
  });
});

describe('Conversations: at most 3 requests per second (e2e, MEM-130)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await start(new FakeConversationModel(), { rateLimit: true });
  });
  afterAll(async () => {
    await app?.close();
  });

  it('answers 429 to the fourth request of the same second', async () => {
    const http = () => request(app.getHttpServer());
    const res = await http()
      .post('/auth/register')
      .send({ email: `chat-rate-${unique}@e2e.test`, password: 'password123' })
      .expect(201);
    const auth = { Authorization: `Bearer ${res.body.accessToken as string}` };
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await http().post('/conversations').set(auth)).status);
    expect(statuses).toEqual([201, 201, 201, 429]);
    // MEM-132: the sentences read aloud have their own 3 per second.
    const speech: number[] = [];
    for (let i = 0; i < 4; i++)
      speech.push((await http().post('/conversations/speech').set(auth).send({ text: 'Hi.' })).status);
    expect(speech).toEqual([200, 200, 200, 429]);
    // The readings are not counted: the status (every page, for the menu), the list, a conversation.
    await http().get('/conversations/status').set(auth).expect(200);
    await http().get('/conversations').set(auth).expect(200);
  });
});

describe('Conversations without AI model (e2e, MEM-130)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await start(null);
  });
  afterAll(async () => {
    await app?.close();
  });

  it('says it is off, and the other routes answer 503', async () => {
    const http = () => request(app.getHttpServer());
    const res = await http()
      .post('/auth/register')
      .send({ email: `chat-off-${unique}@e2e.test`, password: 'password123' })
      .expect(201);
    const auth = { Authorization: `Bearer ${res.body.accessToken as string}` };
    expect((await http().get('/conversations/status').set(auth).expect(200)).body).toEqual({ enabled: false });
    const off = await http().post('/conversations').set(auth).expect(503);
    expect(off.body.message).toBe('The conversations with the AI are off: no AI model is configured');
    await http().get('/conversations').set(auth).expect(503);
    const id = '00000000-0000-4000-8000-000000000000';
    await http().get(`/conversations/${id}`).set(auth).expect(503);
    await http().delete(`/conversations/${id}`).set(auth).expect(503);
    await http().post(`/conversations/${id}/messages`).set(auth).send({ text: 'Hi' }).expect(503);
  });
});

describe('The Chat IA in the console (e2e, MEM-135)', () => {
  const fake = new FakeConversationModel();
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: { Authorization: string };
  const http = () => request(app.getHttpServer());
  const adminEmail = `chat-admin-${unique}@e2e.test`;
  const password = 'a long admin password';
  const defaults = { enabled: true, messagesPerDay: 30, messagesPerConversation: 20, maxReplyWords: 120 };

  async function register(name: string) {
    const email = `chat-console-${name}-${unique}@e2e.test`;
    const res = await http().post('/auth/register').send({ email, password: 'password123' }).expect(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } });
    return { auth: { Authorization: `Bearer ${res.body.accessToken as string}` }, userId: user.id, email };
  }
  const send = (auth: Record<string, string>, id: string, text: string) =>
    http()
      .post(`/conversations/${id}/messages`)
      .set(auth)
      .send({ text })
      .buffer(true)
      .parse((res, callback) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (data += chunk));
        res.on('end', () => callback(null, data));
      });
  const put = (body: Record<string, unknown>) => http().put('/admin/chat/settings').set(admin).send(body);
  const aiListsSetting = () => prisma.appSetting.findUnique({ where: { key: 'ai-lists' } });

  beforeAll(async () => {
    process.env.ADMIN_JWT_SECRET = 'e2e-admin-secret';
    process.env.ADMIN_TOTP_ENCRYPTION_KEY = 'e2e0'.repeat(16);
    app = await start(fake);
    prisma = app.get(PrismaService);
    await prisma.appSetting.deleteMany({ where: { key: 'chat' } });
    await run(['create', adminEmail], prisma, async () => password);
    await prisma.adminAccount.update({ where: { email: adminEmail }, data: { totpDisabledAt: new Date() } });
    const login = await http().post('/admin/auth/login').send({ email: adminEmail, password }).expect(200);
    admin = { Authorization: `Bearer ${login.body.session.accessToken as string}` };
  });
  beforeEach(() => {
    fake.failure = null;
    fake.calls.length = 0;
  });
  afterAll(async () => {
    await prisma?.appSetting.deleteMany({ where: { key: 'chat' } });
    await prisma?.adminAccount.deleteMany({ where: { email: adminEmail } });
    await app?.close();
  });

  it('reads and sets the parameters: the defaults, the bounds; nothing with a user token', async () => {
    expect((await http().get('/admin/chat/settings').set(admin).expect(200)).body).toEqual({
      ...defaults,
      state: 'active',
    });
    for (const body of [
      { ...defaults, messagesPerDay: 0 },
      { ...defaults, messagesPerDay: 501 },
      { ...defaults, messagesPerConversation: 1 },
      { ...defaults, messagesPerConversation: 101 },
      { ...defaults, maxReplyWords: 29 },
      { ...defaults, maxReplyWords: 301 },
      { ...defaults, maxReplyWords: 50.5 },
      { ...defaults, messagesPerDay: '30' },
      { ...defaults, enabled: 'yes' },
      { messagesPerDay: 30, messagesPerConversation: 20, maxReplyWords: 120 },
    ]) {
      await put(body).expect(400);
    }
    const bounds = { enabled: true, messagesPerDay: 500, messagesPerConversation: 2, maxReplyWords: 300 };
    expect((await put(bounds).expect(200)).body).toEqual({ ...bounds, state: 'active' });
    await put({ ...bounds, messagesPerDay: 1, messagesPerConversation: 100, maxReplyWords: 30 }).expect(200);
    await put(defaults).expect(200);

    const { auth } = await register('token');
    await http().get('/admin/chat/settings').set(auth).expect(401);
    await http().put('/admin/chat/settings').set(auth).send(defaults).expect(401);
    await http().get('/admin/chat/usage').set(auth).expect(401);
    await http().get('/admin/chat/usage').expect(401);
  });

  it('the limits and the length of the replies apply at once', async () => {
    await put({ enabled: true, messagesPerDay: 3, messagesPerConversation: 2, maxReplyWords: 45 }).expect(200);
    const { auth } = await register('limits');
    expect((await http().get('/conversations/status').set(auth).expect(200)).body.limits).toEqual({
      messagesPerDay: 3,
      messagesPerConversation: 2,
      maxLength: 1000,
      maxReplyWords: 45,
    });
    const { body: first } = await http().post('/conversations').set(auth).expect(201);
    await send(auth, first.id, 'hello there').expect(200);
    expect(fake.calls.find((call) => call.kind === 'reply')?.maxWords).toBe(45);
    await send(auth, first.id, 'how are you').expect(200);
    expect(JSON.parse((await send(auth, first.id, 'third one').expect(429)).body as string)).toMatchObject({
      reason: 'conversation-limit',
    });
    const { body: second } = await http().post('/conversations').set(auth).expect(201);
    await send(auth, second.id, 'a new one').expect(200);
    expect(JSON.parse((await send(auth, second.id, 'one more').expect(429)).body as string)).toMatchObject({
      reason: 'daily-limit',
    });
    await put(defaults).expect(200);
    await send(auth, second.id, 'one more').expect(200);
  });

  it('off for everyone: status off, 503; « Générer avec l’IA » is not touched', async () => {
    const { auth } = await register('off');
    const { body: conversation } = await http().post('/conversations').set(auth).expect(201);
    const before = await aiListsSetting();
    expect((await put({ ...defaults, enabled: false }).expect(200)).body.state).toBe('off');
    expect((await http().get('/conversations/status').set(auth).expect(200)).body).toEqual({ enabled: false });
    await http().post('/conversations').set(auth).expect(503);
    await send(auth, conversation.id, 'hello').expect(503);
    expect(await aiListsSetting()).toEqual(before); // the parameters of the other feature, as they were
    await put(defaults).expect(200);
    await send(auth, conversation.id, 'hello').expect(200);
  });

  it('counts each day: conversations, messages, active users, tokens; the top users; never a text', async () => {
    const first = await register('usage-a');
    const second = await register('usage-b');
    const before = (await http().get('/admin/chat/usage').set(admin).expect(200)).body;
    const today = before.days[0];

    const { body: a } = await http().post('/conversations').set(first.auth).expect(201);
    await send(first.auth, a.id, 'my secret holiday plans').expect(200);
    await send(first.auth, a.id, 'and more').expect(200);
    const { body: b } = await http().post('/conversations').set(second.auth).expect(201);
    fake.failure = { kind: 'failed', during: 'reply' };
    await send(second.auth, b.id, 'this one fails').expect(502); // given back: not counted
    fake.failure = null;
    await send(second.auth, b.id, 'this one works').expect(200);
    await new Promise((resolve) => setTimeout(resolve, 100)); // the counters are written beside the calls

    const report = (await http().get('/admin/chat/usage').set(admin).expect(200)).body;
    expect(report.days).toHaveLength(30);
    expect(report.days[0]).toMatchObject({
      day: today.day,
      conversations: today.conversations + 2,
      messages: today.messages + 3,
      activeUsers: today.activeUsers + 2,
    });
    expect(report.days[0].inputTokens).toBeGreaterThan(today.inputTokens);
    expect(report.days[0].outputTokens).toBeGreaterThan(today.outputTokens);
    expect(report.month).toBe(today.day.slice(0, 7));
    expect(JSON.stringify(report)).not.toContain('secret');

    // The top users of the month: the one with the most messages first (others ran before).
    await prisma.chatUsage.update({
      where: { userId_day: { userId: first.userId, day: today.day } },
      data: { messages: { increment: 100_000 } },
    });
    const top = (await http().get('/admin/chat/usage').set(admin).expect(200)).body.top;
    expect(top[0]).toMatchObject({ id: first.userId, email: first.email, messages: 100_002 });
    expect(top[0].inputTokens).toBeGreaterThan(0);
    expect(top.length).toBeLessThanOrEqual(10);
    await prisma.chatUsage.update({
      where: { userId_day: { userId: first.userId, day: today.day } },
      data: { messages: { decrement: 100_000 } },
    });
  });

  it('keeps the counters 13 months', async () => {
    const { auth, userId } = await register('purge');
    await http().post('/conversations').set(auth).expect(201);
    await prisma.chatUsage.create({ data: { userId, day: '2020-01-01', messages: 4 } });
    await app.get(ChatUsageService).purge();
    expect(await prisma.chatUsage.count({ where: { userId, day: '2020-01-01' } })).toBe(0);
    expect(await prisma.chatUsage.count({ where: { userId } })).toBe(1);
  });

  it('says it is not configured without an AI', async () => {
    const none = await start(null);
    try {
      const login = await request(none.getHttpServer())
        .post('/admin/auth/login')
        .send({ email: adminEmail, password })
        .expect(200);
      const res = await request(none.getHttpServer())
        .get('/admin/chat/settings')
        .set({ Authorization: `Bearer ${login.body.session.accessToken as string}` })
        .expect(200);
      expect(res.body.state).toBe('unconfigured');
    } finally {
      await none.close();
    }
  });
});
