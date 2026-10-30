// Shared setup for tests that touch PostgreSQL: a pool on the test database, a reset,
// the demo seed, and services wired with test doubles where a real dependency would be
// slow or external (the model). The database itself is never faked.
import { inject, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createPool, withTransaction } from '../../src/data/db.js';
import { DEMO_IDS, DEMO_USERS, seedDemoData } from '../../src/data/seedRepo.js';
import { createServices } from '../../src/services/index.js';
import { argon2Hasher } from '../../src/services/passwords.js';

export { DEMO_IDS };

export const TEST_PASSWORD = 'test-password-123';
export const DAY = 24 * 60 * 60 * 1000;

export const testPool = () => createPool(inject('databaseUrl'));

export async function resetDatabase(pool) {
  await pool.query('TRUNCATE registrations, events, clubs, sessions, oauth_accounts, users CASCADE');
}

let passwordHash;
/** Argon2id is slow on purpose; the tests hash the shared test password once. */
export async function testPasswordHash() {
  passwordHash ??= await argon2Hasher.hash(TEST_PASSWORD);
  return passwordHash;
}

export async function seedDemo(pool, now = new Date()) {
  await resetDatabase(pool);
  const hash = await testPasswordHash();
  await withTransaction(pool, (client) => seedDemoData(client, { passwordHash: hash, now }));
}

/** The currentUser objects a route would hand a service after reading the session. */
export const demoUser = (key) => {
  const index = { organizer1: 0, organizer2: 1, student1: 2, student2: 3 }[key];
  const { id, email, displayName, role } = DEMO_USERS[index];
  return { id, email, displayName, role };
};

export const quietLogger = () => ({ warn: vi.fn(), error: vi.fn(), log: vi.fn() });

export function makeServices(pool, overrides = {}) {
  return createServices({
    pool,
    modelClient: null,
    clock: () => new Date(),
    hasher: argon2Hasher,
    sessionTtlMs: 7 * DAY,
    logger: quietLogger(),
    draftTimeoutMs: 200,
    ...overrides,
  });
}

export const testConfig = {
  isProduction: false,
  appBaseUrl: 'http://localhost:3000',
  sessionTtlMs: 7 * DAY,
  google: { clientId: '', clientSecret: '', redirectUri: 'http://localhost:3000/api/auth/google/callback' },
  model: { apiKey: '', name: 'test-model', timeoutMs: 200 },
};

export const disabledGoogle = { configured: false };

export function makeApp(pool, { services = makeServices(pool), googleClient = disabledGoogle, ...rest } = {}) {
  const logger = quietLogger();
  const app = createApp({
    services,
    config: testConfig,
    googleClient,
    logger,
    signInLimit: { windowMs: 60_000, max: 10_000 },
    ...rest,
  });
  return { app, services, logger };
}

/** A supertest agent that keeps the session cookie, signed in as one of the demo users. */
export async function signedInAgent(app, key) {
  const agent = request.agent(app);
  const email = DEMO_USERS.find((u) => u.id === DEMO_IDS[key]).email;
  const res = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  if (res.status !== 200) throw new Error(`sign-in as ${key} failed: ${res.status}`);
  return agent;
}

/** An extra member, for tests that need more people than the seed has. */
export async function insertMember(pool, email) {
  const { rows } = await pool.query(
    "INSERT INTO users (email, display_name, password_hash, role) VALUES ($1, $2, $3, 'member') RETURNING id, email, display_name, role",
    [email, email.split('@')[0], await testPasswordHash()],
  );
  const row = rows[0];
  return { id: row.id, email: row.email, displayName: row.display_name, role: row.role };
}

/** An event that already happened, which the seed never creates. */
export async function insertPastEvent(pool) {
  const { rows } = await pool.query(
    `INSERT INTO events (club_id, organizer_id, title, description, category, location, starts_at, ends_at, capacity)
     VALUES ($1, $2, 'Минала лекция', 'Лекция, която вече се е състояла.', 'other', 'Зала 100',
             now() - interval '3 days', now() - interval '2 days', 10)
     RETURNING id`,
    [DEMO_IDS.clubCode, DEMO_IDS.organizer1],
  );
  return rows[0].id;
}

export const countRows = async (pool, sql, params = []) => (await pool.query(sql, params)).rows[0].n;

export const registrationCount = (pool, eventId, userId) =>
  countRows(
    pool,
    userId
      ? 'SELECT count(*) AS n FROM registrations WHERE event_id = $1 AND user_id = $2'
      : 'SELECT count(*) AS n FROM registrations WHERE event_id = $1',
    userId ? [eventId, userId] : [eventId],
  );

/** A valid body for POST /api/events, starting `days` from now. */
export const newEventInput = (clubId, days = 5) => {
  const startsAt = new Date(Date.now() + days * DAY);
  return {
    clubId,
    title: 'Уъркшоп по React',
    description: 'Практически уъркшоп за начинаещи с React и Vite.',
    summary: 'Основите на React за два часа.',
    category: 'technology',
    location: 'Зала 1203',
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    capacity: 25,
  };
};
