// The ownership rules live in the services, so they hold for any caller. These tests call
// the services directly, with no HTTP request and no route in between.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DEMO_IDS, demoUser, makeServices, registrationCount, seedDemo, testPool } from '../helpers/db.js';

const pool = testPool();
afterAll(() => pool.end());
beforeEach(() => seedDemo(pool));

const { events, registrations } = makeServices(pool);

describe('ownership without HTTP', () => {
  it('AC-26 enforces ownership without HTTP', async () => {
    const stranger = demoUser('organizer1');
    const snapshot = async () => (await pool.query('SELECT * FROM events WHERE id = $1', [DEMO_IDS.eventGames])).rows[0];
    const before = await snapshot();

    await expect(events.updateEvent(stranger, DEMO_IDS.eventGames, { title: 'Превзето' })).rejects.toMatchObject({ status: 403 });
    await expect(events.deleteEvent(stranger, DEMO_IDS.eventGames)).rejects.toMatchObject({ status: 403 });
    await expect(events.listAttendees(stranger, DEMO_IDS.eventGames)).rejects.toMatchObject({ status: 403 });
    expect(await snapshot()).toEqual(before);

    // cancelMine takes no user id: student 2 cancelling the hackathon can only mean student 2's
    // own row, which does not exist, so student 1's registration is untouched.
    await expect(registrations.cancelMine(demoUser('student2'), DEMO_IDS.eventHackathon)).rejects.toMatchObject({ status: 404 });
    expect(await registrationCount(pool, DEMO_IDS.eventHackathon, DEMO_IDS.student1)).toBe(1);
  });
});
