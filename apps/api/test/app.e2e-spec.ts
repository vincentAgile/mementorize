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

  it('saves the home space (Anglais by default) and the translation service (DeepL by default), each on its own', async () => {
    const token = await register('erin');
    const auth = { Authorization: `Bearer ${token}` };

    const initial = await http().get('/preferences').set(auth).expect(200);
    expect(initial.body).toEqual({ homeSpace: 'Vocabulary', translator: 'DeepL' });

    await http().put('/preferences').set(auth).send({ homeSpace: 'Quote' }).expect(200);
    const saved = await http().get('/preferences').set(auth).expect(200);
    expect(saved.body).toEqual({ homeSpace: 'Quote', translator: 'DeepL' });

    // MEM-44: the translator alone, the home space untouched.
    const translator = await http().put('/preferences').set(auth).send({ translator: 'Google' }).expect(200);
    expect(translator.body).toEqual({ homeSpace: 'Quote', translator: 'Google' });

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
