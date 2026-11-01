import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { dayOf } from '../src/learning/progress.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * The end of a learning session: the history of the learning states, written
 * by the database (migration 20261101200000_learning_status_history), and
 * GET /learning/progress, on a real database.
 */
describe('Learning: history of the states and progress (e2e)', () => {
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

  const history = async (itemId: string) =>
    (await prisma.learningStatusChange.findMany({ where: { itemId }, orderBy: { changedAt: 'asc' } })).map(
      (change) => change.status,
    );

  it('records each state of an item, whatever changes it: learning, « Appris », « Revoir », reset, queue', async () => {
    const auth = await register('history');
    await http().put('/preferences').set(auth).send({ usageMode: 'Advanced' }).expect(200);
    const add = async (word: string, queue = true) =>
      (await http().post('/vocabulary').set(auth).send({ word, translation: word, queue }).expect(201)).body
        .id as string;
    const word = await add('snag');
    const waiting = await add('waiting', false);

    await http().post(`/learning/${word}`).set(auth).send({ rating: 'Good' }).expect(201);
    await http().post(`/learning/${word}/learned`).set(auth).expect(201);
    await http().post(`/learning/${word}/relearn`).set(auth).expect(201);
    await http().post(`/learning/items/${word}/reset`).set(auth).expect(200);
    // A change of rank only (the queue renumbered): no row.
    await http()
      .post('/learning/queue/add')
      .set(auth)
      .send({ ids: [waiting] })
      .expect(200);

    expect(await history(word)).toEqual(['ToLearn', 'Learning', 'Learned', 'Learning', 'ToLearn']);
    expect(await history(waiting)).toEqual(['Waiting', 'ToLearn']);

    // Deleted with its item.
    await http().delete(`/vocabulary/${waiting}`).set(auth).expect(204);
    expect(await history(waiting)).toEqual([]);
  });

  it('GET /learning/progress: the next review of the space and the counts of today', async () => {
    const auth = await register('progress');
    const add = async (word: string) =>
      (await http().post('/vocabulary').set(auth).send({ word, translation: word }).expect(201)).body.id as string;
    const quote = (
      await http().post('/quotes').set(auth).send({ text: 'Une citation.', hint: 'Un indice' }).expect(201)
    ).body.id as string;

    // Nothing learned yet: no review, no day.
    expect((await http().get('/learning/progress?type=Vocabulary').set(auth).expect(200)).body).toEqual({
      nextReview: null,
      days: [],
    });

    const [a, b, c] = [await add('alpha'), await add('beta'), await add('gamma')];
    await http().post(`/learning/${a}`).set(auth).send({ rating: 'Again' }).expect(201); // back today
    await http().post(`/learning/${b}`).set(auth).send({ rating: 'Good' }).expect(201);
    await http().post(`/learning/${c}`).set(auth).send({ rating: 'Easy' }).expect(201);
    await http().post(`/learning/${c}/learned`).set(auth).expect(201);
    await http().post(`/learning/${quote}`).set(auth).send({ rating: 'Good' }).expect(201); // another space

    const { body } = await http().get('/learning/progress?type=Vocabulary').set(auth).expect(200);
    const today = dayOf(new Date());
    // « À revoir »: the card is back in a few minutes, today (or just after midnight).
    expect(body.nextReview.count).toBeGreaterThanOrEqual(1);
    expect(body.nextReview.day >= today).toBe(true);
    expect(body.days).toEqual([{ day: today, learning: 2, learned: 1 }]);

    const quotes = (await http().get('/learning/progress?type=Quote').set(auth).expect(200)).body;
    expect(quotes.days).toEqual([{ day: today, learning: 1, learned: 0 }]);
    expect(quotes.nextReview.count).toBe(1);
  });

  it('answers 400 without a valid type, 401 without a session', async () => {
    const auth = await register('progress-400');
    await http().get('/learning/progress').set(auth).expect(400);
    await http().get('/learning/progress?type=MindMap').set(auth).expect(400);
    await http().get('/learning/progress?type=Vocabulary').expect(401);
  });
});
