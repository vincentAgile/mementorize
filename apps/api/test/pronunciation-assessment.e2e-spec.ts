import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  PRONUNCIATION_ASSESSOR,
  type PronunciationAssessment,
  type PronunciationAssessor,
  type Recording,
} from '../src/voice/pronunciation-assessor.js';

/** The voice layer, faked: no call to Azure in the tests (MEM-90). */
class FakeAssessor implements PronunciationAssessor {
  last: { text: string; mimeType: string; size: number } | undefined;
  async assess(recording: Recording, text: string): Promise<PronunciationAssessment> {
    this.last = { text, mimeType: recording.mimeType, size: recording.data.length };
    return {
      nothingHeard: false,
      score: 76,
      accuracy: 76,
      fluency: 100,
      completeness: 100,
      words: [{ word: 'cherish', score: 76, error: 'none', phonemes: [{ phoneme: 'tʃ', score: 52 }] }],
    };
  }
}

async function start(assessor?: PronunciationAssessor) {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (assessor) builder = builder.overrideProvider(PRONUNCIATION_ASSESSOR).useValue(assessor);
  const app = (await builder.compile()).createNestApplication<NestExpressApplication>();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  return app;
}

describe('Pronunciation assessment (e2e, MEM-90)', () => {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fake = new FakeAssessor();
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());

  async function register(name: string) {
    const res = await http()
      .post('/auth/register')
      .send({ email: `${name}-${unique}@e2e.test`, password: 'password123' })
      .expect(201);
    return { Authorization: `Bearer ${res.body.accessToken as string}` };
  }

  beforeAll(async () => {
    app = await start(fake);
  });
  afterAll(async () => {
    await app?.close();
  });

  it('assesses a recording against the English of the item, read in the database', async () => {
    const auth = await register('voice');
    const word = await http()
      .post('/vocabulary')
      .set(auth)
      .send({ word: 'to cherish', translation: 'chérir' })
      .expect(201);
    expect((await http().get('/pronunciation/assessment').set(auth).expect(200)).body).toEqual({
      enabled: true,
      maxSeconds: 10,
    });

    const audio = Buffer.alloc(4000, 7);
    const res = await http()
      .post(`/pronunciation/assess?itemId=${word.body.id}`)
      .set(auth)
      .set('Content-Type', 'audio/webm;codecs=opus')
      .send(audio)
      .expect(200);

    expect(res.body).toMatchObject({ score: 76, nothingHeard: false, words: [{ word: 'cherish', error: 'none' }] });
    expect(fake.last).toEqual({ text: 'to cherish', mimeType: 'audio/webm;codecs=opus', size: 4000 });
    const usage = await app.get(PrismaService).pronunciationUsage.findMany({
      where: { user: { email: `voice-${unique}@e2e.test` } },
    });
    expect(usage).toEqual([expect.objectContaining({ count: 1 })]);
  });

  it('refuses what is not a recording of one of the user’s vocabulary items', async () => {
    const owner = await register('owner');
    const other = await register('other');
    const word = await http()
      .post('/vocabulary')
      .set(owner)
      .send({ word: 'squirrel', translation: 'écureuil' })
      .expect(201);
    const quote = await http().post('/quotes').set(owner).send({ text: 'Carpe diem.' }).expect(201);
    const post = (itemId: string, auth?: Record<string, string>) => {
      const req = http().post(`/pronunciation/assess?itemId=${itemId}`).set('Content-Type', 'audio/webm');
      return (auth ? req.set(auth) : req).send(Buffer.alloc(100, 1));
    };

    await post(word.body.id).expect(401);
    await post(word.body.id, other).expect(404); // another user's word
    await post(quote.body.id, owner).expect(404); // a quote: no English to say
    await post('not-a-uuid', owner).expect(400);
    await http()
      .post(`/pronunciation/assess?itemId=${word.body.id}`)
      .set(owner)
      .set('Content-Type', 'application/json')
      .send({ text: 'squirrel' })
      .expect(415);
    await http()
      .post(`/pronunciation/assess?itemId=${word.body.id}`)
      .set(owner)
      .set('Content-Type', 'audio/webm')
      .send(Buffer.alloc(1024 * 1024 + 1, 1))
      .expect(413);
    await http()
      .post(`/pronunciation/assess?itemId=${word.body.id}`)
      .set(owner)
      .set('Content-Type', 'audio/webm')
      .expect(400); // empty
  });

  it('is off without a provider: not offered, 503', async () => {
    const off = await start();
    try {
      const res = await request(off.getHttpServer())
        .post('/auth/register')
        .send({ email: `off-${unique}@e2e.test`, password: 'password123' })
        .expect(201);
      const auth = { Authorization: `Bearer ${res.body.accessToken as string}` };
      const word = await request(off.getHttpServer())
        .post('/vocabulary')
        .set(auth)
        .send({ word: 'world', translation: 'monde' })
        .expect(201);
      expect(
        (await request(off.getHttpServer()).get('/pronunciation/assessment').set(auth).expect(200)).body.enabled,
      ).toBe(false);
      await request(off.getHttpServer())
        .post(`/pronunciation/assess?itemId=${word.body.id}`)
        .set(auth)
        .set('Content-Type', 'audio/webm')
        .send(Buffer.alloc(100, 1))
        .expect(503);
    } finally {
      await off.close();
    }
  });
});
