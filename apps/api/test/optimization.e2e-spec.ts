import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { ReviewRating } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { MIN_REVIEWS } from '../src/optimization/optimization.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * MEM-76, end-to-end: the optimization of the FSRS weights on a real history,
 * with the official optimizer (its native module) and a real database.
 */
describe('Optimization of the FSRS weights (e2e)', () => {
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

  /** A plausible history: `cards` quotes reviewed `reviews` times each, intervals growing, a few lapses. */
  async function history(auth: Record<string, string>, cards: number, reviews: number) {
    let seed = 42;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const start = new Date('2025-01-01T08:00:00Z').getTime();
    for (let index = 0; index < cards; index++) {
      const quote = await http()
        .post('/quotes')
        .set(auth)
        .send({ text: `Citation ${index}`, hint: `Indice ${index}` })
        .expect(201);
      const cardId = quote.body.card.id as string;
      let day = index % 7;
      let interval = 1;
      const logs = [];
      for (let review = 0; review < reviews; review++) {
        const roll = random();
        const rating: ReviewRating = roll < 0.12 ? 'Again' : roll < 0.25 ? 'Hard' : roll < 0.9 ? 'Good' : 'Easy';
        logs.push({
          cardId,
          rating,
          state: review === 0 ? ('New' as const) : ('Review' as const),
          due: new Date(start + day * 86_400_000),
          stability: interval,
          difficulty: 5,
          scheduledDays: interval,
          learningSteps: 0,
          reviewedAt: new Date(start + day * 86_400_000),
        });
        const growth: Record<string, number> = { Again: 0, Hard: 1.2, Good: 2.5, Easy: 3.5 };
        interval = rating === 'Again' ? 1 : Math.min(365, Math.round(interval * growth[rating]));
        day += interval;
      }
      await prisma.reviewLog.createMany({ data: logs });
    }
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('refuses to optimize a space with too few reviews, and says how many there are', async () => {
    const auth = await register('opt-few');
    const status = await http().get('/optimization').set(auth).expect(200);
    expect(status.body).toHaveLength(3);
    expect(status.body.find((space: { type: string }) => space.type === 'Quote')).toEqual({
      type: 'Quote',
      reviewCount: 0,
      minReviews: MIN_REVIEWS,
      custom: false,
      optimizedAt: null,
      status: null,
      finishedAt: null,
      error: null,
    });
    await http().post('/optimization/Quote').set(auth).expect(409);
    await http().post('/optimization/Nope').set(auth).expect(400);
    await http().post('/optimization/Quote/reset').set(auth).expect(200);
    await http().get('/optimization').expect(401);
  });

  it('optimizes the weights of a space on its history, in the background, then back to the defaults', async () => {
    const auth = await register('opt-many');
    await history(auth, 50, 22); // 1100 graded reviews
    // « Appris » is not a grade: not counted, not learned from.
    const learned = await prisma.reviewLog.findFirstOrThrow({
      where: { card: { item: { user: { email: `opt-many-${unique}@e2e.test` } } } },
    });
    await prisma.reviewLog.create({ data: { ...learned, id: undefined, rating: 'Learned' } });

    const started = await http().post('/optimization/Quote').set(auth).expect(202);
    expect(started.body).toMatchObject({ type: 'Quote', reviewCount: 1100, status: 'Running', custom: false });
    await http().post('/optimization/Quote').set(auth).expect(409); // one at a time

    let quote = started.body;
    for (let attempt = 0; attempt < 100 && quote.status === 'Running'; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const status = await http().get('/optimization').set(auth).expect(200);
      quote = status.body.find((space: { type: string }) => space.type === 'Quote');
    }
    expect(quote).toMatchObject({ status: 'Succeeded', custom: true, error: null });
    expect(quote.optimizedAt).toEqual(expect.any(String));

    const stored = await prisma.fsrsParameters.findMany({ where: { user: { email: `opt-many-${unique}@e2e.test` } } });
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ type: 'Quote', reviewCount: 1100 });
    expect(stored[0].weights).toHaveLength(21);

    // The other spaces keep the default weights.
    const vocabulary = (await http().get('/optimization').set(auth).expect(200)).body.find(
      (space: { type: string }) => space.type === 'Vocabulary',
    );
    expect(vocabulary).toMatchObject({ custom: false, reviewCount: 0 });

    const reset = await http().post('/optimization/Quote/reset').set(auth).expect(200);
    expect(reset.body).toMatchObject({ type: 'Quote', custom: false, optimizedAt: null, status: null });
  });
});
