import { randomUUID } from 'node:crypto';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * MEM-111: resetting the learning of an item, in the Advanced mode of use
 * (MEM-110) only. On a real database: the state, the queue, the cards and
 * the history after the reset, from each of the four states.
 */
describe('Learning: reset an item (MEM-111, e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  async function register(name: string) {
    const res = await http()
      .post('/auth/register')
      .send({ email: `${name}-${unique}@e2e.test`, password: 'password123' })
      .expect(201);
    return { Authorization: `Bearer ${res.body.accessToken as string}` };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true })); // as in main.ts
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app?.close();
  });

  /** The item, its cards (by kind) and their history, as in the database. */
  const read = async (id: string) =>
    prisma.item.findUniqueOrThrow({
      where: { id },
      include: { cards: { orderBy: { kind: 'asc' }, include: { _count: { select: { reviewLogs: true } } } } },
    });

  /** The learning queue of a space, by position. */
  const queue = async (auth: Record<string, string>, type: 'Vocabulary' | 'Quote') => {
    const items = (await http().get(`/items?type=${type}`).set(auth).expect(200)).body as {
      id: string;
      learningStatus: string;
      learnPosition: number | null;
    }[];
    return items
      .filter((item) => item.learningStatus === 'ToLearn')
      .sort((a, b) => a.learnPosition! - b.learnPosition!)
      .map((item) => [item.id, item.learnPosition]);
  };

  it('is refused in the Standard mode of use (403), checked by the API', async () => {
    const auth = await register('reset-standard');
    const word = (await http().post('/vocabulary').set(auth).send({ word: 'snag', translation: 'accroc' }).expect(201))
      .body;
    await http().post(`/learning/items/${word.id}/reset`).set(auth).expect(403);
    expect((await read(word.id)).learningStatus).toBe('ToLearn');
    await http().post(`/learning/items/${word.id}/reset`).expect(401);
  });

  it('starts a word again from each state: "À apprendre" last, cards from scratch, history kept', async () => {
    const auth = await register('reset-states');
    await http().put('/preferences').set(auth).send({ usageMode: 'Advanced' }).expect(200);
    const add = async (word: string, queue = true) =>
      (await http().post('/vocabulary').set(auth).send({ word, translation: word, queue }).expect(201)).body
        .id as string;
    const toLearn = [await add('one'), await add('two'), await add('three')];
    const waiting = await add('waiting', false);
    const learning = await add('learning');
    const learned = await add('learned');

    // "En cours d'apprentissage": learned, then reviewed once; "Appris": learned then « Appris ».
    await http().post(`/learning/${learning}`).set(auth).send({ rating: 'Good' }).expect(201);
    const reviewedCard = (await read(learning)).cards.find((card) => card.kind === 'FrenchToEnglish')!;
    await http().post(`/reviews/${reviewedCard.id}`).set(auth).send({ rating: 'Hard' }).expect(201);
    await http().post(`/learning/${learned}`).set(auth).send({ rating: 'Easy' }).expect(201);
    await http().post(`/learning/${learned}/learned`).set(auth).expect(201);
    expect(await queue(auth, 'Vocabulary')).toEqual([
      [toLearn[0], 1],
      [toLearn[1], 2],
      [toLearn[2], 3],
    ]);
    const historyBefore = (await read(learning)).cards.map((card) => card._count.reviewLogs);
    const contentBefore = (await read(learning)).content;
    expect(historyBefore.reduce((a, b) => a + b)).toBeGreaterThan(0);
    const summaryBefore = (await http().get('/reviews/due/summary').set(auth).expect(200)).body;

    // From "En cours d'apprentissage": last of the queue, cards from scratch, history kept.
    const before = Date.now();
    const reset = await http().post(`/learning/items/${learning}/reset`).set(auth).expect(200);
    expect(reset.body).toEqual({ id: learning, learningStatus: 'ToLearn', learnPosition: 4 });
    const after = await read(learning);
    expect(after.learningStatus).toBe('ToLearn');
    expect(after.cards).toHaveLength(2);
    for (const card of after.cards) {
      expect(card).toMatchObject({
        state: 'New',
        stability: 0,
        difficulty: 0,
        scheduledDays: 0,
        learningSteps: 0,
        reps: 0,
        lapses: 0,
        lastReview: null,
        learnedAt: null,
      });
      expect(card.due.getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(card.due.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    }
    expect(after.cards.map((card) => card._count.reviewLogs)).toEqual(historyBefore);
    expect(after.content).toEqual(contentBefore);

    // Out of the review until learned again; in « Apprendre » at its rank.
    const summaryAfter = (await http().get('/reviews/due/summary').set(auth).expect(200)).body;
    expect(summaryAfter.byType.Vocabulary).toBeLessThanOrEqual(summaryBefore.byType.Vocabulary);
    const due = (await http().get('/reviews/due?limit=100').set(auth).expect(200)).body;
    expect(due.items.map((next: { item: { id: string } }) => next.item.id)).not.toContain(learning);
    const session = (await http().get('/learning/session?limit=10').set(auth).expect(200)).body;
    expect(session.items.map((item: { id: string }) => item.id)).toEqual([...toLearn, learning]);

    // From "Appris", "En attente", and from the queue itself: out of it, then back last, no gap.
    await http().post(`/learning/items/${learned}/reset`).set(auth).expect(200);
    await http().post(`/learning/items/${waiting}/reset`).set(auth).expect(200);
    const again = await http().post(`/learning/items/${toLearn[0]}/reset`).set(auth).expect(200);
    expect(again.body.learnPosition).toBe(6); // out of the queue, then back last: no gap, no duplicate
    expect(await queue(auth, 'Vocabulary')).toEqual([
      [toLearn[1], 1],
      [toLearn[2], 2],
      [learning, 3],
      [learned, 4],
      [waiting, 5],
      [toLearn[0], 6],
    ]);
    // The learned one: its history (the first rating, « Appris ») kept, cards new.
    const learnedAfter = await read(learned);
    expect(learnedAfter.learningStatus).toBe('ToLearn');
    expect(learnedAfter.cards.every((card) => card.state === 'New' && card.reps === 0)).toBe(true);
    expect(learnedAfter.cards.reduce((sum, card) => sum + card._count.reviewLogs, 0)).toBeGreaterThan(0);
  });

  it('resets a quote (one card) in its own queue, the vocabulary queue untouched', async () => {
    const auth = await register('reset-quote');
    await http().put('/preferences').set(auth).send({ usageMode: 'Advanced' }).expect(200);
    const word = (await http().post('/vocabulary').set(auth).send({ word: 'snag', translation: 'accroc' }).expect(201))
      .body.id;
    const quote = async (text: string) =>
      (
        await http()
          .post('/quotes')
          .set(auth)
          .send({ text, hint: `Indice de ${text}` })
          .expect(201)
      ).body.id as string;
    const [first, second] = [await quote('Première.'), await quote('Seconde.')];
    await http().post(`/learning/${first}`).set(auth).send({ rating: 'Good' }).expect(201);

    const reset = await http().post(`/learning/items/${first}/reset`).set(auth).expect(200);
    expect(reset.body).toEqual({ id: first, learningStatus: 'ToLearn', learnPosition: 2 });
    const after = await read(first);
    expect(after.cards).toHaveLength(1);
    expect(after.cards[0]).toMatchObject({ kind: 'QuoteRecall', state: 'New', reps: 0 });
    expect(after.cards[0]._count.reviewLogs).toBe(1);
    expect(after.content).toMatchObject({ text: 'Première.', hint: 'Indice de Première.' });
    expect(await queue(auth, 'Quote')).toEqual([
      [second, 1],
      [first, 2],
    ]);
    expect(await queue(auth, 'Vocabulary')).toEqual([[word, 1]]);
  });

  it('answers 404 for another user’s item, a mind map or an unknown id', async () => {
    const auth = await register('reset-404');
    const other = await register('reset-other');
    await http().put('/preferences').set(auth).send({ usageMode: 'Advanced' }).expect(200);
    const theirs = (
      await http().post('/vocabulary').set(other).send({ word: 'theirs', translation: 'à eux' }).expect(201)
    ).body.id;
    const map = (
      await http()
        .post('/mind-maps')
        .set(auth)
        .send({
          nodes: [
            { id: 'r', parentId: null, label: 'Mémoire', position: { x: 0, y: 0 } },
            { id: 'a', parentId: 'r', label: 'Répétition', position: { x: 100, y: 0 } },
          ],
        })
        .expect(201)
    ).body.id;

    await http().post(`/learning/items/${theirs}/reset`).set(auth).expect(404);
    await http().post(`/learning/items/${map}/reset`).set(auth).expect(404);
    await http().post(`/learning/items/${randomUUID()}/reset`).set(auth).expect(404);
    expect((await read(theirs)).learningStatus).toBe('ToLearn');
  });
});
