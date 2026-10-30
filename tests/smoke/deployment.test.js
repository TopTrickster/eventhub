// The public deployment. The structural half runs everywhere. The live half needs the
// deployed URL (course.json liveUrl or LIVE_URL) and, for the user flows, test accounts
// on that deployment in SMOKE_STUDENT_EMAIL/PASSWORD and SMOKE_ORGANIZER_EMAIL/PASSWORD.
// Until then it is reported as skipped, never as passed.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const course = JSON.parse(readFileSync('course.json', 'utf8'));
const LIVE_URL = (process.env.LIVE_URL || course.liveUrl || '').replace(/\/$/, '');
const env = process.env;
const accounts = env.SMOKE_STUDENT_EMAIL && env.SMOKE_STUDENT_PASSWORD && env.SMOKE_ORGANIZER_EMAIL && env.SMOKE_ORGANIZER_PASSWORD;

async function signIn(email, password) {
  const res = await fetch(`${LIVE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: LIVE_URL },
    body: JSON.stringify({ email, password }),
  });
  expect(res.status).toBe(200);
  const cookie = res.headers.get('set-cookie').split(';')[0];
  return (path, init = {}) =>
    fetch(`${LIVE_URL}/api${path}`, { ...init, headers: { cookie, origin: LIVE_URL, 'content-type': 'application/json', ...init.headers } });
}

describe('deployment', () => {
  it('AC-20 keeps frontend, backend and numbered migrations in the repository', () => {
    for (const path of ['client/index.html', 'client/src/App.jsx', 'src/app.js', 'src/server.js', 'Dockerfile']) {
      expect(existsSync(path), path).toBe(true);
    }
    const migrations = readdirSync('migrations');
    expect(migrations.length).toBeGreaterThanOrEqual(4);
    for (const name of migrations) expect(name).toMatch(/^\d{3}_[a-z0-9_]+\.sql$/);
    // Production refuses to start without a real database URL (see src/config/env.js).
    expect(readFileSync('src/config/env.js', 'utf8')).toMatch(/isProduction && !env\.DATABASE_URL/);
  });

  it.skipIf(!LIVE_URL)('AC-20 checks public deployment and database persistence', async () => {
    expect(LIVE_URL.startsWith('https://')).toBe(true);
    const health = await fetch(`${LIVE_URL}/health`, { signal: AbortSignal.timeout(90_000) });
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok', database: 'ok' });
    const page = await fetch(LIVE_URL);
    expect(await page.text()).toContain('<title>EventHub');
  });

  it.skipIf(!LIVE_URL || !accounts)('AC-43 demonstrates production user flows and fallback', async () => {
    const student = await signIn(env.SMOKE_STUDENT_EMAIL, env.SMOKE_STUDENT_PASSWORD);
    const { items } = await (await student('/events')).json();
    expect(items.length).toBeGreaterThan(0);

    const full = items.find((e) => e.freeSeats === 0 && !e.isRegistered);
    if (full) expect((await student(`/events/${full.id}/registrations`, { method: 'POST' })).status).toBe(409);

    const open = items.find((e) => e.freeSeats > 0 && !e.isRegistered);
    if (open) {
      expect((await student(`/events/${open.id}/registrations`, { method: 'POST' })).status).toBe(201);
      expect((await student(`/events/${open.id}/registrations/me`, { method: 'DELETE' })).status).toBe(204);
    }

    const organizer = await signIn(env.SMOKE_ORGANIZER_EMAIL, env.SMOKE_ORGANIZER_PASSWORD);
    const draft = await (await organizer('/ai/event-draft', { method: 'POST', body: JSON.stringify({ text: 'Уъркшоп по React за начинаещи' }) })).json();
    expect(['model', 'fallback']).toContain(draft.source);
    expect(draft.draft.title.length).toBeGreaterThanOrEqual(3);
  });
});
