import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { run } from '../src/admin/admin-cli.js';
import { timeStep, totpCode } from '../src/admin/totp.js';
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
  /** The key of the authenticator app, once the two-step login is activated (MEM-86). */
  let totpSecret = '';
  /**
   * A code of the app, as if 30 s had passed since the last one: a code is
   * accepted once per 30 s step (anti-replay), and these tests log in more
   * often than that. The replay itself is tested without this.
   */
  async function nextCode(): Promise<string> {
    const step = timeStep(new Date());
    await prisma.adminAccount.updateMany({
      where: { email, totpLastStep: { gte: step - 1 } },
      data: { totpLastStep: step - 2 },
    });
    return totpCode(totpSecret, step);
  }

  /** Password, then code (or the activation, the first time): a session (MEM-86). */
  async function adminSession(ip: string): Promise<{ Authorization: string }> {
    const client = { 'X-Admin-Client-IP': ip };
    const login = await http().post('/admin/auth/login').set(client).send({ email, password }).expect(200);
    if (login.body.step === 'activation') {
      const { challenge } = login.body;
      totpSecret = (await http().post('/admin/auth/enrollment').send({ challenge }).expect(200)).body.secret;
      const activated = await http()
        .post('/admin/auth/activate')
        .set(client)
        .send({ challenge, code: await nextCode() })
        .expect(200);
      return { Authorization: `Bearer ${activated.body.accessToken}` };
    }
    const verified = await http()
      .post('/admin/auth/verify')
      .set(client)
      .send({ challenge: login.body.challenge, code: await nextCode() })
      .expect(200);
    return { Authorization: `Bearer ${verified.body.accessToken}` };
  }

  beforeAll(async () => {
    process.env.ADMIN_JWT_SECRET = 'e2e-admin-secret';
    process.env.ADMIN_TOTP_ENCRYPTION_KEY = 'e2e0'.repeat(16);
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
    const admin = await adminSession(client['X-Admin-Client-IP']);

    const me = await http().get('/admin/auth/me').set(admin).expect(200);
    expect(me.body).toEqual({ id: expect.any(String), email, recoveryCodesLeft: 10 });
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

  it('asks for the code of the authenticator app, once only per code, or a recovery code (MEM-86)', async () => {
    const client = { 'X-Admin-Client-IP': '10.4.0.1' };
    await adminSession('10.4.0.9'); // activated, if not yet
    const login = await http().post('/admin/auth/login').set(client).send({ email, password }).expect(200);
    expect(login.body).toEqual({ step: 'code', challenge: expect.any(String), expiresAt: expect.any(String) });
    const { challenge } = login.body;
    // The step is not a session.
    await http().get('/admin/auth/me').set('Authorization', `Bearer ${challenge}`).expect(401);
    await http().post('/admin/auth/verify').set(client).send({ challenge, code: '000000' }).expect(401);
    const code = await nextCode();
    await http().post('/admin/auth/verify').set(client).send({ challenge, code }).expect(200);
    await http().post('/admin/auth/verify').set(client).send({ challenge, code }).expect(401); // replayed
    await http()
      .post('/admin/auth/verify')
      .set(client)
      .send({ challenge: 'forged', code: await nextCode() })
      .expect(410);
    await http().post('/admin/auth/enrollment').send({ challenge }).expect(410); // a login step, not an activation

    // A recovery code: the codes were given at the activation; here, a new set by a reset.
    expect(await run(['reset-2fa', email], prisma)).toContain(email);
    const again = await http().post('/admin/auth/login').set(client).send({ email, password }).expect(200);
    expect(again.body.step).toBe('activation'); // to be activated again
    totpSecret = (await http().post('/admin/auth/enrollment').send({ challenge: again.body.challenge }).expect(200))
      .body.secret;
    const activated = await http()
      .post('/admin/auth/activate')
      .set(client)
      .send({ challenge: again.body.challenge, code: await nextCode() })
      .expect(200);
    const recovery: string[] = activated.body.recoveryCodes;
    expect(recovery).toHaveLength(10);

    const third = await http().post('/admin/auth/login').set(client).send({ email, password }).expect(200);
    const rescued = await http()
      .post('/admin/auth/verify')
      .set(client)
      .send({ challenge: third.body.challenge, code: recovery[0] })
      .expect(200);
    expect(rescued.body.recoveryCodesLeft).toBe(9);
    await http()
      .post('/admin/auth/verify')
      .set(client)
      .send({ challenge: third.body.challenge, code: recovery[0] })
      .expect(401); // used up
    const stored = await prisma.adminRecoveryCode.findMany({ where: { admin: { email } } });
    expect(JSON.stringify(stored)).not.toContain(recovery[1]);
    const account = await prisma.adminAccount.findUniqueOrThrow({ where: { email } });
    expect(account.totpSecret).not.toContain(totpSecret); // encrypted

    // The reset ends the sessions in progress.
    const admin = { Authorization: `Bearer ${rescued.body.accessToken}` };
    await http().get('/admin/auth/me').set(admin).expect(200);
    await run(['reset-2fa', email], prisma);
    await http().get('/admin/auth/me').set(admin).expect(401);
  });

  it('lists the users with their counters, never the content of their items (MEM-84)', async () => {
    const admin = await adminSession('10.3.0.1');

    const reader = await http()
      .post('/auth/register')
      .send({ email: `reader-${unique}@e2e.test`, password: 'password123' })
      .expect(201);
    const auth = { Authorization: `Bearer ${reader.body.accessToken}` };
    await http().put('/profile').set(auth).send({ firstName: 'Rita', lastName: 'Lecture' }).expect(200);
    for (const word of ['secret-word-1', 'secret-word-2', 'secret-word-3']) {
      await http().post('/vocabulary').set(auth).send({ word, translation: 'mot secret' }).expect(201);
    }
    await http().post('/quotes').set(auth).send({ text: 'Une citation confidentielle.' }).expect(201);
    const map = await http()
      .post('/mind-maps')
      .set(auth)
      .send({
        nodes: [
          { id: 'r', parentId: null, label: 'Racine privée', position: { x: 0, y: 0 } },
          { id: 'a', parentId: 'r', label: 'Branche A', position: { x: 100, y: 0 } },
          { id: 'b', parentId: 'r', label: 'Branche B', position: { x: -100, y: 0 } },
        ],
      })
      .expect(201);
    const branch = (map.body.cards as { id: string }[])[0].id;
    await http().post(`/reviews/${branch}/learned`).set(auth).expect(201);
    // One word learning, one learned.
    const words = await prisma.item.findMany({
      where: { user: { email: `reader-${unique}@e2e.test` }, type: 'Vocabulary' },
      orderBy: { createdAt: 'asc' },
    });
    await prisma.item.update({ where: { id: words[0].id }, data: { learningStatus: 'Learning', learnPosition: null } });
    await prisma.item.update({ where: { id: words[1].id }, data: { learningStatus: 'Learned', learnPosition: null } });

    const list = await http().get('/admin/users').set(admin).expect(200);
    const row = list.body.users.find((user: { email: string }) => user.email === `reader-${unique}@e2e.test`);
    expect(row).toEqual({
      id: expect.any(String),
      email: `reader-${unique}@e2e.test`,
      firstName: 'Rita',
      lastName: 'Lecture',
      createdAt: expect.any(String),
      lastActiveAt: expect.any(String),
      counts: {
        Vocabulary: { Waiting: 0, ToLearn: 1, Learning: 1, Learned: 1, total: 3 },
        Quote: { Waiting: 0, ToLearn: 1, Learning: 0, Learned: 0, total: 1 },
        MindMap: { total: 1, branchesInReview: 1, branchesLearned: 1 },
        total: 5,
      },
    });
    // The totals: the sum of every user's counters (the other e2e files add items meanwhile).
    type Row = { counts: { total: number; MindMap: { branchesLearned: number } } };
    const users = list.body.users as Row[];
    expect(list.body.totals.total).toBe(users.reduce((sum, user) => sum + user.counts.total, 0));
    expect(list.body.totals.MindMap.branchesLearned).toBe(
      users.reduce((sum, user) => sum + user.counts.MindMap.branchesLearned, 0),
    );
    // Nothing of the items themselves.
    const raw = JSON.stringify(list.body);
    for (const secret of [
      'secret-word',
      'mot secret',
      'confidentielle',
      'Racine privée',
      'Branche A',
      'passwordHash',
    ]) {
      expect(raw).not.toContain(secret);
    }

    await http().get('/admin/users').expect(401);
    await http().get('/admin/users').set(auth).expect(401); // a user token
  });

  it('ends the access of a deleted account', async () => {
    const admin = await adminSession('10.2.0.1');
    expect(await run(['delete', email], prisma)).toContain(email);
    await http().get('/admin/auth/me').set(admin).expect(401);
  });
});
