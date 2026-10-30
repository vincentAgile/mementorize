import { readFileSync } from 'node:fs';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import type { QuoteContent } from '../src/items/item-content.js';
import { ItemsService } from '../src/items/items.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/** The data migration of MEM-106, as `prisma migrate deploy` runs it. */
const MIGRATION = readFileSync(
  new URL('../prisma/migrations/20261030090000_quote_hint/migration.sql', import.meta.url),
  'utf8',
);

/**
 * MEM-106: the recall hint of the quotes. Its rules through the API, and the
 * data migration that gives one to the quotes created before it, run on
 * quotes made the old way (without hint) in this real database.
 */
describe('Quotes: recall hint (MEM-106, e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  async function register(name: string) {
    const res = await http()
      .post('/auth/register')
      .send({ email: `${name}-${unique}@e2e.test`, password: 'password123' })
      .expect(201);
    const auth = { Authorization: `Bearer ${res.body.accessToken as string}` };
    const me = await http().get('/auth/me').set(auth).expect(200);
    return { auth, userId: me.body.id as string };
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

  it('requires a hint to create a quote, not blank, 300 characters at most, and returns it trimmed', async () => {
    const { auth } = await register('hint-create');
    const text = 'La culture générale est la véritable école du commandement.';
    await http().post('/quotes').set(auth).send({ text }).expect(400);
    await http().post('/quotes').set(auth).send({ text, hint: '' }).expect(400);
    await http().post('/quotes').set(auth).send({ text, hint: '   ' }).expect(400);
    await http()
      .post('/quotes')
      .set(auth)
      .send({ text, hint: 'x'.repeat(301) })
      .expect(400);

    const created = await http()
      .post('/quotes')
      .set(auth)
      .send({ text, author: 'Général de Gaulle', hint: "  Citation relative à l'importance de la culture générale " })
      .expect(201);
    expect(created.body).toMatchObject({ text, hint: "Citation relative à l'importance de la culture générale" });
    const read = await http().get(`/quotes/${created.body.id}`).set(auth).expect(200);
    expect(read.body.hint).toBe("Citation relative à l'importance de la culture générale");
    await http()
      .post('/quotes')
      .set(auth)
      .send({ text: 'Trois cents.', hint: 'y'.repeat(300) })
      .expect(201);
  });

  it('changes the hint alone, refuses to empty it, and keeps the state and the card', async () => {
    const { auth } = await register('hint-update');
    const created = await http()
      .post('/quotes')
      .set(auth)
      .send({ text: 'Connais-toi toi-même.', author: 'Socrate', hint: 'Se connaître' })
      .expect(201);
    const { id } = created.body;

    await http().patch(`/quotes/${id}`).set(auth).send({ hint: '' }).expect(400);
    await http().patch(`/quotes/${id}`).set(auth).send({ hint: '  ' }).expect(400);
    await http()
      .patch(`/quotes/${id}`)
      .set(auth)
      .send({ hint: 'z'.repeat(301) })
      .expect(400);

    const updated = await http()
      .patch(`/quotes/${id}`)
      .set(auth)
      .send({ hint: ' La connaissance de soi ' })
      .expect(200);
    expect(updated.body).toMatchObject({
      id,
      text: 'Connais-toi toi-même.',
      author: 'Socrate',
      hint: 'La connaissance de soi',
      learningStatus: created.body.learningStatus,
      learnPosition: created.body.learnPosition,
      card: created.body.card,
    });
    // Without the hint in the request, it stays.
    const other = await http().patch(`/quotes/${id}`).set(auth).send({ author: 'Socrate (Delphes)' }).expect(200);
    expect(other.body.hint).toBe('La connaissance de soi');
  });

  it('migration 20261030090000_quote_hint: gives « Indice de rappel » to the quotes without hint, idempotent', async () => {
    const { auth, userId } = await register('hint-migration');
    const items = app.get(ItemsService);
    const now = new Date();
    // Quotes created before MEM-106: no hint at all, or an empty one.
    const old = (text: string) =>
      items.create(userId, 'Quote', { text, author: 'Ancien', source: 'Archives' } as QuoteContent, now, 'Learning');
    const without = await old('Sans indice.');
    const blank = await items.create(
      userId,
      'Quote',
      { text: 'Indice vide.', author: null, source: null, hint: '  ' },
      now,
      'Waiting',
    );
    const already = await items.create(
      userId,
      'Quote',
      { text: 'Avec indice.', author: null, source: null, hint: 'Un vrai indice' },
      now,
      'ToLearn',
    );
    const word = await items.create(
      userId,
      'Vocabulary',
      { word: 'hint', translation: 'indice', example: null },
      now,
      'ToLearn',
    );
    const before = await prisma.item.findMany({
      where: { userId },
      include: { cards: { orderBy: { kind: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });

    await prisma.$executeRawUnsafe(MIGRATION);

    const content = async (id: string) =>
      (await prisma.item.findUniqueOrThrow({ where: { id } })).content as Record<string, unknown>;
    expect(await content(without.id)).toEqual({
      text: 'Sans indice.',
      author: 'Ancien',
      source: 'Archives',
      hint: 'Indice de rappel',
    });
    expect((await content(blank.id)).hint).toBe('Indice de rappel');
    expect((await content(already.id)).hint).toBe('Un vrai indice');
    expect(await content(word.id)).not.toHaveProperty('hint');

    // The states, the queue and the cards are untouched.
    const after = await prisma.item.findMany({
      where: { userId },
      include: { cards: { orderBy: { kind: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    const kept = (list: typeof before) =>
      list.map(({ id, learningStatus, learnPosition, cards }) => ({ id, learningStatus, learnPosition, cards }));
    expect(kept(after)).toEqual(kept(before));

    // The migrated quote shows the provisional hint through the API, and gets a real one from the list…
    const migrated = await http().get(`/quotes/${without.id}`).set(auth).expect(200);
    expect(migrated.body.hint).toBe('Indice de rappel');
    await http().patch(`/quotes/${without.id}`).set(auth).send({ hint: 'Les archives anciennes' }).expect(200);

    // …which running the migration again leaves as it is.
    await prisma.$executeRawUnsafe(MIGRATION);
    expect((await content(without.id)).hint).toBe('Les archives anciennes');
    expect((await content(blank.id)).hint).toBe('Indice de rappel');
    expect((await content(already.id)).hint).toBe('Un vrai indice');
  });
});
