import { randomUUID } from 'node:crypto';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { run } from '../src/admin/admin-cli.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * MEM-116, end-to-end: the predefined lists of the console (« Catalogue »),
 * on a real database, with an administration session (password only, the
 * two-step login turned off: MEM-88).
 */
describe('Console: predefined lists (MEM-116, e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `catalog-${unique}@e2e.test`;
  const password = 'a long admin password';
  let admin: { Authorization: string };
  const created: string[] = [];

  /** A list, made through the API; deleted at the end. */
  async function newList(body: Record<string, unknown>) {
    const res = await http().post('/admin/catalog/lists').set(admin).send(body).expect(201);
    created.push(res.body.id);
    return res.body as { id: string; title: string; level: string; published: boolean; entries: number };
  }

  beforeAll(async () => {
    process.env.ADMIN_JWT_SECRET = 'e2e-admin-secret';
    process.env.ADMIN_TOTP_ENCRYPTION_KEY = 'e2e0'.repeat(16);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true })); // as in main.ts
    await app.init();
    prisma = app.get(PrismaService);

    await run(['create', email], prisma, async () => password);
    await prisma.adminAccount.update({ where: { email }, data: { totpDisabledAt: new Date() } });
    const login = await http().post('/admin/auth/login').send({ email, password }).expect(200);
    expect(login.body.step).toBe('session');
    admin = { Authorization: `Bearer ${login.body.session.accessToken as string}` };
  });

  afterAll(async () => {
    await prisma?.predefinedList.deleteMany({ where: { id: { in: created } } });
    await prisma?.adminAccount.deleteMany({ where: { email } });
    await app?.close();
  });

  it('creates a list, a draft, trimmed, and lists them by level then by title, with their words', async () => {
    const b1 = await newList({ title: `  Voyage ${unique} `, level: 'B1', description: ' À l’aéroport ' });
    expect(b1).toMatchObject({
      title: `Voyage ${unique}`,
      description: 'À l’aéroport',
      level: 'B1',
      published: false,
      entries: 0,
    });
    const a2 = await newList({ title: `Zoo ${unique}`, level: 'A2', description: '' });
    expect(a2).toMatchObject({ description: null });
    const a2b = await newList({ title: `Animaux ${unique}`, level: 'A2' });

    const lists = (await http().get('/admin/catalog/lists').set(admin).expect(200)).body as { id: string }[];
    const mine = lists.map((list) => list.id).filter((id) => [b1.id, a2.id, a2b.id].includes(id));
    expect(mine).toEqual([a2b.id, a2.id, b1.id]); // A2 « Animaux », A2 « Zoo », B1
    expect((await http().get(`/admin/catalog/lists/${b1.id}`).set(admin).expect(200)).body.title).toBe(
      `Voyage ${unique}`,
    );
  });

  it('refuses an empty title, an unknown level (400) and a title taken in the same level, whatever its case (409)', async () => {
    await http().post('/admin/catalog/lists').set(admin).send({ title: '   ', level: 'A1' }).expect(400);
    await http().post('/admin/catalog/lists').set(admin).send({ title: 'Sans niveau' }).expect(400);
    await http().post('/admin/catalog/lists').set(admin).send({ title: 'Niveau', level: 'D1' }).expect(400);
    await http()
      .post('/admin/catalog/lists')
      .set(admin)
      .send({ title: 'x'.repeat(201), level: 'A1' })
      .expect(400);

    const list = await newList({ title: `Cuisine ${unique}`, level: 'A1' });
    const taken = await http()
      .post('/admin/catalog/lists')
      .set(admin)
      .send({ title: ` CUISINE ${unique}`, level: 'A1' })
      .expect(409);
    expect(taken.body.message).toBe('Une liste de ce niveau porte déjà ce titre');
    // The same title in another level: allowed.
    const b2 = await newList({ title: `cuisine ${unique}`, level: 'B2' });
    expect(b2).toMatchObject({ title: `cuisine ${unique}`, level: 'B2' });

    const other = await newList({ title: `Cuisine bis ${unique}`, level: 'A1' });
    await http()
      .patch(`/admin/catalog/lists/${other.id}`)
      .set(admin)
      .send({ title: `cuisine ${unique}` })
      .expect(409);
    // Moved to a level where the title is taken: refused too; to a free one: allowed.
    await http().patch(`/admin/catalog/lists/${b2.id}`).set(admin).send({ level: 'A1' }).expect(409);
    await http().patch(`/admin/catalog/lists/${b2.id}`).set(admin).send({ level: 'C1' }).expect(200);
    // Its own title, in another case: allowed.
    await http()
      .patch(`/admin/catalog/lists/${list.id}`)
      .set(admin)
      .send({ title: `CUISINE ${unique}` })
      .expect(200);
  });

  it('refuses to publish a list without any word (409); with words, published, then unpublished', async () => {
    const list = await newList({ title: `Travail ${unique}`, level: 'B2' });
    const refused = await http()
      .patch(`/admin/catalog/lists/${list.id}`)
      .set(admin)
      .send({ published: true })
      .expect(409);
    expect(refused.body.message).toBe('Une liste vide ne peut pas être publiée');
    await http()
      .post('/admin/catalog/lists')
      .set(admin)
      .send({ title: `Publiée d’emblée ${unique}`, level: 'A1', published: true })
      .expect(409);

    await prisma.predefinedEntry.create({
      data: { listId: list.id, position: 1, french: 'une réunion', english: 'a meeting' },
    });
    const published = await http()
      .patch(`/admin/catalog/lists/${list.id}`)
      .set(admin)
      .send({ published: true })
      .expect(200);
    expect(published.body).toMatchObject({ published: true, entries: 1 });
    await http().patch(`/admin/catalog/lists/${list.id}`).set(admin).send({ published: false }).expect(200);
  });

  it('deletes a list and its words, never the items of the users', async () => {
    const list = await newList({ title: `Météo ${unique}`, level: 'A1' });
    await prisma.predefinedEntry.createMany({
      data: [
        { listId: list.id, position: 1, french: 'la pluie', english: 'the rain' },
        { listId: list.id, position: 2, french: 'le vent', english: 'the wind' },
      ],
    });
    // A user who has the same words in their vocabulary (copies, MEM-115).
    const user = await http()
      .post('/auth/register')
      .send({ email: `catalog-user-${unique}@e2e.test`, password: 'password123' })
      .expect(201);
    const auth = { Authorization: `Bearer ${user.body.accessToken as string}` };
    const word = (
      await http().post('/vocabulary').set(auth).send({ word: 'the rain', translation: 'la pluie' }).expect(201)
    ).body.id as string;

    const deleted = await http().delete(`/admin/catalog/lists/${list.id}`).set(admin).expect(200);
    expect(deleted.body).toEqual({ id: list.id, entries: 2 });
    expect(await prisma.predefinedEntry.count({ where: { listId: list.id } })).toBe(0);
    await http().get(`/admin/catalog/lists/${list.id}`).set(admin).expect(404);
    expect((await http().get(`/vocabulary/${word}`).set(auth).expect(200)).body.word).toBe('the rain');
    await http().delete(`/admin/catalog/lists/${randomUUID()}`).set(admin).expect(404);
  });

  it('is the console only: 401 without a token or with a user token', async () => {
    const user = await http()
      .post('/auth/register')
      .send({ email: `catalog-intruder-${unique}@e2e.test`, password: 'password123' })
      .expect(201);
    const auth = { Authorization: `Bearer ${user.body.accessToken as string}` };
    await http().get('/admin/catalog/lists').expect(401);
    await http().get('/admin/catalog/lists').set(auth).expect(401);
    await http().post('/admin/catalog/lists').set(auth).send({ title: 'Intrus', level: 'A1' }).expect(401);
    expect(await prisma.predefinedList.count({ where: { title: 'Intrus' } })).toBe(0);
  });
});
