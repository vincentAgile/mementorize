import { randomUUID } from 'node:crypto';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * MEM-118, end-to-end: the predefined lists of the Anglais space, for the
 * users: the published ones only, their words « already there » or not, and
 * their addition to the vocabulary, on a real database.
 */
describe('Anglais: the predefined lists (MEM-118, e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const lists: string[] = [];
  let auth: { Authorization: string };

  /** A list and its words, straight in the database (the console makes them: MEM-116, MEM-117). */
  async function newList(
    title: string,
    level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2',
    words: [string, string, string?][],
    published = true,
  ) {
    const list = await prisma.predefinedList.create({
      data: {
        title: `${title} ${unique}`,
        level,
        published,
        entries: {
          create: words.map(([english, french, topic], i) => ({
            position: i + 1,
            english,
            french,
            topic: topic ?? null,
            englishExample: topic ? `An example of ${english}.` : null,
          })),
        },
      },
      include: { entries: { orderBy: { position: 'asc' } } },
    });
    lists.push(list.id);
    return list;
  }

  async function register(name: string) {
    const res = await http()
      .post('/auth/register')
      .send({ email: `catalog-${name}-${unique}@e2e.test`, password: 'password123' })
      .expect(201);
    return { Authorization: `Bearer ${res.body.accessToken as string}` };
  }

  const vocabulary = async (as = auth) =>
    (await http().get('/vocabulary').set(as).expect(200)).body as {
      word: string;
      translation: string;
      example: string | null;
      topic: string | null;
      learningStatus: string;
      learnPosition: number | null;
      createdAt: string;
      cards: unknown[];
    }[];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true })); // as in main.ts
    await app.init();
    prisma = app.get(PrismaService);
    auth = await register('user');
  });

  afterAll(async () => {
    await prisma?.$executeRawUnsafe('DROP TRIGGER IF EXISTS e2e_catalog_boom ON "items"');
    await prisma?.$executeRawUnsafe('DROP FUNCTION IF EXISTS e2e_catalog_boom()');
    await prisma?.predefinedList.deleteMany({ where: { id: { in: lists } } });
    await app?.close();
  });

  it('shows the published lists only, by level then title, with their words and those already there', async () => {
    const b1 = await newList('Voyage', 'B1', [
      ['a ticket', 'un billet'],
      ['a platform', 'un quai'],
    ]);
    const a2 = await newList('Zoo', 'A2', [['a lion', 'un lion']]);
    const a2b = await newList('Animaux', 'A2', [
      ['a cat', 'un chat'],
      ['a dog', 'un chien'],
    ]);
    const draft = await newList('Brouillon', 'A2', [['a draft', 'un brouillon']], false);
    await http().post('/vocabulary').set(auth).send({ word: '  A Ticket ', translation: 'un ticket' }).expect(201);

    const all = (await http().get('/catalog/lists').set(auth).expect(200)).body as { id: string }[];
    const mine = all.filter((list) => lists.includes(list.id));
    expect(mine.map((list) => list.id)).toEqual([a2b.id, a2.id, b1.id]);
    expect(mine.find((list) => list.id === b1.id)).toEqual({
      id: b1.id,
      title: `Voyage ${unique}`,
      description: null,
      level: 'B1',
      entries: 2,
      owned: 1,
    });
    expect(mine.some((list) => list.id === draft.id)).toBe(false);

    const a2Only = (await http().get('/catalog/lists?level=A2').set(auth).expect(200)).body as { level: string }[];
    expect(new Set(a2Only.map((list) => list.level))).toEqual(new Set(['A2']));
    await http().get('/catalog/lists?level=D1').set(auth).expect(400);

    const detail = await http().get(`/catalog/lists/${b1.id}`).set(auth).expect(200);
    expect(
      detail.body.entries.map((entry: { english: string; owned: boolean }) => [entry.english, entry.owned]),
    ).toEqual([
      ['a ticket', true],
      ['a platform', false],
    ]);
    await http().get(`/catalog/lists/${draft.id}`).set(auth).expect(404);
    await http().get(`/catalog/lists/${randomUUID()}`).set(auth).expect(404);
  });

  it('adds copies, in the order of the list, at the end of the learning queue, with their topic and examples', async () => {
    const user = await register('queue');
    await http().post('/vocabulary').set(user).send({ word: 'already', translation: 'déjà' }).expect(201);
    const list = await newList('Cuisine', 'A1', [
      ['a pan', 'une poêle', 'Ustensiles'],
      ['a pot', 'une casserole'],
      ['a knife', 'un couteau', 'Ustensiles'],
    ]);
    const res = await http()
      .post(`/catalog/lists/${list.id}/add`)
      .set(user)
      .send({ entryIds: list.entries.map((entry) => entry.id) })
      .expect(200);
    expect(res.body).toEqual({ added: 3, skipped: 0 });

    const words = (await vocabulary(user)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    expect(words.map((word) => [word.word, word.learningStatus, word.learnPosition])).toEqual([
      ['already', 'ToLearn', 1],
      ['a pan', 'ToLearn', 2],
      ['a pot', 'ToLearn', 3],
      ['a knife', 'ToLearn', 4],
    ]);
    expect(words[1]).toMatchObject({ translation: 'une poêle', topic: 'Ustensiles', example: 'An example of a pan.' });
    expect(words[1].cards).toHaveLength(2);

    // Copies: changing or deleting the list changes nothing.
    await prisma.predefinedEntry.update({ where: { id: list.entries[0].id }, data: { english: 'a frying pan' } });
    await prisma.predefinedList.delete({ where: { id: list.id } });
    expect((await vocabulary(user)).map((word) => word.word)).toContain('a pan');
  });

  it('« En attente » without the queue; skips the words already there, even added meanwhile', async () => {
    const user = await register('waiting');
    const list = await newList('Météo', 'A2', [
      ['the rain', 'la pluie'],
      ['the wind', 'le vent'],
      ['the snow', 'la neige'],
    ]);
    // Added in another tab between the display and the click.
    await http().post('/vocabulary').set(user).send({ word: 'THE WIND', translation: 'le vent' }).expect(201);
    const res = await http()
      .post(`/catalog/lists/${list.id}/add`)
      .set(user)
      .send({ entryIds: list.entries.map((entry) => entry.id), queue: false })
      .expect(200);
    expect(res.body).toEqual({ added: 2, skipped: 1 });
    const words = await vocabulary(user);
    expect(words.filter((word) => word.word.toLowerCase() === 'the wind')).toHaveLength(1);
    expect(words.find((word) => word.word === 'the rain')).toMatchObject({
      learningStatus: 'Waiting',
      learnPosition: null,
    });

    const again = await http()
      .post(`/catalog/lists/${list.id}/add`)
      .set(user)
      .send({ entryIds: [list.entries[0].id] })
      .expect(200);
    expect(again.body).toEqual({ added: 0, skipped: 1 });
  });

  it('refuses a word of another list (400), a draft (404), an empty choice (400)', async () => {
    const list = await newList('Couleurs', 'A1', [['red', 'rouge']]);
    const other = await newList('Chiffres', 'A1', [['one', 'un']]);
    const draft = await newList('Caché', 'A1', [['hidden', 'caché']], false);
    await http()
      .post(`/catalog/lists/${list.id}/add`)
      .set(auth)
      .send({ entryIds: [list.entries[0].id, other.entries[0].id] })
      .expect(400);
    await http()
      .post(`/catalog/lists/${draft.id}/add`)
      .set(auth)
      .send({ entryIds: [draft.entries[0].id] })
      .expect(404);
    await http().post(`/catalog/lists/${list.id}/add`).set(auth).send({ entryIds: [] }).expect(400);
    expect((await vocabulary()).some((word) => word.word === 'red')).toBe(false);
  });

  it('all or none: when a word can’t be saved, none is', async () => {
    const user = await register('atomic');
    const list = await newList('Fragile', 'B2', [
      ['first', 'premier'],
      ['boom', 'explose'],
      ['third', 'troisième'],
    ]);
    // A failure in the middle of the saving, from the database itself.
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION e2e_catalog_boom() RETURNS trigger AS $$
      BEGIN
        IF NEW.content->>'word' = 'boom' THEN RAISE EXCEPTION 'e2e failure'; END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(
      'CREATE TRIGGER e2e_catalog_boom BEFORE INSERT ON "items" FOR EACH ROW EXECUTE FUNCTION e2e_catalog_boom()',
    );
    try {
      await http()
        .post(`/catalog/lists/${list.id}/add`)
        .set(user)
        .send({ entryIds: list.entries.map((entry) => entry.id) })
        .expect(500);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER e2e_catalog_boom ON "items"');
      await prisma.$executeRawUnsafe('DROP FUNCTION e2e_catalog_boom()');
    }
    expect(await vocabulary(user)).toEqual([]);
  });

  it('needs a user session: 401 without a token', async () => {
    await http().get('/catalog/lists').expect(401);
  });
});
