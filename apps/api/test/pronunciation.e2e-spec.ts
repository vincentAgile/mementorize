import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * End-to-end (MEM-39): the API, a real database, and a fake Kokoro server
 * standing in for the real one (same endpoint, same body). Its "audio" says
 * which text and voice it was asked for, so the test can check what is
 * served.
 */
describe('Pronunciation (e2e)', () => {
  let app: INestApplication;
  let kokoro: Server;
  const asked: { input: string; voice: string; response_format: string }[] = [];
  const http = () => request(app.getHttpServer());
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  async function register(name: string): Promise<string> {
    const res = await http()
      .post('/auth/register')
      .send({ email: `${name}-${unique}@e2e.test`, password: 'password123' })
      .expect(201);
    return res.body.accessToken as string;
  }

  const audio = (token: string, id: string) =>
    http()
      .get(`/vocabulary/${id}/pronunciation`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });

  beforeAll(async () => {
    kokoro = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        if (req.method !== 'POST' || req.url !== '/v1/audio/speech') {
          res.writeHead(404).end();
          return;
        }
        const json = JSON.parse(body);
        asked.push(json);
        res.writeHead(200, { 'Content-Type': 'audio/mpeg' }).end(`MP3:${json.voice}:${json.input}`);
      });
    });
    await new Promise<void>((resolve) => kokoro.listen(0, '127.0.0.1', resolve));
    vi.stubEnv('KOKORO_URL', `http://127.0.0.1:${(kokoro.address() as AddressInfo).port}`);
    vi.stubEnv('KOKORO_VOICE', 'af_heart');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await new Promise((resolve) => kokoro?.close(resolve));
    vi.unstubAllEnvs();
  });

  it('generates the audio of a new word in the background, serves it to its owner only, and follows edits and deletion', async () => {
    const alice = await register('pron-alice');
    const bob = await register('pron-bob');

    const created = await http()
      .post('/vocabulary')
      .set('Authorization', `Bearer ${alice}`)
      .send({ word: 'to take for granted', translation: 'considérer comme acquis' })
      .expect(201);
    const id = created.body.id as string;

    // Generated in the background: the creation didn't wait for it.
    await vi.waitFor(
      async () => {
        const res = await audio(alice, id);
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('audio/mpeg');
        expect(res.headers['cache-control']).toBe('private, no-store');
        expect((res.body as Buffer).toString()).toBe('MP3:af_heart:to take for granted');
      },
      { timeout: 5_000, interval: 100 },
    );
    expect(asked).toContainEqual(
      expect.objectContaining({ input: 'to take for granted', voice: 'af_heart', response_format: 'mp3' }),
    );

    // Someone else's item: as if it didn't exist.
    await audio(bob, id).expect(404);

    // New English: the former audio is never served, the new one follows.
    await http()
      .patch(`/vocabulary/${id}`)
      .set('Authorization', `Bearer ${alice}`)
      .send({ word: 'to take something for granted' })
      .expect(200);
    await vi.waitFor(
      async () => {
        const res = await audio(alice, id);
        expect(res.status).toBe(200);
        expect((res.body as Buffer).toString()).toBe('MP3:af_heart:to take something for granted');
      },
      { timeout: 5_000, interval: 100 },
    );

    // Only the French changes: no new audio.
    const before = asked.length;
    await http()
      .patch(`/vocabulary/${id}`)
      .set('Authorization', `Bearer ${alice}`)
      .send({ translation: 'tenir pour acquis' })
      .expect(200);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(asked.length).toBe(before);

    // Deleting the item deletes its audio.
    await http().delete(`/vocabulary/${id}`).set('Authorization', `Bearer ${alice}`).expect(204);
    await expect(app.get(PrismaService).pronunciation.count({ where: { itemId: id } })).resolves.toBe(0);
  });

  it('answers 404 for an unknown item, and 401 without a session', async () => {
    const alice = await register('pron-alice2');
    await audio(alice, '00000000-0000-0000-0000-000000000000').expect(404);
    await http().get('/vocabulary/anything/pronunciation').expect(401);
  });
});
