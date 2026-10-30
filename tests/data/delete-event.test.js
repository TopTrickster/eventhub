import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DEMO_IDS, demoUser, makeServices, registrationCount, seedDemo, testPool } from '../helpers/db.js';

const pool = testPool();
afterAll(() => pool.end());
beforeEach(() => seedDemo(pool));

const { events } = makeServices(pool);

describe('deleting an event', () => {
  it('AC-16 deletes own event with registrations', async () => {
    expect(await registrationCount(pool, DEMO_IDS.eventGames)).toBe(2);

    // Somebody else's attempt changes nothing.
    await expect(events.deleteEvent(demoUser('organizer1'), DEMO_IDS.eventGames)).rejects.toMatchObject({ status: 403 });
    expect(await registrationCount(pool, DEMO_IDS.eventGames)).toBe(2);

    await events.deleteEvent(demoUser('organizer2'), DEMO_IDS.eventGames);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM events WHERE id = $1', [DEMO_IDS.eventGames]);
    expect(rows[0].n).toBe(0);
    // The cascade removed the registrations in the same statement; nobody else's rows went.
    expect(await registrationCount(pool, DEMO_IDS.eventGames)).toBe(0);
    expect(await registrationCount(pool, DEMO_IDS.eventHackathon)).toBe(1);
  });
});
