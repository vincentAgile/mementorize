import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';

/**
 * End-to-end: the whole Nest application, on a real PostgreSQL database
 * whose schema is up to date (in the CI: a service container, migrated with
 * `prisma migrate deploy` before the tests). Each run registers new,
 * unique users, so it doesn't depend on what's already in the database.
 */
describe('API (e2e)', () => {
  let app: INestApplication;
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
    app = moduleRef.createNestApplication();
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

  it("creates an item with its review card, and keeps it out of other users' reach", async () => {
    const alice = await register('alice2');
    const bob = await register('bob');

    const created = await http()
      .post('/quotes')
      .set('Authorization', `Bearer ${alice}`)
      .send({ text: 'Connais-toi toi-même.', author: 'Socrate' })
      .expect(201);
    expect(created.body.card).toMatchObject({ state: 'New' });

    const due = await http().get('/reviews/due').set('Authorization', `Bearer ${alice}`).expect(200);
    expect(due.body.items.map((d: { item: { id: string } }) => d.item.id)).toContain(created.body.id);

    await http().get(`/quotes/${created.body.id}`).set('Authorization', `Bearer ${bob}`).expect(404);
    const bobItems = await http().get('/items').set('Authorization', `Bearer ${bob}`).expect(200);
    expect(bobItems.body).toEqual([]);
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
