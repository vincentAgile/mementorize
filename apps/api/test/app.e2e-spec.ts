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
    const dueQuotes = await http().get('/reviews/due?type=Quote').set('Authorization', `Bearer ${alice}`).expect(200);
    expect(dueQuotes.body.total).toBe(due.body.total);
    const dueWords = await http()
      .get('/reviews/due?type=Vocabulary')
      .set('Authorization', `Bearer ${alice}`)
      .expect(200);
    expect(dueWords.body.total).toBe(0);
    await http().get('/reviews/due?type=Nope').set('Authorization', `Bearer ${alice}`).expect(400);
    const summary = await http().get('/reviews/due/summary').set('Authorization', `Bearer ${alice}`).expect(200);
    expect(summary.body).toEqual({
      total: due.body.total,
      byType: { Quote: due.body.total, Vocabulary: 0, MindMap: 0 },
    });

    await http().get(`/quotes/${created.body.id}`).set('Authorization', `Bearer ${bob}`).expect(404);
    const bobItems = await http().get('/items').set('Authorization', `Bearer ${bob}`).expect(200);
    expect(bobItems.body).toEqual([]);
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

  it('saves the home space, Anglais by default, and validates it', async () => {
    const token = await register('erin');
    const auth = { Authorization: `Bearer ${token}` };

    const initial = await http().get('/preferences').set(auth).expect(200);
    expect(initial.body).toEqual({ homeSpace: 'Vocabulary' });

    await http().put('/preferences').set(auth).send({ homeSpace: 'Quote' }).expect(200);
    const saved = await http().get('/preferences').set(auth).expect(200);
    expect(saved.body).toEqual({ homeSpace: 'Quote' });

    await http().put('/preferences').set(auth).send({ homeSpace: 'Nope' }).expect(400);
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
