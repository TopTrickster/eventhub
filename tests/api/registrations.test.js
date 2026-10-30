import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DEMO_IDS, makeApp, registrationCount, seedDemo, signedInAgent, testPool } from '../helpers/db.js';

const pool = testPool();
afterAll(() => pool.end());
beforeEach(() => seedDemo(pool));

const freeSeats = async (agent, id) => (await agent.get(`/api/events/${id}`)).body.event.freeSeats;

describe('registrations over HTTP', () => {
  it('AC-4 registers member and decrements free seats', async () => {
    const { app } = makeApp(pool);
    const agent = await signedInAgent(app, 'student2');
    const before = await freeSeats(agent, DEMO_IDS.eventHackathon);

    const res = await agent.post(`/api/events/${DEMO_IDS.eventHackathon}/registrations`).expect(201);
    expect(res.body.registration).toMatchObject({ eventId: DEMO_IDS.eventHackathon, freeSeats: before - 1 });

    expect(await registrationCount(pool, DEMO_IDS.eventHackathon, DEMO_IDS.student2)).toBe(1);
    expect(await freeSeats(agent, DEMO_IDS.eventHackathon)).toBe(before - 1);
  });

  it('AC-8 lists only own registrations', async () => {
    const { app } = makeApp(pool);
    const student1 = await signedInAgent(app, 'student1');
    const student2 = await signedInAgent(app, 'student2');

    const mine1 = (await student1.get('/api/registrations/me').expect(200)).body.items.map((e) => e.id);
    const mine2 = (await student2.get('/api/registrations/me').expect(200)).body.items.map((e) => e.id);
    expect(mine1.sort()).toEqual([DEMO_IDS.eventGames, DEMO_IDS.eventHackathon].sort());
    expect(mine2).toEqual([DEMO_IDS.eventGames]);

    const organizer = await signedInAgent(app, 'organizer1');
    expect((await organizer.get('/api/registrations/me').expect(200)).body.items).toEqual([]);
  });

  it('AC-9 cancels own registration', async () => {
    const { app } = makeApp(pool);
    const agent = await signedInAgent(app, 'student1');
    const before = await freeSeats(agent, DEMO_IDS.eventHackathon);

    await agent.delete(`/api/events/${DEMO_IDS.eventHackathon}/registrations/me`).expect(204);
    expect(await registrationCount(pool, DEMO_IDS.eventHackathon, DEMO_IDS.student1)).toBe(0);
    expect(await freeSeats(agent, DEMO_IDS.eventHackathon)).toBe(before + 1);

    // A second cancel finds nothing of this user's to remove.
    const again = await agent.delete(`/api/events/${DEMO_IDS.eventHackathon}/registrations/me`).expect(404);
    expect(again.body.error.code).toBe('REGISTRATION_NOT_FOUND');
  });

  it('maps the business refusals to 409 with a readable message', async () => {
    const { app } = makeApp(pool);
    const agent = await signedInAgent(app, 'organizer1');
    const full = await agent.post(`/api/events/${DEMO_IDS.eventGames}/registrations`).expect(409);
    expect(full.body).toEqual({ error: { code: 'EVENT_FULL', message: 'Няма свободни места за това събитие.' } });
  });
});
