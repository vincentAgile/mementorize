import { randomUUID } from 'node:crypto';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { run } from '../src/admin/admin-cli.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const HEADER = 'Expression française;Expression anglaise;Thématique;Phrase exemple français;Phrase exemple anglais\r\n';

/**
 * MEM-117, end-to-end: the words of a predefined list of the console,
 * entered one by one, imported from a CSV file and exported, on a real
 * database, with an administration session (password only: MEM-88).
 */
describe('Console: the words of a predefined list (MEM-117, e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `catalog-entries-${unique}@e2e.test`;
  const password = 'a long admin password';
  let admin: { Authorization: string };
  const created: string[] = [];

  async function newList(title: string) {
    const res = await http()
      .post('/admin/catalog/lists')
      .set(admin)
      .send({ title: `${title} ${unique}`, level: 'A2' })
      .expect(201);
    created.push(res.body.id);
    return res.body.id as string;
  }
  const words = async (listId: string) =>
    (await http().get(`/admin/catalog/lists/${listId}/entries`).set(admin).expect(200)).body as {
      id: string;
      position: number;
      french: string;
      english: string;
      topic: string | null;
      frenchExample: string | null;
      englishExample: string | null;
    }[];

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
    admin = { Authorization: `Bearer ${login.body.session.accessToken as string}` };
  });

  afterAll(async () => {
    await prisma?.predefinedList.deleteMany({ where: { id: { in: created } } });
    await prisma?.adminAccount.deleteMany({ where: { email } });
    await app?.close();
  });

  it('adds words at the end of the list, trimmed, and refuses the same English, whatever its case (409)', async () => {
    const listId = await newList('Voyage');
    const path = `/admin/catalog/lists/${listId}/entries`;
    const first = await http()
      .post(path)
      .set(admin)
      .send({
        french: ' un billet ',
        english: ' a ticket ',
        topic: 'Gare',
        frenchExample: '',
        englishExample: 'One ticket.',
      })
      .expect(201);
    expect(first.body).toMatchObject({
      position: 1,
      french: 'un billet',
      english: 'a ticket',
      topic: 'Gare',
      frenchExample: null,
      englishExample: 'One ticket.',
    });
    await http().post(path).set(admin).send({ french: 'un quai', english: 'a platform' }).expect(201);
    const duplicate = await http()
      .post(path)
      .set(admin)
      .send({ french: 'un ticket', english: '  A TICKET' })
      .expect(409);
    expect(duplicate.body.message).toBe('Ce mot est déjà dans la liste');
    // The same French is not a duplicate.
    await http().post(path).set(admin).send({ french: 'un billet', english: 'a note' }).expect(201);

    await http().post(path).set(admin).send({ french: '', english: 'empty' }).expect(400);
    await http()
      .post(path)
      .set(admin)
      .send({ french: 'trop', english: 'x'.repeat(201) })
      .expect(400);
    await http()
      .post(path)
      .set(admin)
      .send({ french: 'a', english: 'b', topic: 'x'.repeat(51) })
      .expect(400);
    await http()
      .post(`/admin/catalog/lists/${randomUUID()}/entries`)
      .set(admin)
      .send({ french: 'a', english: 'b' })
      .expect(404);

    expect((await words(listId)).map((word) => [word.position, word.english])).toEqual([
      [1, 'a ticket'],
      [2, 'a platform'],
      [3, 'a note'],
    ]);
    const count = (await http().get(`/admin/catalog/lists/${listId}`).set(admin).expect(200)).body.entries;
    expect(count).toBe(3);
  });

  it('changes a word at its place, its English unique but its own; deletes one, the users’ items stay', async () => {
    const listId = await newList('Cuisine');
    const path = `/admin/catalog/lists/${listId}/entries`;
    const pan = (await http().post(path).set(admin).send({ french: 'une poêle', english: 'a pan' }).expect(201)).body;
    const pot = (await http().post(path).set(admin).send({ french: 'une casserole', english: 'a pot' }).expect(201))
      .body;

    const changed = await http()
      .patch(`${path}/${pan.id}`)
      .set(admin)
      .send({ english: 'A PAN', topic: 'Ustensiles', frenchExample: 'Une poêle chaude.' })
      .expect(200);
    expect(changed.body).toMatchObject({ position: 1, english: 'A PAN', topic: 'Ustensiles' });
    await http().patch(`${path}/${pan.id}`).set(admin).send({ topic: '' }).expect(200);
    expect((await words(listId))[0].topic).toBeNull();
    await http().patch(`${path}/${pot.id}`).set(admin).send({ english: 'a pan ' }).expect(409);

    const user = await http()
      .post('/auth/register')
      .send({ email: `catalog-entries-user-${unique}@e2e.test`, password: 'password123' })
      .expect(201);
    const auth = { Authorization: `Bearer ${user.body.accessToken as string}` };
    const item = (
      await http().post('/vocabulary').set(auth).send({ word: 'a pot', translation: 'une casserole' }).expect(201)
    ).body.id as string;
    await http().delete(`${path}/${pot.id}`).set(admin).expect(200);
    expect((await words(listId)).map((word) => word.english)).toEqual(['A PAN']);
    expect((await http().get(`/vocabulary/${item}`).set(auth).expect(200)).body.word).toBe('a pot');
    await http().delete(`${path}/${pot.id}`).set(admin).expect(404);

    // A word of another list: not found through this one.
    const otherId = await newList('Autre');
    await http()
      .patch(`/admin/catalog/lists/${otherId}/entries/${pan.id}`)
      .set(admin)
      .send({ french: 'x' })
      .expect(404);

    // The last word of a published list stays.
    await http().patch(`/admin/catalog/lists/${listId}`).set(admin).send({ published: true }).expect(200);
    const last = await http().delete(`${path}/${pan.id}`).set(admin).expect(409);
    expect(last.body.message).toBe('Le dernier mot d’une liste publiée ne peut pas être supprimé');
  });

  it('keeps 500 words at most', async () => {
    const listId = await newList('Pleine');
    await prisma.predefinedEntry.createMany({
      data: Array.from({ length: 500 }, (_, i) => ({
        listId,
        position: i + 1,
        french: `mot ${i}`,
        english: `word ${i}`,
      })),
    });
    const full = await http()
      .post(`/admin/catalog/lists/${listId}/entries`)
      .set(admin)
      .send({ french: 'encore', english: 'more' })
      .expect(409);
    expect(full.body.message).toBe('Une liste compte 500 mots au plus');
  });

  it('analyses a file without saving, then imports it at the end, in its order, all at once', async () => {
    const listId = await newList('Travail');
    const path = `/admin/catalog/lists/${listId}`;
    await http().post(`${path}/entries`).set(admin).send({ french: 'une réunion', english: 'a meeting' }).expect(201);
    const file =
      HEADER +
      'un délai;a deadline;Projets;Le délai est court.;"The deadline is short; very."\r\n' +
      'une réunion;A Meeting\r\n' + // in the list
      'un échéancier;a deadline\r\n' + // higher in the file
      ';a manager\r\n' + // error
      'un collègue;a colleague\r\n';

    const preview = await http().post(`${path}/preview`).set(admin).send({ content: file }).expect(200);
    expect(preview.body).toMatchObject({ ok: true, room: 499, summary: { total: 5, new: 2, duplicate: 2, error: 1 } });
    expect(preview.body.rows.map((row: { status: string }) => row.status)).toEqual([
      'new',
      'duplicate',
      'duplicate',
      'error',
      'new',
    ]);
    expect((await words(listId)).length).toBe(1);

    const imported = await http().post(`${path}/import`).set(admin).send({ content: file }).expect(200);
    expect(imported.body).toEqual({ ok: true, imported: 2, duplicate: 2, error: 1 });
    const after = await words(listId);
    expect(after.map((word) => [word.position, word.english])).toEqual([
      [1, 'a meeting'],
      [2, 'a deadline'],
      [3, 'a colleague'],
    ]);
    expect(after[1]).toMatchObject({
      topic: 'Projets',
      frenchExample: 'Le délai est court.',
      englishExample: 'The deadline is short; very.',
    });

    // The other separator.
    const comma = await http()
      .post(`${path}/preview`)
      .set(admin)
      .send({ content: 'Français,Anglais\na,b\nc,d\n' })
      .expect(200);
    expect(comma.body).toMatchObject({ ok: false, problem: 'wrongSeparator', candidates: [','] });
  });

  it('refuses the whole import when it would go over 500 words, with the room left', async () => {
    const listId = await newList('Presque pleine');
    await prisma.predefinedEntry.createMany({
      data: Array.from({ length: 498 }, (_, i) => ({
        listId,
        position: i + 1,
        french: `mot ${i}`,
        english: `word ${i}`,
      })),
    });
    const file = `${HEADER}un;one\r\ndeux;two\r\ntrois;three\r\nmot 1;word 1\r\n`;
    const preview = await http().post(`/admin/catalog/lists/${listId}/preview`).set(admin).send({ content: file });
    expect(preview.body).toMatchObject({ ok: true, room: 2, summary: { new: 3, duplicate: 1 } });
    const refused = await http()
      .post(`/admin/catalog/lists/${listId}/import`)
      .set(admin)
      .send({ content: file })
      .expect(200);
    expect(refused.body).toEqual({ ok: false, problem: 'tooManyWords', room: 2, new: 3 });
    expect(await prisma.predefinedEntry.count({ where: { listId } })).toBe(498);
  });

  it('exports the list in the format of the import: re-importing it gives duplicates only', async () => {
    const listId = await newList('Été à l’hôtel');
    const path = `/admin/catalog/lists/${listId}`;
    await http()
      .post(`${path}/entries`)
      .set(admin)
      .send({ french: 'une chambre', english: 'a room', topic: 'Hôtel', englishExample: 'A room, "quiet"; please.' })
      .expect(201);
    await http().post(`${path}/entries`).set(admin).send({ french: 'la clé', english: 'the key' }).expect(201);

    const res = await http()
      .get(`${path}/export`)
      .set(admin)
      .buffer(true)
      .parse((r, done) => {
        let data = '';
        r.setEncoding('utf8');
        r.on('data', (chunk: string) => (data += chunk));
        r.on('end', () => done(null, data));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv/);
    const date = new Date().toISOString().slice(0, 10);
    expect(res.headers['content-disposition']).toBe(
      `attachment; filename="mementorize-liste-ete-a-l-hotel-${unique}-${date}.csv"`,
    );
    const csv = res.body as string;
    expect(csv).toBe(`﻿${HEADER}une chambre;a room;Hôtel;;"A room, ""quiet""; please."\r\nla clé;the key;;;\r\n`);

    const again = await http().post(`${path}/preview`).set(admin).send({ content: csv }).expect(200);
    expect(again.body).toMatchObject({ ok: true, summary: { total: 2, new: 0, duplicate: 2, error: 0 } });
  });

  it('is the console only: 401 without a token or with a user token', async () => {
    const listId = await newList('Interdite');
    const user = await http()
      .post('/auth/register')
      .send({ email: `catalog-entries-intruder-${unique}@e2e.test`, password: 'password123' })
      .expect(201);
    const auth = { Authorization: `Bearer ${user.body.accessToken as string}` };
    const path = `/admin/catalog/lists/${listId}`;
    await http().get(`${path}/entries`).expect(401);
    await http().get(`${path}/entries`).set(auth).expect(401);
    await http().post(`${path}/entries`).set(auth).send({ french: 'intrus', english: 'intruder' }).expect(401);
    await http()
      .post(`${path}/preview`)
      .set(auth)
      .send({ content: `${HEADER}a;b` })
      .expect(401);
    await http()
      .post(`${path}/import`)
      .set(auth)
      .send({ content: `${HEADER}a;b` })
      .expect(401);
    await http().get(`${path}/export`).set(auth).expect(401);
    expect(await prisma.predefinedEntry.count({ where: { listId } })).toBe(0);
  });
});
