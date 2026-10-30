import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashToken } from '../../src/services/authService.js';
import { DAY, demoUser, makeServices, seedDemo, TEST_PASSWORD, testPool } from '../helpers/db.js';

const pool = testPool();
afterAll(() => pool.end());
beforeEach(() => seedDemo(pool));

const { auth } = makeServices(pool);
const userRow = async (email) => (await pool.query('SELECT * FROM users WHERE email = $1', [email])).rows[0];

describe('authService', () => {
  it('AC-21 hashes passwords during registration', async () => {
    const password = 'correct horse battery';
    const user = await auth.register({ email: 'Ana@Example.com ', password, displayName: 'Ана' });
    expect(user).toEqual({ id: expect.any(String), email: 'ana@example.com', displayName: 'Ана', role: 'member' });

    const row = await userRow('ana@example.com');
    expect(row.password_hash).toMatch(/^\$argon2id\$/);
    expect(row.password_hash).not.toContain(password);
    // No column anywhere holds the plain password.
    expect(JSON.stringify(row)).not.toContain(password);

    // Two people with the same password get different hashes: the salt is per hash.
    await auth.register({ email: 'bob@example.com', password, displayName: 'Боб' });
    expect((await userRow('bob@example.com')).password_hash).not.toBe(row.password_hash);

    expect(await auth.login({ email: 'ana@example.com', password })).toMatchObject({ id: user.id });
  });

  it('refuses invalid registrations with field messages', async () => {
    await expect(auth.register({ email: 'no-at-sign', password: 'short', displayName: '' })).rejects.toMatchObject({
      status: 400,
      details: {
        fields: {
          email: 'Въведете валиден имейл адрес.',
          password: 'Паролата трябва да е поне 10 символа.',
          displayName: 'Името трябва да е между 1 и 100 символа.',
        },
      },
    });
    await expect(
      auth.register({ email: `${'a'.repeat(250)}@b.cd`, password: 'x'.repeat(201), displayName: 'А' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('turns only the email uniqueness violation into EMAIL_TAKEN', async () => {
    await expect(
      auth.register({ email: 'student1@eventhub.test', password: 'long-enough-1', displayName: 'Дубликат' }),
    ).rejects.toMatchObject({ status: 409, code: 'EMAIL_TAKEN' });

    const failingPool = { query: vi.fn().mockRejectedValue(Object.assign(new Error('disk full'), { code: '53100' })) };
    const broken = makeServices(failingPool).auth;
    await expect(broken.register({ email: 'x@y.zz', password: 'long-enough-1', displayName: 'X' })).rejects.toThrow('disk full');
  });

  it('gives the same answer for an unknown email, a wrong password and a Google-only account', async () => {
    await pool.query("INSERT INTO users (email, display_name, role) VALUES ('google-only@eventhub.test', 'G', 'member')");
    const attempts = [
      { email: 'nobody@eventhub.test', password: TEST_PASSWORD },
      { email: 'student1@eventhub.test', password: 'wrong-password' },
      { email: 'google-only@eventhub.test', password: TEST_PASSWORD },
      { email: 'student1@eventhub.test' },
      {},
    ];
    for (const attempt of attempts) {
      await expect(auth.login(attempt)).rejects.toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    }
  });

  it('stores only the hash of a session token and expires sessions', async () => {
    const student = demoUser('student1');
    const { token, expiresAt } = await auth.createSession(student.id);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * DAY);

    const { rows } = await pool.query('SELECT token_hash FROM sessions WHERE user_id = $1', [student.id]);
    expect(rows).toEqual([{ token_hash: hashToken(token) }]);
    expect(rows[0].token_hash).not.toBe(token);

    expect(await auth.getUserBySessionToken(token)).toEqual(student);
    expect(await auth.getUserBySessionToken('')).toBeNull();
    expect(await auth.getUserBySessionToken(undefined)).toBeNull();
    expect(await auth.getUserBySessionToken('unknown')).toBeNull();

    await pool.query("UPDATE sessions SET expires_at = now() - interval '1 minute'");
    expect(await auth.getUserBySessionToken(token)).toBeNull();

    await auth.logout(token);
    await auth.logout(undefined);
    expect((await pool.query('SELECT count(*)::int AS n FROM sessions')).rows[0].n).toBe(0);
  });

  it('adds a password to a Google-only account, and only to one', async () => {
    const { rows } = await pool.query(
      "INSERT INTO users (email, display_name, role) VALUES ('g@eventhub.test', 'G', 'member') RETURNING id, email, display_name, role",
    );
    const googleUser = { id: rows[0].id, email: rows[0].email, displayName: 'G', role: 'member' };

    // No Google identity attached yet: there is nothing that proves who this is.
    await expect(auth.addPassword(googleUser, 'a-new-password')).rejects.toMatchObject({ status: 403 });

    await pool.query("INSERT INTO oauth_accounts (user_id, provider, provider_user_id) VALUES ($1, 'google', 'g-1')", [googleUser.id]);
    await expect(auth.addPassword(googleUser, 'short')).rejects.toMatchObject({ status: 400 });
    await auth.addPassword(googleUser, 'a-new-password');
    expect(await auth.login({ email: 'g@eventhub.test', password: 'a-new-password' })).toMatchObject({ id: googleUser.id });

    await expect(auth.addPassword(googleUser, 'another-password')).rejects.toMatchObject({ code: 'PASSWORD_ALREADY_SET' });
    await expect(auth.addPassword(null, 'another-password')).rejects.toMatchObject({ status: 401 });
  });
});
