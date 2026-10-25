import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { run } from '../src/admin/admin-cli.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/** MEM-82, end-to-end: the accounts made on the command line, the login of the console, its separation. */
describe('Administration console (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `admin-${unique}@e2e.test`;
  const password = 'a long admin password';

  beforeAll(async () => {
    process.env.ADMIN_JWT_SECRET = 'e2e-admin-secret';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma?.adminAccount.deleteMany({ where: { email } });
    await app?.close();
  });

  it('manages the accounts on the command line only', async () => {
    expect(await run(['create', email.toUpperCase()], prisma, async () => password)).toContain(email);
    await expect(run(['create', email], prisma, async () => password)).rejects.toThrow(/existe déjà/);
    await expect(run(['create', 'not-an-email'], prisma, async () => password)).rejects.toThrow(/E-mail invalide/);
    await expect(run(['create', `short-${email}`], prisma, async () => 'short')).rejects.toThrow(/12 caractères/);
    expect(await run(['list'], prisma)).toContain(email);

    const stored = await prisma.adminAccount.findUniqueOrThrow({ where: { email } });
    expect(stored.passwordHash).not.toContain(password);
    // No route of the API creates one.
    await http().post('/admin/accounts').send({ email, password }).expect(404);
  });

  it('logs an administrator in, and keeps the users out', async () => {
    const client = { 'X-Admin-Client-IP': `10.0.0.${Math.floor(Math.random() * 200)}` };
    const login = await http().post('/admin/auth/login').set(client).send({ email, password }).expect(200);
    expect(login.body).toMatchObject({ email, accessToken: expect.any(String), expiresAt: expect.any(String) });
    const admin = { Authorization: `Bearer ${login.body.accessToken}` };

    const me = await http().get('/admin/auth/me').set(admin).expect(200);
    expect(me.body).toEqual({ id: expect.any(String), email });
    await http().get('/admin/auth/me').expect(401);
    expect((await prisma.adminAccount.findUniqueOrThrow({ where: { email } })).lastLoginAt).not.toBeNull();

    // A user token is refused by the console, an administration token by the app.
    const user = await http()
      .post('/auth/register')
      .send({ email: `user-${unique}@e2e.test`, password: 'password123' })
      .expect(201);
    await http().get('/admin/auth/me').set('Authorization', `Bearer ${user.body.accessToken}`).expect(401);
    await http().get('/items').set(admin).expect(401);
    // A user can't log in to the console with their own account.
    await http()
      .post('/admin/auth/login')
      .set(client)
      .send({ email: `user-${unique}@e2e.test`, password: 'password123' })
      .expect(401);
  });

  it('limits the failed logins per address, with a generic message', async () => {
    const client = { 'X-Admin-Client-IP': `10.1.${Math.floor(Math.random() * 200)}.1` };
    const wrong = await http().post('/admin/auth/login').set(client).send({ email, password: 'wrong' }).expect(401);
    const unknown = await http()
      .post('/admin/auth/login')
      .set(client)
      .send({ email: `nobody-${email}`, password })
      .expect(401);
    expect(wrong.body.message).toBe(unknown.body.message);
    for (let i = 0; i < 3; i++) {
      await http().post('/admin/auth/login').set(client).send({ email, password: 'wrong' }).expect(401);
    }
    await http().post('/admin/auth/login').set(client).send({ email, password }).expect(429);
  });

  it('ends the access of a deleted account', async () => {
    const login = await http()
      .post('/admin/auth/login')
      .set('X-Admin-Client-IP', '10.2.0.1')
      .send({ email, password })
      .expect(200);
    expect(await run(['delete', email], prisma)).toContain(email);
    await http().get('/admin/auth/me').set('Authorization', `Bearer ${login.body.accessToken}`).expect(401);
  });
});
