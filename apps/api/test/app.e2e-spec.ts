import { randomUUID } from 'node:crypto';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * End-to-end: the whole Nest application, on a real PostgreSQL database
 * whose schema is up to date (in the CI: a service container, migrated with
 * `prisma migrate deploy` before the tests). Each run registers new,
 * unique users, so it doesn't depend on what's already in the database.
 */
/** The target retentions of a new account (MEM-75). */
const RETENTIONS_90 = { vocabularyRetention: 90, quoteRetention: 90, mindMapRetention: 90 };

describe('API (e2e)', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  async function register(name: string): Promise<string> {
    const res = await http()
      .post('/auth/register')
      .send({ email: `${name}-${unique}@e2e.test`, password: 'password123' })
      .expect(201);
    return res.body.accessToken as string;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useBodyParser('json', { limit: '3mb' }); // as in main.ts
    // Same global pipe as main.ts, so that validation behaves as in production.
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /health answers ok when the database is reachable', async () => {
    await http().get('/health').expect(200, { status: 'ok' });
  });

  it('refuses protected routes without a token', async () => {
    await http().get('/items').expect(401);
  });

  it('registers a user and authenticates them with the returned token', async () => {
    const token = await register('alice');

    const me = await http().get('/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
    expect(me.body.email).toBe(`alice-${unique}@e2e.test`);
  });

  it('keeps a sliding session with renewal tokens, rotated, revoked on reuse and at logout (MEM-85)', async () => {
    const login = await http()
      .post('/auth/register')
      .set('User-Agent', 'Firefox e2e')
      .send({ email: `slide-${unique}@e2e.test`, password: 'password123' })
      .expect(201);
    expect(login.body).toEqual({
      accessToken: expect.any(String),
      refreshToken: expect.stringMatching(/^[0-9a-f-]{36}\./),
      refreshExpiresAt: expect.any(String),
    });

    // Renewed: a new access token that works, and a new renewal token.
    const renewed = await http().post('/auth/refresh').send({ refreshToken: login.body.refreshToken }).expect(200);
    expect(renewed.body.refreshToken).not.toBe(login.body.refreshToken);
    await http().get('/auth/me').set('Authorization', `Bearer ${renewed.body.accessToken}`).expect(200);
    const stored = await app.get(PrismaService).refreshToken.findMany({
      where: { user: { email: `slide-${unique}@e2e.test` } },
    });
    expect(stored).toHaveLength(2);
    expect(stored[0].device).toBe('Firefox e2e');

    // A second login, on another device.
    const other = await http()
      .post('/auth/login')
      .send({ email: `slide-${unique}@e2e.test`, password: 'password123' })
      .expect(200);

    // The first token, already used, comes back long after: the session of that device ends.
    await app
      .get(PrismaService)
      .refreshToken.updateMany({ where: { id: login.body.refreshToken.split('.')[0] }, data: { usedAt: new Date(0) } });
    await http().post('/auth/refresh').send({ refreshToken: login.body.refreshToken }).expect(401);
    await http().post('/auth/refresh').send({ refreshToken: renewed.body.refreshToken }).expect(401);
    // Not the other device's.
    const otherRenewed = await http().post('/auth/refresh').send({ refreshToken: other.body.refreshToken }).expect(200);

    // Logout: that session is over.
    await http().post('/auth/logout').send({ refreshToken: otherRenewed.body.refreshToken }).expect(204);
    await http().post('/auth/refresh').send({ refreshToken: otherRenewed.body.refreshToken }).expect(401);
    await http().post('/auth/refresh').send({}).expect(400);
    await http().post('/auth/logout').send({ refreshToken: 'unknown.token' }).expect(204);
  });

  it('records the last activity of a user, to the hour (MEM-83)', async () => {
    const prisma = app.get(PrismaService);
    const before = Date.now();
    const token = await register('activity');
    const email = `activity-${unique}@e2e.test`;
    const lastActive = async () =>
      (await prisma.user.findUniqueOrThrow({ where: { email }, select: { lastActiveAt: true } })).lastActiveAt;

    const registered = await lastActive();
    expect(registered!.getTime()).toBeGreaterThanOrEqual(before - 1000); // the registration

    // An authenticated call within the hour: not rewritten.
    await http().get('/items').set('Authorization', `Bearer ${token}`).expect(200);
    await new Promise((resolve) => setTimeout(resolve, 100)); // recorded in the background
    expect(await lastActive()).toEqual(registered);
  });

  it("creates an item with its review card, and keeps it out of other users' reach", async () => {
    const alice = await register('alice2');
    const bob = await register('bob');

    const created = await http()
      .post('/quotes')
      .set('Authorization', `Bearer ${alice}`)
      .send({ text: 'Connais-toi toi-même.', author: 'Socrate' })
      .expect(201);
    expect(created.body.card).toMatchObject({ state: 'New' });
    // MEM-67: a new quote waits in the learning queue of the quotes, out of the review.
    expect(created.body).toMatchObject({ learningStatus: 'ToLearn', learnPosition: 1 });

    const due = await http().get('/reviews/due').set('Authorization', `Bearer ${alice}`).expect(200);
    expect(due.body.total).toBe(0);
    await http().get('/reviews/due?type=Nope').set('Authorization', `Bearer ${alice}`).expect(400);
    const summary = await http().get('/reviews/due/summary').set('Authorization', `Bearer ${alice}`).expect(200);
    expect(summary.body).toEqual({ total: 0, byType: { Quote: 0, Vocabulary: 0, MindMap: 0 } });

    await http().get(`/quotes/${created.body.id}`).set('Authorization', `Bearer ${bob}`).expect(404);
    const bobItems = await http().get('/items').set('Authorization', `Bearer ${bob}`).expect(200);
    expect(bobItems.body).toEqual([]);
  });

  it('keeps a new vocabulary word out of the review until it is learned (MEM-15)', async () => {
    const token = await register('gina');
    const auth = { Authorization: `Bearer ${token}` };

    const word = await http()
      .post('/vocabulary')
      .set(auth)
      .send({ word: 'to cherish', translation: 'chérir' })
      .expect(201);
    expect(word.body.learningStatus).toBe('ToLearn');

    const due = await http().get('/reviews/due?type=Vocabulary').set(auth).expect(200);
    expect(due.body.total).toBe(0);
    const summary = await http().get('/reviews/due/summary').set(auth).expect(200);
    expect(summary.body.byType.Vocabulary).toBe(0);
  });

  it('edits a vocabulary word without touching its state or cards, and deletes it (MEM-19, MEM-20)', async () => {
    const owner = await register('hugo');
    const other = await register('ines');
    const auth = { Authorization: `Bearer ${owner}` };

    const created = await http()
      .post('/vocabulary')
      .set(auth)
      .send({ word: 'snag', translation: 'acroc', example: 'We hit a snag.', frenchExample: ' On a eu un accroc. ' })
      .expect(201);
    const id = created.body.id;
    expect(created.body.frenchExample).toBe('On a eu un accroc.'); // MEM-42, trimmed

    const edited = await http()
      .patch(`/vocabulary/${id}`)
      .set(auth)
      .send({ translation: 'accroc', example: '  ' })
      .expect(200);
    expect(edited.body).toMatchObject({
      word: 'snag',
      translation: 'accroc',
      example: null,
      learningStatus: 'ToLearn',
    });
    expect(edited.body.cards).toEqual(created.body.cards);
    expect(edited.body.frenchExample).toBe('On a eu un accroc.'); // untouched when not sent

    // MEM-42: the French example is edited, and removed when empty, on its own.
    const french = await http()
      .patch(`/vocabulary/${id}`)
      .set(auth)
      .send({ frenchExample: 'Petit accroc.' })
      .expect(200);
    expect(french.body).toMatchObject({ example: null, frenchExample: 'Petit accroc.' });
    const cleared = await http().patch(`/vocabulary/${id}`).set(auth).send({ frenchExample: '' }).expect(200);
    expect(cleared.body.frenchExample).toBeNull();
    await http()
      .patch(`/vocabulary/${id}`)
      .set(auth)
      .send({ frenchExample: 'x'.repeat(501) })
      .expect(400);

    // MEM-51: the topic, trimmed, removed when empty, 50 characters at most.
    expect(created.body.topic).toBeNull();
    const topic = await http().patch(`/vocabulary/${id}`).set(auth).send({ topic: '  Voyage ' }).expect(200);
    expect(topic.body.topic).toBe('Voyage');
    const noTopic = await http().patch(`/vocabulary/${id}`).set(auth).send({ topic: ' ' }).expect(200);
    expect(noTopic.body.topic).toBeNull();
    await http()
      .patch(`/vocabulary/${id}`)
      .set(auth)
      .send({ topic: 'x'.repeat(51) })
      .expect(400);

    await http().patch(`/vocabulary/${id}`).set(auth).send({ word: '' }).expect(400);
    await http().patch(`/vocabulary/${id}`).set('Authorization', `Bearer ${other}`).send({ word: 'x' }).expect(404);
    await http().delete(`/vocabulary/${id}`).set('Authorization', `Bearer ${other}`).expect(404);

    await http().delete(`/vocabulary/${id}`).set(auth).expect(204);
    await http().get(`/vocabulary/${id}`).set(auth).expect(404);
  });

  it('learns new vocabulary by sessions of five, the oldest first (MEM-21)', async () => {
    const token = await register('jade');
    const auth = { Authorization: `Bearer ${token}` };

    const words = [];
    for (const [word, translation] of [
      ['snag', 'accroc'],
      ['to cherish', 'chérir'],
    ]) {
      words.push((await http().post('/vocabulary').set(auth).send({ word, translation }).expect(201)).body);
    }

    const session = await http().get('/learning/session').set(auth).expect(200);
    expect(session.body.total).toBe(2);
    expect(session.body.items.map((item: { word: string }) => item.word)).toEqual(['snag', 'to cherish']);
    const cardId = session.body.items[1].cardId;

    const learned = await http().post(`/learning/${words[0].id}`).set(auth).send({ rating: 'Good' }).expect(201);
    expect(learned.body.learningStatus).toBe('Learning');

    // MEM-40: vocabulary is reviewed French → English only. That card, just
    // rated, comes back later; the English → French one is not reviewed.
    const due = await http().get('/reviews/due?type=Vocabulary').set(auth).expect(200);
    expect(due.body.total).toBe(0);
    expect(due.body.nextDueAt).not.toBeNull();

    const after = await http().get('/learning/session').set(auth).expect(200);
    expect(after.body.total).toBe(1);
    await http().post(`/learning/${words[0].id}`).set(auth).send({ rating: 'Good' }).expect(409);
    await http().post(`/learning/${words[1].id}`).set(auth).send({ rating: 'Nope' }).expect(400);

    // MEM-47: « À revoir » at step 2, then the card comes back at the end of
    // the session and is reviewed directly, with the previews returned.
    const again = await http().post(`/learning/${words[1].id}`).set(auth).send({ rating: 'Again' }).expect(201);
    expect(Object.keys(again.body.nextDueByRating)).toEqual(['Again', 'Hard', 'Good', 'Easy']);
    // « À revoir » makes the card due at once: still to review after leaving the session.
    const stillDue = await http().get('/reviews/due?type=Vocabulary').set(auth).expect(200);
    expect(stillDue.body.items.map((item: { card: { id: string } }) => item.card.id)).toContain(cardId);
    const reviewed = await http().post(`/reviews/${cardId}`).set(auth).send({ rating: 'Good' }).expect(201);
    expect(reviewed.body.id).toBe(cardId);
    expect(Object.keys(reviewed.body.nextDueByRating)).toEqual(['Again', 'Hard', 'Good', 'Easy']);
  });

  it('takes a learned word out of the review, and puts it back with the same schedule (MEM-22)', async () => {
    const token = await register('karl');
    const auth = { Authorization: `Bearer ${token}` };

    const word = (
      await http().post('/vocabulary').set(auth).send({ word: 'thrifty', translation: 'économe' }).expect(201)
    ).body;
    await http().post(`/learning/${word.id}`).set(auth).send({ rating: 'Good' }).expect(201);
    const before = await http().get(`/vocabulary/${word.id}`).set(auth).expect(200);

    const learned = await http().post(`/learning/${word.id}/learned`).set(auth).expect(201);
    expect(learned.body.learningStatus).toBe('Learned');
    const due = await http().get('/reviews/due/summary').set(auth).expect(200);
    expect(due.body.byType.Vocabulary).toBe(0);

    const back = await http().post(`/learning/${word.id}/relearn`).set(auth).expect(201);
    expect(back.body.learningStatus).toBe('Learning');
    const after = await http().get(`/vocabulary/${word.id}`).set(auth).expect(200);
    expect(after.body.cards).toEqual(before.body.cards);
    await http().post(`/learning/${word.id}/relearn`).set(auth).expect(409);
  });

  it('takes one branch of a mind map out of the review, and puts it back (MEM-48)', async () => {
    const token = await register('mila');
    const auth = { Authorization: `Bearer ${token}` };

    const map = (
      await http()
        .post('/mind-maps')
        .set(auth)
        .send({
          nodes: [
            { id: 'r', parentId: null, label: 'Mémoire', position: { x: 0, y: 0 } },
            { id: 'a', parentId: 'r', label: 'Répétition', position: { x: 100, y: 0 } },
            { id: 'b', parentId: 'r', label: 'Sommeil', position: { x: -100, y: 0 } },
          ],
        })
        .expect(201)
    ).body;
    const branch = map.cards.find((card: { nodeId: string }) => card.nodeId === 'a').id;

    await http().post(`/reviews/${branch}/learned`).set(auth).expect(201);
    await http().post(`/reviews/${branch}/learned`).set(auth).expect(409);

    // The map has only its other branch left, due tomorrow (staggered).
    const summary = await http().get('/reviews/due/summary').set(auth).expect(200);
    expect(summary.body.byType).toMatchObject({ MindMap: 0 });
    const mapDue = await http().get('/reviews/due?type=MindMap').set(auth).expect(200);
    const other = map.cards.find((card: { nodeId: string }) => card.nodeId === 'b');
    expect(new Date(mapDue.body.nextDueAt)).toEqual(new Date(other.due));
    const after = await http().get(`/mind-maps/${map.id}`).set(auth).expect(200);
    expect(after.body.cards.find((card: { id: string }) => card.id === branch).learnedAt).not.toBeNull();

    await http().post(`/reviews/${branch}/relearn`).set(auth).expect(201);
    await http().post(`/reviews/${branch}/relearn`).set(auth).expect(409);
    const back = await http().get('/reviews/due/summary').set(auth).expect(200);
    expect(back.body.byType.MindMap).toBe(1);
  });

  it('gives the quotes the four states and a learning queue of their own (MEM-67)', async () => {
    const auth = { Authorization: `Bearer ${await register('quinn')}` };
    const quote = async (text: string, queue?: boolean) =>
      (await http().post('/quotes').set(auth).send({ text, queue }).expect(201)).body;
    const word = async (text: string) =>
      (await http().post('/vocabulary').set(auth).send({ word: text, translation: text }).expect(201)).body;
    const positions = async (path: string) =>
      Object.fromEntries(
        (
          (await http().get(path).set(auth).expect(200)).body as {
            text?: string;
            word?: string;
            learnPosition: number;
          }[]
        )
          .filter((item) => item.learnPosition !== null)
          .map((item) => [item.text ?? item.word, item.learnPosition]),
      );

    const q1 = await quote('Un');
    const w1 = await word('one');
    const q2 = await quote('Deux');
    const q3 = await quote('Trois');
    await word('two');
    const waiting = await quote('Plus tard', false);
    expect(waiting).toMatchObject({ learningStatus: 'Waiting', learnPosition: null });
    // Each queue is numbered on its own.
    expect(await positions('/quotes')).toEqual({ Un: 1, Deux: 2, Trois: 3 });
    expect(await positions('/vocabulary')).toEqual({ one: 1, two: 2 });

    // Moving, adding, removing: only the queue of the type given.
    await http().post('/learning/queue/move').set(auth).send({ type: 'Quote', id: q3.id, position: 1 }).expect(200);
    await http().post('/learning/queue/move').set(auth).send({ id: q3.id, position: 1 }).expect(409); // not vocabulary
    const added = await http()
      .post('/learning/queue/add')
      .set(auth)
      .send({ type: 'Quote', ids: [waiting.id, w1.id] })
      .expect(200);
    expect(added.body).toEqual({ changed: 1, ignored: 1 });
    await http()
      .post('/learning/queue/remove')
      .set(auth)
      .send({ ids: [w1.id, q1.id] })
      .expect(200);
    expect(await positions('/quotes')).toEqual({ Trois: 1, Un: 2, Deux: 3, 'Plus tard': 4 });
    expect(await positions('/vocabulary')).toEqual({ two: 1 });
    await http()
      .post('/learning/queue/top')
      .set(auth)
      .send({ type: 'Nope', ids: [q1.id] })
      .expect(400);

    // « Appris » straight from the queue, then back in the review: per item, as the vocabulary.
    await http().post(`/reviews/${q2.card.id}/learned`).set(auth).expect(409);
    const learned = await http().post(`/learning/${q2.id}/learned`).set(auth).expect(201);
    expect(learned.body.learningStatus).toBe('Learned');
    expect(await positions('/quotes')).toEqual({ Trois: 1, Un: 2, 'Plus tard': 3 });
    await http().post(`/learning/${q2.id}/relearn`).set(auth).expect(201);
    const summary = await http().get('/reviews/due/summary').set(auth).expect(200);
    expect(summary.body.byType).toMatchObject({ Quote: 1, Vocabulary: 0 });

    // Deleting a quote of the queue: the next ones move up, the vocabulary stays.
    await http().delete(`/quotes/${q3.id}`).set(auth).expect(204);
    expect(await positions('/quotes')).toEqual({ Un: 1, 'Plus tard': 2 });
    expect(await positions('/vocabulary')).toEqual({ two: 1 });
  });

  it('learns the quotes in one step, the first ones of their queue (MEM-68)', async () => {
    const auth = { Authorization: `Bearer ${await register('rose')}` };
    const ids: string[] = [];
    for (const text of ['Un', 'Deux', 'Trois', 'Quatre', 'Cinq', 'Six']) {
      ids.push((await http().post('/quotes').set(auth).send({ text, author: 'Moi' }).expect(201)).body.id);
    }
    await http().post('/vocabulary').set(auth).send({ word: 'snag', translation: 'accroc' }).expect(201);
    await http().post('/learning/queue/move').set(auth).send({ type: 'Quote', id: ids[5], position: 1 }).expect(200);

    const session = await http().get('/learning/session?type=Quote').set(auth).expect(200);
    expect(session.body.total).toBe(6);
    expect(session.body.items.map((item: { text: string }) => item.text)).toEqual([
      'Six',
      'Un',
      'Deux',
      'Trois',
      'Quatre',
    ]);
    expect(session.body.items[0]).toMatchObject({ author: 'Moi', source: null });
    expect(Object.keys(session.body.items[0].nextDueAfterAgain)).toEqual(['Again', 'Hard', 'Good', 'Easy']);
    await http().get('/learning/session?type=MindMap').set(auth).expect(400);

    // MEM-94: the quotes chosen on the preparation page, in this order; a
    // vocabulary item or an unknown id is left out.
    const vocabularyId = (await http().get('/learning/session').set(auth).expect(200)).body.items[0].id;
    const chosen = await http()
      .get(`/learning/session?type=Quote&ids=${ids[3]},${ids[0]},${vocabularyId},${randomUUID()}`)
      .set(auth)
      .expect(200);
    expect(chosen.body.total).toBe(6);
    expect(chosen.body.items.map((item: { text: string }) => item.text)).toEqual(['Quatre', 'Un']);
    await http().get('/learning/session?ids=nope').set(auth).expect(400);
    await http()
      .get(`/learning/session?ids=${Array.from({ length: 11 }, () => randomUUID()).join(',')}`)
      .set(auth)
      .expect(400);
    // The vocabulary session is not mixed with it.
    const words = await http().get('/learning/session').set(auth).expect(200);
    expect(words.body.items.map((item: { word: string }) => item.word)).toEqual(['snag']);

    // « Bien »: into the review, its card scheduled; « Appris »: straight out of it.
    const learned = await http().post(`/learning/${ids[5]}`).set(auth).send({ rating: 'Good' }).expect(201);
    expect(learned.body.learningStatus).toBe('Learning');
    await http().post(`/learning/${ids[0]}/learned`).set(auth).expect(201);
    await http().post(`/learning/${ids[5]}`).set(auth).send({ rating: 'Good' }).expect(409);

    const after = await http().get('/learning/session?type=Quote').set(auth).expect(200);
    expect(after.body.total).toBe(4);
    const quotes = (await http().get('/quotes').set(auth).expect(200)).body as {
      text: string;
      learningStatus: string;
      learnPosition: number | null;
      card: { state: string };
    }[];
    const byText = Object.fromEntries(quotes.map((quote) => [quote.text, quote]));
    expect(byText.Six).toMatchObject({ learningStatus: 'Learning', learnPosition: null });
    expect(byText.Six.card.state).not.toBe('New');
    expect(byText.Un).toMatchObject({ learningStatus: 'Learned', learnPosition: null });
    expect(byText.Deux.learnPosition).toBe(1);
    expect(byText.Cinq.learnPosition).toBe(4);
  });

  it('takes a word still to learn straight to "Learned", out of the review (MEM-46)', async () => {
    const token = await register('lena');
    const auth = { Authorization: `Bearer ${token}` };

    const word = (
      await http().post('/vocabulary').set(auth).send({ word: 'to know', translation: 'savoir' }).expect(201)
    ).body;
    const learned = await http().post(`/learning/${word.id}/learned`).set(auth).expect(201);
    expect(learned.body.learningStatus).toBe('Learned');

    const session = await http().get('/learning/session').set(auth).expect(200);
    expect(session.body.total).toBe(0);
    const due = await http().get('/reviews/due/summary').set(auth).expect(200);
    expect(due.body.byType.Vocabulary).toBe(0);
    await http().post(`/learning/${word.id}/learned`).set(auth).expect(409);
  });

  it('exports the quotes as CSV and imports them back, "En attente" (MEM-72)', async () => {
    const auth = { Authorization: `Bearer ${await register('wes')}` };
    await http()
      .post('/quotes')
      .set(auth)
      .send({ text: 'Il dit : "Viens; vite".\nPuis partit.', author: 'Moi', source: 'Ici' })
      .expect(201);
    await http().post('/quotes').set(auth).send({ text: 'La vie est un songe.', queue: false }).expect(201);
    await http().post('/vocabulary').set(auth).send({ word: 'snag', translation: 'accroc' }).expect(201);

    const exported = await http().get('/quotes-csv/export').set(auth).expect(200);
    expect(exported.headers['content-disposition']).toMatch(
      /^attachment; filename="mementorize-citations-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    expect(exported.text).toBe(
      '\uFEFFTexte;Auteur;Source\r\n"Il dit : ""Viens; vite"".\nPuis partit.";Moi;Ici\r\nLa vie est un songe.;;\r\n',
    );

    // Round trip, in another account: the same quotes.
    const other = { Authorization: `Bearer ${await register('xia')}` };
    const preview = await http().post('/quotes-csv/preview').set(other).send({ content: exported.text }).expect(200);
    expect(preview.body.summary).toEqual({ total: 2, new: 2, duplicate: 0, error: 0 });
    const imported = await http().post('/quotes-csv/import').set(other).send({ content: exported.text }).expect(200);
    expect(imported.body).toEqual({ ok: true, imported: 2, duplicate: 0, error: 0 });
    const quotes = (await http().get('/quotes').set(other).expect(200)).body as Record<string, unknown>[];
    expect(
      quotes.map(({ text, author, source, learningStatus }) => ({ text, author, source, learningStatus })),
    ).toEqual(
      expect.arrayContaining([
        { text: 'Il dit : "Viens; vite".\nPuis partit.', author: 'Moi', source: 'Ici', learningStatus: 'Waiting' },
        { text: 'La vie est un songe.', author: null, source: null, learningStatus: 'Waiting' },
      ]),
    );

    // Again: only duplicates; the other separator is reported.
    const again = await http().post('/quotes-csv/import').set(other).send({ content: exported.text }).expect(200);
    expect(again.body).toEqual({ ok: true, imported: 0, duplicate: 2, error: 0 });
    const comma = await http()
      .post('/quotes-csv/preview')
      .set(other)
      .send({ content: 'Texte,Auteur,Source\nUn,Moi,\n' })
      .expect(200);
    expect(comma.body).toEqual({ ok: false, problem: 'wrongSeparator', candidates: [','] });
    await http().post('/quotes-csv/preview').send({ content: 'x' }).expect(401);
  });

  it('exports the vocabulary as CSV, with the separator of the settings (MEM-52, MEM-55)', async () => {
    const token = await register('nora');
    const auth = { Authorization: `Bearer ${token}` };

    const empty = await http().get('/vocabulary-csv/export').set(auth).expect(200);
    expect(empty.text).toBe(
      '\uFEFFExpression française;Expression anglaise;Thématique;Phrase exemple français;Phrase exemple anglais\r\n',
    );

    await http().post('/vocabulary').set(auth).send({ word: 'snag', translation: 'accroc' }).expect(201);
    await http()
      .post('/vocabulary')
      .set(auth)
      .send({
        word: 'boarding pass',
        translation: 'carte d’embarquement',
        topic: 'Voyage',
        example: 'Show your "boarding pass"; please.',
        frenchExample: 'Montrez votre carte.',
      })
      .expect(201);

    const res = await http().get('/vocabulary-csv/export').set(auth).expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="mementorize-anglais-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    expect(res.text.split('\r\n').slice(1)).toEqual([
      'accroc;snag;;;',
      'carte d’embarquement;boarding pass;Voyage;Montrez votre carte.;"Show your ""boarding pass""; please."',
      '',
    ]);

    await http().put('/preferences').set(auth).send({ csvSeparator: ',' }).expect(200);
    const comma = await http().get('/vocabulary-csv/export').set(auth).expect(200);
    expect(comma.text.split('\r\n')[2]).toBe(
      'carte d’embarquement,boarding pass,Voyage,Montrez votre carte.,"Show your ""boarding pass""; please."',
    );
    // MEM-80: any character; the values that hold it between double quotes.
    await http().put('/preferences').set(auth).send({ csvSeparator: ' ' }).expect(200);
    const space = await http().get('/vocabulary-csv/export').set(auth).expect(200);
    expect(space.text.split('\r\n')[1]).toBe('accroc snag   ');
    expect(space.text.split('\r\n')[2]).toBe(
      '"carte d’embarquement" "boarding pass" Voyage "Montrez votre carte." "Show your ""boarding pass""; please."',
    );
    await http().put('/preferences').set(auth).send({ csvSeparator: '\t' }).expect(200);
    const tab = await http().get('/vocabulary-csv/export').set(auth).expect(200);
    const imported = await http().post('/vocabulary-csv/preview').set(auth).send({ content: tab.text }).expect(200);
    expect(imported.body.summary).toEqual({ total: 2, new: 0, duplicate: 2, error: 0 }); // read back: the same items
    await http().get('/vocabulary-csv/export').expect(401);
  });

  it('previews a CSV file to import, with its duplicates and errors, without saving anything (MEM-53)', async () => {
    const token = await register('oscar');
    const auth = { Authorization: `Bearer ${token}` };
    await http().post('/vocabulary').set(auth).send({ word: 'snag', translation: 'accroc' }).expect(201);

    const content =
      '\uFEFFExpression française;Expression anglaise;Thématique;Phrase exemple français;Phrase exemple anglais\r\n' +
      'Accroc;hitch\r\nchérir;to cherish;Émotions\r\n;orphan\r\n';
    const preview = await http().post('/vocabulary-csv/preview').set(auth).send({ content }).expect(200);
    expect(preview.body.summary).toEqual({ total: 3, new: 1, duplicate: 1, error: 1 });
    expect(preview.body.rows[0]).toMatchObject({
      line: 2,
      status: 'duplicate',
      languages: ['fr'],
      of: { existing: 'snag → accroc' },
    });
    expect(preview.body.rows[1]).toMatchObject({ line: 3, status: 'new', topic: 'Émotions' });

    // Nothing saved; the other separator is spotted; a large file goes through.
    const items = await http().get('/vocabulary').set(auth).expect(200);
    expect(items.body).toHaveLength(1);
    const wrong = await http()
      .post('/vocabulary-csv/preview')
      .set(auth)
      .send({ content: 'Français,Anglais\r\nchérir,to cherish\r\n' })
      .expect(200);
    expect(wrong.body).toEqual({ ok: false, problem: 'wrongSeparator', candidates: [','] });
    const big = 'un;one;' + 'x'.repeat(40) + ';' + 'phrase '.repeat(70) + '\r\n';
    const large = await http()
      .post('/vocabulary-csv/preview')
      .set(auth)
      .send({ content: 'Français;Anglais\r\n' + big.repeat(1500) })
      .expect(200);
    expect(large.body.summary.total).toBe(1500);
    await http().post('/vocabulary-csv/preview').set(auth).send({}).expect(400);
  });

  it('imports the new lines of a CSV file, all at once, as items to learn, and round-trips the export (MEM-54)', async () => {
    const token = await register('pia');
    const auth = { Authorization: `Bearer ${token}` };
    await http().post('/vocabulary').set(auth).send({ word: 'snag', translation: 'accroc' }).expect(201);

    const content =
      'Expression française;Expression anglaise;Thématique;Phrase exemple français;Phrase exemple anglais\r\n' +
      'chérir;to cherish;Émotions;Je chéris.;I cherish.\r\naccroc;hitch\r\nbagages;luggage;Voyage\r\n;orphan\r\n';
    const result = await http().post('/vocabulary-csv/import').set(auth).send({ content }).expect(200);
    expect(result.body).toEqual({ ok: true, imported: 2, duplicate: 1, error: 1 });

    const items = await http().get('/vocabulary').set(auth).expect(200);
    const cherish = items.body.find((item: { word: string }) => item.word === 'to cherish');
    expect(cherish).toMatchObject({
      translation: 'chérir',
      topic: 'Émotions',
      frenchExample: 'Je chéris.',
      example: 'I cherish.',
      learningStatus: 'Waiting', // MEM-62
      learnPosition: null,
    });
    expect(cherish.cards).toHaveLength(2);
    // Not in the learning queue: only the word entered by hand is to learn.
    const session = await http().get('/learning/session').set(auth).expect(200);
    expect(session.body.items.map((item: { word: string }) => item.word)).toEqual(['snag']);

    // Imported again: everything is a duplicate now.
    const again = await http().post('/vocabulary-csv/import').set(auth).send({ content }).expect(200);
    expect(again.body).toEqual({ ok: true, imported: 0, duplicate: 3, error: 1 });

    // Round trip: the export of this account, imported on another one, gives the same items.
    const exported = await http().get('/vocabulary-csv/export').set(auth).expect(200);
    const other = { Authorization: `Bearer ${await register('quentin')}` };
    const copy = await http().post('/vocabulary-csv/import').set(other).send({ content: exported.text }).expect(200);
    expect(copy.body).toEqual({ ok: true, imported: 3, duplicate: 0, error: 0 });
    const copied = await http().get('/vocabulary-csv/export').set(other).expect(200);
    expect(copied.text).toBe(exported.text);
  });

  it("deletes several vocabulary items at once, only the user's own (MEM-59)", async () => {
    const token = await register('rita');
    const auth = { Authorization: `Bearer ${token}` };
    const other = { Authorization: `Bearer ${await register('sam')}` };
    const ids: string[] = [];
    for (const word of ['one', 'two', 'three']) {
      ids.push((await http().post('/vocabulary').set(auth).send({ word, translation: word }).expect(201)).body.id);
    }
    const theirs = (
      await http().post('/vocabulary').set(other).send({ word: 'four', translation: 'quatre' }).expect(201)
    ).body.id;
    const quote = (await http().post('/quotes').set(auth).send({ text: 'Une citation.' }).expect(201)).body.id;

    const result = await http()
      .post('/vocabulary/delete')
      .set(auth)
      .send({ ids: [ids[0], ids[1], theirs, quote, 'unknown'] })
      .expect(200);
    expect(result.body).toEqual({ deleted: 2 });

    const left = await http().get('/vocabulary').set(auth).expect(200);
    expect(left.body.map((item: { id: string }) => item.id)).toEqual([ids[2]]);
    await http().get(`/vocabulary/${theirs}`).set(other).expect(200);
    await http().get(`/quotes/${quote}`).set(auth).expect(200);
    await http().post('/vocabulary/delete').set(auth).send({ ids: [] }).expect(400);
    await http()
      .post('/vocabulary/delete')
      .send({ ids: [ids[2]] })
      .expect(401);
  });

  it("edits a quote, and deletes several quotes at once, only the user's own (MEM-69)", async () => {
    const auth = { Authorization: `Bearer ${await register('uma')}` };
    const other = { Authorization: `Bearer ${await register('vic')}` };
    const ids: string[] = [];
    for (const text of ['Un', 'Deux', 'Trois']) {
      ids.push(
        (await http().post('/quotes').set(auth).send({ text, author: 'Moi', source: 'Ici' }).expect(201)).body.id,
      );
    }
    const theirs = (await http().post('/quotes').set(other).send({ text: 'Quatre' }).expect(201)).body.id;
    const word = (await http().post('/vocabulary').set(auth).send({ word: 'snag', translation: 'accroc' }).expect(201))
      .body.id;

    // The author emptied: removed; the state and the place in the queue stay.
    const edited = await http()
      .patch(`/quotes/${ids[2]}`)
      .set(auth)
      .send({ text: ' Trois, revu ', author: ' ' })
      .expect(200);
    expect(edited.body).toMatchObject({ text: 'Trois, revu', author: null, source: 'Ici', learnPosition: 3 });

    const result = await http()
      .post('/quotes/delete')
      .set(auth)
      .send({ ids: [ids[0], ids[1], theirs, word, 'unknown'] })
      .expect(200);
    expect(result.body).toEqual({ deleted: 2 });
    const left = (await http().get('/quotes').set(auth).expect(200)).body;
    expect(left.map((quote: { id: string; learnPosition: number }) => [quote.id, quote.learnPosition])).toEqual([
      [ids[2], 1],
    ]);
    await http().get(`/quotes/${theirs}`).set(other).expect(200);
    await http().get(`/vocabulary/${word}`).set(auth).expect(200);
  });

  it('keeps the learning queue numbered 1, 2, 3… and learns it in that order (MEM-61)', async () => {
    const auth = { Authorization: `Bearer ${await register('tess')}` };
    const ids: string[] = [];
    for (const word of ['one', 'two', 'three', 'four']) {
      const created = await http().post('/vocabulary').set(auth).send({ word, translation: word }).expect(201);
      ids.push(created.body.id);
      expect(created.body.learnPosition).toBe(ids.length);
    }
    const positions = async () =>
      Object.fromEntries(
        (await http().get('/vocabulary').set(auth).expect(200)).body.map(
          (item: { word: string; learnPosition: number | null }) => [item.word, item.learnPosition],
        ),
      );

    await http().post(`/learning/${ids[0]}`).set(auth).send({ rating: 'Good' }).expect(201);
    expect(await positions()).toEqual({ one: null, two: 1, three: 2, four: 3 });
    await http().delete(`/vocabulary/${ids[2]}`).set(auth).expect(204);
    expect(await positions()).toEqual({ one: null, two: 1, four: 2 });
    await http().post(`/learning/${ids[3]}/learned`).set(auth).expect(201);
    expect(await positions()).toEqual({ one: null, two: 1, four: null });

    // MEM-62: entered "En attente", out of the queue.
    const waiting = await http()
      .post('/vocabulary')
      .set(auth)
      .send({ word: 'five', translation: 'cinq', queue: false })
      .expect(201);
    expect(waiting.body).toMatchObject({ learningStatus: 'Waiting', learnPosition: null });
    const queued = await http().post('/vocabulary').set(auth).send({ word: 'six', translation: 'six' }).expect(201);
    expect(queued.body).toMatchObject({ learningStatus: 'ToLearn', learnPosition: 2 });

    const session = await http().get('/learning/session').set(auth).expect(200);
    expect(session.body.items.map((item: { word: string }) => item.word)).toEqual(['two', 'six']); // not 'five', "En attente"
  });

  it('puts items in the learning queue and takes them out, in bulk, ignoring the others (MEM-63)', async () => {
    const auth = { Authorization: `Bearer ${await register('ugo')}` };
    const add = async (word: string, queue = true) =>
      (await http().post('/vocabulary').set(auth).send({ word, translation: word, queue }).expect(201)).body.id;
    const a = await add('a');
    const b = await add('b');
    const w1 = await add('w1', false);
    const w2 = await add('w2', false);
    const positions = async () =>
      Object.fromEntries(
        (await http().get('/vocabulary').set(auth).expect(200)).body.map(
          (item: { word: string; learningStatus: string; learnPosition: number | null }) => [
            item.word,
            item.learnPosition ?? item.learningStatus,
          ],
        ),
      );

    // In the order given: w2 then w1, last; a is already in the queue: ignored.
    const added = await http()
      .post('/learning/queue/add')
      .set(auth)
      .send({ ids: [w2, a, w1] })
      .expect(200);
    expect(added.body).toEqual({ changed: 2, ignored: 1 });
    expect(await positions()).toEqual({ a: 1, b: 2, w2: 3, w1: 4 });

    const removed = await http()
      .post('/learning/queue/remove')
      .set(auth)
      .send({ ids: [a, w2, 'unknown'] })
      .expect(200);
    expect(removed.body).toEqual({ changed: 2, ignored: 1 });
    expect(await positions()).toEqual({ a: 'Waiting', b: 1, w2: 'Waiting', w1: 2 });

    const other = { Authorization: `Bearer ${await register('vera')}` };
    const theirs = await http()
      .post('/learning/queue/add')
      .set(other)
      .send({ ids: [a] })
      .expect(200);
    expect(theirs.body).toEqual({ changed: 0, ignored: 1 });
    await http().post('/learning/queue/add').set(auth).send({ ids: [] }).expect(400);
    expect(b).toBeDefined();
  });

  it('reorders the learning queue: a move, or a selection at its head (MEM-64)', async () => {
    const auth = { Authorization: `Bearer ${await register('wade')}` };
    const ids: Record<string, string> = {};
    for (const word of ['a', 'b', 'c', 'd', 'e']) {
      ids[word] = (await http().post('/vocabulary').set(auth).send({ word, translation: word }).expect(201)).body.id;
    }
    const order = async () =>
      (await http().get('/vocabulary').set(auth).expect(200)).body
        .filter((item: { learnPosition: number | null }) => item.learnPosition !== null)
        .sort((x: { learnPosition: number }, y: { learnPosition: number }) => x.learnPosition - y.learnPosition)
        .map((item: { word: string }) => item.word)
        .join('');

    const moved = await http().post('/learning/queue/move').set(auth).send({ id: ids.e, position: 2 }).expect(200);
    expect(moved.body).toEqual({ position: 2, total: 5 });
    expect(await order()).toBe('aebcd');
    const last = await http().post('/learning/queue/move').set(auth).send({ id: ids.a, position: 99 }).expect(200);
    expect(last.body).toEqual({ position: 5, total: 5 });
    expect(await order()).toBe('ebcda');

    const top = await http()
      .post('/learning/queue/top')
      .set(auth)
      .send({ ids: [ids.d, ids.b, 'unknown'] })
      .expect(200);
    expect(top.body).toEqual({ changed: 2, ignored: 1 });
    expect(await order()).toBe('bdeca'); // b before d: their order in the queue

    // The next learning session follows it.
    const session = await http().get('/learning/session').set(auth).expect(200);
    expect(session.body.items.map((item: { word: string }) => item.word).join('')).toBe('bdeca');

    await http()
      .post('/learning/queue/remove')
      .set(auth)
      .send({ ids: [ids.c] })
      .expect(200);
    await http().post('/learning/queue/move').set(auth).send({ id: ids.c, position: 1 }).expect(409);
    await http().post('/learning/queue/move').set(auth).send({ id: ids.b, position: 0 }).expect(400);
  });

  it('saves the first name and last name of the profile, trimmed, and clears them when empty', async () => {
    const token = await register('frank');
    const auth = { Authorization: `Bearer ${token}` };

    const initial = await http().get('/profile').set(auth).expect(200);
    expect(initial.body).toEqual({ email: `frank-${unique}@e2e.test`, firstName: null, lastName: null });

    const saved = await http()
      .put('/profile')
      .set(auth)
      .send({ firstName: '  Frank ', lastName: ' Martin  ' })
      .expect(200);
    expect(saved.body).toMatchObject({ firstName: 'Frank', lastName: 'Martin' });

    await http()
      .put('/profile')
      .set(auth)
      .send({ firstName: 'x'.repeat(81), lastName: '' })
      .expect(400);
    const cleared = await http().put('/profile').set(auth).send({ firstName: '', lastName: '   ' }).expect(200);
    expect(cleared.body).toMatchObject({ firstName: null, lastName: null });
  });

  it('saves the home space (Anglais by default), the translation service (DeepL by default), the delays (hidden by default) and the CSV separator (semicolon by default), each on its own', async () => {
    const token = await register('erin');
    const auth = { Authorization: `Bearer ${token}` };

    const initial = await http().get('/preferences').set(auth).expect(200);
    expect(initial.body).toEqual({
      homeSpace: 'Vocabulary',
      translator: 'DeepL',
      showReviewDelays: false,
      csvSeparator: ';',
      vocabularyPageSize: 20,
      ...RETENTIONS_90,
    });

    await http().put('/preferences').set(auth).send({ homeSpace: 'Quote' }).expect(200);
    const saved = await http().get('/preferences').set(auth).expect(200);
    expect(saved.body).toEqual({
      homeSpace: 'Quote',
      translator: 'DeepL',
      showReviewDelays: false,
      csvSeparator: ';',
      vocabularyPageSize: 20,
      ...RETENTIONS_90,
    });

    // MEM-44: the translator alone, the home space untouched.
    const translator = await http().put('/preferences').set(auth).send({ translator: 'Google' }).expect(200);
    expect(translator.body).toEqual({
      homeSpace: 'Quote',
      translator: 'Google',
      showReviewDelays: false,
      csvSeparator: ';',
      vocabularyPageSize: 20,
      ...RETENTIONS_90,
    });

    // MEM-49: the delays on the rating buttons, off by default.
    const delays = await http().put('/preferences').set(auth).send({ showReviewDelays: true }).expect(200);
    expect(delays.body).toEqual({
      homeSpace: 'Quote',
      translator: 'Google',
      showReviewDelays: true,
      csvSeparator: ';',
      vocabularyPageSize: 20,
      ...RETENTIONS_90,
    });
    await http().put('/preferences').set(auth).send({ showReviewDelays: 'yes' }).expect(400);

    // MEM-55, MEM-80: the CSV separator, a semicolon by default, any single character.
    for (const separator of ['|', '\t', ' ', 'é', ',']) {
      const csv = await http().put('/preferences').set(auth).send({ csvSeparator: separator }).expect(200);
      expect(csv.body).toMatchObject({ csvSeparator: separator, showReviewDelays: true });
    }
    for (const refused of ['"', '\n', '\r', '', ';;', 'Tab', 3]) {
      await http().put('/preferences').set(auth).send({ csvSeparator: refused }).expect(400);
    }

    // MEM-58: items per page of the vocabulary list, 20 by default.
    const pages = await http().put('/preferences').set(auth).send({ vocabularyPageSize: 50 }).expect(200);
    expect(pages.body).toMatchObject({ vocabularyPageSize: 50, csvSeparator: ',' });
    await http().put('/preferences').set(auth).send({ vocabularyPageSize: 30 }).expect(400);

    // MEM-75: the target retention of each space, 90 % by default.
    const retention = await http().put('/preferences').set(auth).send({ quoteRetention: 95 }).expect(200);
    expect(retention.body).toMatchObject({ vocabularyRetention: 90, quoteRetention: 95, mindMapRetention: 90 });
    await http().put('/preferences').set(auth).send({ mindMapRetention: 85, vocabularyRetention: 95 }).expect(200);
    for (const refused of [80, 92, '90', null]) {
      await http().put('/preferences').set(auth).send({ quoteRetention: refused }).expect(400);
    }

    await http().put('/preferences').set(auth).send({ homeSpace: 'Nope' }).expect(400);
    await http().put('/preferences').set(auth).send({ translator: 'Babelfish' }).expect(400);
    await http().get('/preferences').expect(401);
  });

  it('saves the reminder settings, and validates the time zone', async () => {
    const token = await register('dave');
    const auth = { Authorization: `Bearer ${token}` };

    const initial = await http().get('/reminders/settings').set(auth).expect(200);
    expect(initial.body).toMatchObject({ enabled: false, hour: 8, timeZone: 'Europe/Paris' });

    await http()
      .put('/reminders/settings')
      .set(auth)
      .send({ enabled: true, hour: 19, timeZone: 'America/Montreal' })
      .expect(200);
    const saved = await http().get('/reminders/settings').set(auth).expect(200);
    expect(saved.body).toMatchObject({ enabled: true, hour: 19, timeZone: 'America/Montreal' });

    await http()
      .put('/reminders/settings')
      .set(auth)
      .send({ enabled: true, hour: 24, timeZone: 'Europe/Paris' })
      .expect(400);
    await http()
      .put('/reminders/settings')
      .set(auth)
      .send({ enabled: true, hour: 8, timeZone: 'Mars/Olympus' })
      .expect(400);
  });

  it('refuses a forged unsubscribe link', async () => {
    await http().post('/reminders/unsubscribe').send({ user: 'someone', token: 'forged' }).expect(400);
  });

  it('rejects an invalid mind map (cycle) with a 400', async () => {
    const token = await register('carol');
    const at = { x: 0, y: 0 };

    await http()
      .post('/mind-maps')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nodes: [
          { id: 'root', parentId: null, label: 'Racine', position: at },
          { id: 'a', parentId: 'b', label: 'A', position: at },
          { id: 'b', parentId: 'a', label: 'B', position: at },
        ],
      })
      .expect(400);
  });
});
