import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGoogleOAuthClient, OAuthError, verifyIdTokenClaims } from '../../src/integrations/googleOAuthClient.js';
import { DEMO_IDS, makeApp, makeServices, seedDemo, testPool } from '../helpers/db.js';

const pool = testPool();
afterAll(() => pool.end());
beforeEach(() => seedDemo(pool));

const { oauth } = makeServices(pool);
const count = async (sql, params) => (await pool.query(sql, params)).rows[0].n;
const userCount = () => count('SELECT count(*)::int AS n FROM users');

describe('Google account linking', () => {
  it('AC-23 links verified Google account by email', async () => {
    const before = await userCount();
    const user = await oauth.signInWithGoogle({
      subject: 'google-sub-1',
      email: 'Student1@EventHub.test',
      emailVerified: true,
      name: 'Иван от Google',
    });
    expect(user.id).toBe(DEMO_IDS.student1);
    expect(await userCount()).toBe(before);
    expect(await count('SELECT count(*)::int AS n FROM oauth_accounts WHERE user_id = $1', [DEMO_IDS.student1])).toBe(1);

    // Next time the identity itself is the key, even if Google's email changed meanwhile.
    const again = await oauth.signInWithGoogle({ subject: 'google-sub-1', email: 'other@gmail.com', emailVerified: false });
    expect(again.id).toBe(DEMO_IDS.student1);
    expect(await count('SELECT count(*)::int AS n FROM oauth_accounts')).toBe(1);
  });

  it('AC-24 rejects unverified email linking', async () => {
    const before = await userCount();
    for (const profile of [
      { subject: 'google-sub-2', email: 'student2@eventhub.test', emailVerified: false },
      { subject: 'google-sub-3', email: 'brand-new@gmail.com', emailVerified: false },
      { subject: 'google-sub-4', emailVerified: true },
    ]) {
      await expect(oauth.signInWithGoogle(profile)).rejects.toMatchObject({ status: 403, code: 'EMAIL_NOT_VERIFIED' });
    }
    expect(await userCount()).toBe(before);
    expect(await count('SELECT count(*)::int AS n FROM oauth_accounts')).toBe(0);
  });

  it('creates one new member for a verified email nobody has yet', async () => {
    const user = await oauth.signInWithGoogle({ subject: 'g-new', email: 'New.Person@gmail.com', emailVerified: true });
    expect(user).toMatchObject({ email: 'new.person@gmail.com', displayName: 'new.person', role: 'member' });
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [user.id]);
    expect(rows[0].password_hash).toBeNull();

    const named = await oauth.signInWithGoogle({ subject: 'g-named', email: 'x@gmail.com', emailVerified: true, name: 'Х'.repeat(150) });
    expect(named.displayName).toHaveLength(100);
  });
});

describe('Google OpenID Connect client', () => {
  const clientId = 'client-123.apps.googleusercontent.com';
  const nonce = 'nonce-abc';
  const now = 1_800_000_000_000;
  const claims = {
    iss: 'https://accounts.google.com',
    aud: clientId,
    exp: now / 1000 + 300,
    nonce,
    sub: '1234567890',
    email: 'person@gmail.com',
    email_verified: true,
    name: 'Person',
  };
  const jwt = (payload) => `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;

  it('accepts only an ID token for this app, from Google, unexpired, with our nonce', () => {
    expect(verifyIdTokenClaims(claims, { clientId, nonce, now })).toEqual({
      subject: '1234567890',
      email: 'person@gmail.com',
      emailVerified: true,
      name: 'Person',
    });
    expect(verifyIdTokenClaims({ ...claims, aud: [clientId], email_verified: 'true' }, { clientId, nonce, now }).emailVerified).toBe(false);

    const reasons = [
      [{ iss: 'https://evil.example' }, 'wrong_issuer'],
      [{ aud: 'other-client' }, 'wrong_audience'],
      [{ exp: now / 1000 - 1 }, 'expired_id_token'],
      [{ nonce: 'replayed' }, 'wrong_nonce'],
      [{ sub: '' }, 'missing_subject'],
    ];
    for (const [change, reason] of reasons) {
      expect(() => verifyIdTokenClaims({ ...claims, ...change }, { clientId, nonce, now })).toThrow(
        expect.objectContaining({ reason }),
      );
    }
  });

  it('builds an authorization URL with state, nonce and an S256 PKCE challenge', () => {
    const client = createGoogleOAuthClient({ clientId, clientSecret: 's', redirectUri: 'http://localhost:3000/cb' });
    expect(client.configured).toBe(true);
    const { url, state, codeVerifier, nonce: n } = client.createAuthorizationRequest();
    const params = new URL(url).searchParams;
    expect(params.get('state')).toBe(state);
    expect(params.get('nonce')).toBe(n);
    expect(params.get('code_challenge_method')).toBe('S256');
    expect(params.get('code_challenge')).not.toBe(codeVerifier);
    expect(params.get('scope')).toBe('openid email profile');
    expect(createGoogleOAuthClient({ clientId: '', clientSecret: '' }).configured).toBe(false);
  });

  it('exchanges a code server-side and maps every failure to OAuthError', async () => {
    const respond = (status, body) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
    const make = (fetchImpl) =>
      createGoogleOAuthClient({ clientId, clientSecret: 'secret', redirectUri: 'http://x/cb', fetchImpl, now: () => now });

    const fetchOk = respond(200, { id_token: jwt(claims) });
    expect(await make(fetchOk).exchangeCode({ code: 'c', codeVerifier: 'v', nonce })).toMatchObject({ subject: '1234567890' });
    const sent = fetchOk.mock.calls[0][1].body;
    expect(sent.get('code_verifier')).toBe('v');
    expect(sent.get('client_secret')).toBe('secret');

    const failures = [
      [vi.fn().mockRejectedValue(new TypeError('fetch failed')), 'token_endpoint_unreachable'],
      [respond(400, { error: 'invalid_grant' }), 'code_rejected'],
      [vi.fn().mockResolvedValue(new Response('not json', { status: 200 })), 'missing_id_token'],
      [respond(200, { id_token: 'a.%%%.c' }), 'malformed_id_token'],
    ];
    for (const [fetchImpl, reason] of failures) {
      await expect(make(fetchImpl).exchangeCode({ code: 'c', codeVerifier: 'v', nonce })).rejects.toMatchObject({ reason });
    }
    expect(new OAuthError('x')).toBeInstanceOf(Error);
  });
});

describe('Google sign-in routes', () => {
  const profile = { subject: 'route-sub', email: 'student2@eventhub.test', emailVerified: true };
  const fakeGoogle = (exchange) => ({
    configured: true,
    createAuthorizationRequest: () => ({ url: 'https://accounts.google.com/o/oauth2/v2/auth?x=1', state: 'st', codeVerifier: 'cv', nonce: 'nn' }),
    exchangeCode: vi.fn(exchange),
  });
  const pending = 'eh_oauth=' + encodeURIComponent('j:' + JSON.stringify({ state: 'st', codeVerifier: 'cv', nonce: 'nn' }));

  it('AC-25 gives Google sign-in the same session cookie as a password sign-in', async () => {
    const google = fakeGoogle(async () => profile);
    const { app } = makeApp(pool, { googleClient: google });

    const start = await request(app).get('/api/auth/google').expect(302);
    expect(start.headers.location).toMatch(/^https:\/\/accounts\.google\.com\//);
    expect(start.headers['set-cookie'][0]).toMatch(/^eh_oauth=.*HttpOnly/);

    const callback = await request(app).get('/api/auth/google/callback?state=st&code=abc').set('Cookie', pending).expect(302);
    expect(callback.headers.location).toBe('/events');
    expect(google.exchangeCode).toHaveBeenCalledWith({ code: 'abc', codeVerifier: 'cv', nonce: 'nn' });
    const googleCookie = callback.headers['set-cookie'].find((c) => c.startsWith('eh_session='));

    const local = await request(app).post('/api/auth/login').send({ email: 'student2@eventhub.test', password: 'test-password-123' });
    const localCookie = local.headers['set-cookie'].find((c) => c.startsWith('eh_session='));
    const attributes = (c) => c.split('; ').slice(1).filter((a) => !a.startsWith('Expires=')).sort();
    expect(attributes(googleCookie)).toEqual(attributes(localCookie));

    const me = await request(app).get('/api/auth/me').set('Cookie', googleCookie.split(';')[0]).expect(200);
    expect(me.body.user.id).toBe(DEMO_IDS.student2);
  });

  it('sends the browser back to /login with a reason when Google sign-in cannot complete', async () => {
    const cases = [
      [fakeGoogle(async () => profile), '/api/auth/google/callback?state=WRONG&code=abc', pending, 'google_failed'],
      [fakeGoogle(async () => profile), '/api/auth/google/callback?state=st&code=abc', '', 'google_failed'],
      [fakeGoogle(async () => profile), '/api/auth/google/callback?state=st', pending, 'google_failed'],
      [fakeGoogle(async () => ({ ...profile, subject: 'other', emailVerified: false })), '/api/auth/google/callback?state=st&code=abc', pending, 'google_unverified'],
      [fakeGoogle(async () => { throw new OAuthError('wrong_nonce'); }), '/api/auth/google/callback?state=st&code=abc', pending, 'google_failed'],
    ];
    for (const [google, url, cookie, reason] of cases) {
      const { app } = makeApp(pool, { googleClient: google });
      const res = await request(app).get(url).set('Cookie', cookie).expect(302);
      expect(res.headers.location).toBe(`/login?error=${reason}`);
      expect(res.headers['set-cookie']?.some((c) => c.startsWith('eh_session=') && !c.startsWith('eh_session=;'))).toBeFalsy();
    }

    const { app } = makeApp(pool);
    expect((await request(app).get('/api/auth/google').expect(302)).headers.location).toBe('/login?error=google_unavailable');

    const { app: crashing } = makeApp(pool, { googleClient: fakeGoogle(async () => { throw new Error('bug'); }) });
    await request(crashing).get('/api/auth/google/callback?state=st&code=abc').set('Cookie', pending).expect(500);
  });
});
