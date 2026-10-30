import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DEMO_IDS, insertPastEvent, makeApp, seedDemo, signedInAgent, testPool } from '../helpers/db.js';

const pool = testPool();
afterAll(() => pool.end());
beforeEach(() => seedDemo(pool));

describe('GET /api/events', () => {
  it('AC-2 reads seeded events from database', async () => {
    const { app } = makeApp(pool);
    const agent = await signedInAgent(app, 'student2');

    const before = await agent.get('/api/events').expect(200);
    expect(before.body.items.map((e) => e.id).sort()).toEqual(
      [DEMO_IDS.eventHackathon, DEMO_IDS.eventGames, DEMO_IDS.eventCleanup].sort(),
    );

    // Delete one seed row straight in the database: the API reflects the table, not a cache.
    await pool.query('DELETE FROM events WHERE id = $1', [DEMO_IDS.eventCleanup]);
    const after = await agent.get('/api/events').expect(200);
    expect(after.body.items.map((e) => e.id)).not.toContain(DEMO_IDS.eventCleanup);
    expect(after.body.items).toHaveLength(2);
  });

  it('AC-3 lists upcoming events with free seats', async () => {
    const pastId = await insertPastEvent(pool);
    const { app } = makeApp(pool);
    const agent = await signedInAgent(app, 'student2');

    const { body } = await agent.get('/api/events').expect(200);
    const ids = body.items.map((e) => e.id);
    expect(ids).not.toContain(pastId);
    expect(ids).toEqual([DEMO_IDS.eventGames, DEMO_IDS.eventHackathon, DEMO_IDS.eventCleanup]);

    const starts = body.items.map((e) => Date.parse(e.startsAt));
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    for (const event of body.items) {
      expect(event).toMatchObject({
        title: expect.any(String),
        location: expect.any(String),
        capacity: expect.any(Number),
        freeSeats: expect.any(Number),
        club: { id: expect.any(String), name: expect.any(String) },
      });
      expect(Date.parse(event.startsAt)).toBeGreaterThan(Date.now());
    }
    const games = body.items.find((e) => e.id === DEMO_IDS.eventGames);
    expect(games).toMatchObject({ capacity: 2, freeSeats: 0, registeredCount: 2, isRegistered: true });
    const hackathon = body.items.find((e) => e.id === DEMO_IDS.eventHackathon);
    expect(hackathon).toMatchObject({ capacity: 30, freeSeats: 29, isRegistered: false });
    // Seat counts only: who took the seats is not part of the public event.
    expect(JSON.stringify(body)).not.toContain('student1@eventhub.test');
  });

  it('returns one event with its free seats, and 404 for an unknown or malformed id', async () => {
    const { app } = makeApp(pool);
    const agent = await signedInAgent(app, 'student1');
    const { body } = await agent.get(`/api/events/${DEMO_IDS.eventHackathon}`).expect(200);
    expect(body.event).toMatchObject({ id: DEMO_IDS.eventHackathon, freeSeats: 29, isRegistered: true, isOwner: false });

    const missing = await agent.get('/api/events/00000000-0000-4000-8000-00000000ffff').expect(404);
    expect(missing.body.error).toEqual({ code: 'EVENT_NOT_FOUND', message: 'Събитието не съществува.' });
    await agent.get('/api/events/not-a-uuid').expect(404);
  });
});
