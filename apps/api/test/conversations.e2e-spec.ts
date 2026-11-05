import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { ConversationRateGuard } from '../src/conversations/conversation-rate.guard.js';
import { ConversationsService } from '../src/conversations/conversations.service.js';
import { CONVERSATION_MODEL, type ConversationModel } from '../src/conversations/model/conversation-model.js';
import { FakeConversationModel } from '../src/conversations/model/fake-conversation-model.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

async function start(model: ConversationModel | null | undefined, { rateLimit = false } = {}) {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (model !== undefined) builder = builder.overrideProvider(CONVERSATION_MODEL).useValue(model);
  // 3 requests per second would slow the scenarios down: tested on its own.
  if (!rateLimit) builder = builder.overrideGuard(ConversationRateGuard).useValue({ canActivate: () => true });
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
      limits: { messagesPerDay: 30, messagesPerConversation: 20, maxLength: 1000 },
      usedToday: 0,
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
    for (let i = 0; i < 4; i++) statuses.push((await http().get('/conversations').set(auth)).status);
    expect(statuses).toEqual([200, 200, 200, 429]);
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
