import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeApp, makeServices, seedDemo, signedInAgent, TEST_PASSWORD, testPool } from '../helpers/db.js';

const pool = testPool();
afterAll(() => pool.end());
beforeEach(() => seedDemo(pool));

const sessionCookie = (res) => res.headers['set-cookie']?.find((c) => c.startsWith('eh_session='));

describe('authentication over HTTP', () => {
  it('AC-10 rejects unauthenticated requests', async () => {
    const { app } = makeApp(pool);
    const protectedRequests = [
      request(app).get('/api/events'),
      request(app).get('/api/events/00000000-0000-4000-8000-0000000000e1'),
      request(app).get('/api/registrations/me'),
      request(app).post('/api/events/00000000-0000-4000-8000-0000000000e1/registrations'),
      request(app).get('/api/clubs/me'),
      request(app).post('/api/ai/event-draft').send({ text: 'Нещо достатъчно дълго' }),
      request(app).get('/api/auth/me'),
      request(app).post('/api/auth/logout'),
    ];
    for (const res of await Promise.all(protectedRequests)) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: { code: 'UNAUTHENTICATED', message: 'Моля, влезте в профила си.' } });
    }
    // A made-up cookie is no better than none.
    await request(app).get('/api/events').set('Cookie', 'eh_session=forged-token').expect(401);
  });

  it('AC-22 creates session on valid local sign-in', async () => {
    const { app } = makeApp(pool);
    const wrong = await request(app).post('/api/auth/login').send({ email: 'student1@eventhub.test', password: 'wrong-password-1' });
    const unknown = await request(app).post('/api/auth/login').send({ email: 'nobody@eventhub.test', password: 'wrong-password-1' });
    // The same answer for a wrong password and for an email nobody has: no account enumeration.
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(sessionCookie(wrong)).toBeUndefined();

    const ok = await request(app).post('/api/auth/login').send({ email: ' Student1@EventHub.test ', password: TEST_PASSWORD });
    expect(ok.status).toBe(200);
    const cookie = sessionCookie(ok);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\//);

    const me = await request(app).get('/api/auth/me').set('Cookie', cookie.split(';')[0]).expect(200);
    expect(me.body.user).toEqual({
      id: '00000000-0000-4000-8000-000000000003',
      email: 'student1@eventhub.test',
      displayName: 'Иван Студент',
      role: 'member',
    });
    expect(JSON.stringify(me.body)).not.toMatch(/password/i);
  });

  it('AC-25 revokes session on logout', async () => {
    const { app } = makeApp(pool);
    const agent = await signedInAgent(app, 'student1');
    await agent.get('/api/events').expect(200);
    const logout = await agent.post('/api/auth/logout').expect(204);
    expect(logout.headers['set-cookie'][0]).toMatch(/eh_session=;/);

    // Even if the browser kept the old token, the server no longer knows it.
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM sessions');
    expect(rows[0].n).toBe(0);
    await agent.get('/api/events').expect(401);
  });

  it('registers a new member, signs them in, and refuses a second account for the same email', async () => {
    const { app } = makeApp(pool);
    const agent = request.agent(app);
    const res = await agent
      .post('/api/auth/register')
      .send({ email: 'New.Student@EventHub.test', password: 'a-long-password', displayName: 'Нов студент' })
      .expect(201);
    expect(res.body.user).toMatchObject({ email: 'new.student@eventhub.test', role: 'member' });
    expect(sessionCookie(res)).toBeDefined();
    await agent.get('/api/auth/me').expect(200);

    const again = await request(app)
      .post('/api/auth/register')
      .send({ email: 'new.student@eventhub.test', password: 'another-password', displayName: 'Друг' })
      .expect(409);
    expect(again.body.error.code).toBe('EMAIL_TAKEN');

    const invalid = await request(app).post('/api/auth/register').send({ email: 'x', password: 'short' }).expect(400);
    expect(invalid.body.error.fields).toMatchObject({ email: expect.any(String), password: expect.any(String) });
  });

  it('limits repeated sign-in attempts with 429', async () => {
    const { app } = makeApp(pool, { signInLimit: { windowMs: 60_000, max: 2 } });
    const attempt = () => request(app).post('/api/auth/login').send({ email: 'a@b.cd', password: 'whatever-123' });
    expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(401);
    const limited = await attempt();
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('TOO_MANY_ATTEMPTS');
  });

  it('refuses a state-changing request that comes from another site', async () => {
    const { app } = makeApp(pool);
    const agent = await signedInAgent(app, 'student2');
    const target = '/api/events/00000000-0000-4000-8000-0000000000e3/registrations';
    await agent.post(target).set('Origin', 'https://evil.example').expect(403);
    await agent.post(target).set('Origin', 'null').expect(403);
    await agent.post(target).set('Sec-Fetch-Site', 'cross-site').expect(403);
    await agent.post(target).set('Origin', 'http://localhost:3000').expect(201);
    // Reading is not state-changing, so it is not checked.
    await agent.get('/api/events').set('Origin', 'https://evil.example').expect(200);
  });

  it('adds a password only for an account that signed in with Google', async () => {
    const { app } = makeApp(pool);
    const agent = await signedInAgent(app, 'student1');
    const res = await agent.post('/api/auth/password').send({ password: 'new-password-123' }).expect(409);
    expect(res.body.error.code).toBe('PASSWORD_ALREADY_SET');
  });
});

describe('HTTP plumbing', () => {
  it('answers /health and /api/health, and 503 when the database is unreachable', async () => {
    const { app } = makeApp(pool);
    expect((await request(app).get('/health').expect(200)).body).toEqual({ status: 'ok', database: 'ok' });
    await request(app).get('/api/health').expect(200);

    const broken = { query: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) };
    const { app: down } = makeApp(pool, { services: { ...makeServices(pool), health: makeServices(broken).health } });
    expect((await request(down).get('/health').expect(503)).body).toEqual({ status: 'degraded', database: 'unavailable' });
  });

  it('turns malformed JSON, oversized bodies, unknown routes and crashes into readable errors', async () => {
    const { app, logger, services } = makeApp(pool);
    const badJson = await request(app).post('/api/auth/login').set('content-type', 'application/json').send('{"email":');
    expect(badJson.status).toBe(400);
    expect(badJson.body.error.code).toBe('INVALID_JSON');

    const big = await request(app).post('/api/auth/login').send({ email: 'x'.repeat(30_000) });
    expect(big.status).toBe(413);

    const missing = await request(app).get('/api/nothing-here').expect(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');

    services.events.listUpcomingEvents = vi.fn().mockRejectedValue(Object.assign(new Error('boom: secret detail'), { code: 'XX000' }));
    const agent = await signedInAgent(app, 'student1');
    const crash = await agent.get('/api/events').expect(500);
    expect(crash.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Възникна неочаквана грешка. Опитайте отново по-късно.' },
    });
    expect(JSON.stringify(crash.body)).not.toContain('secret');
    expect(logger.error).toHaveBeenCalledWith('[error] GET /api/events: Error (XX000)');
  });

  it('sets the basic security headers, and a CSP in production', async () => {
    const { app } = makeApp(pool);
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['content-security-policy']).toBeUndefined();

    const { app: prod } = makeApp(pool, { config: { ...(await import('../helpers/db.js')).testConfig, isProduction: true } });
    expect((await request(prod).get('/health')).headers['content-security-policy']).toContain("default-src 'self'");
  });
});
