import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DAY, DEMO_IDS, makeApp, newEventInput, seedDemo, signedInAgent, testPool } from '../helpers/db.js';

const pool = testPool();
afterAll(() => pool.end());
beforeEach(() => seedDemo(pool));

describe('organizer API', () => {
  it('AC-12 creates event in own club', async () => {
    const { app } = makeApp(pool);
    const organizer = await signedInAgent(app, 'organizer1');
    const res = await organizer.post('/api/events').send(newEventInput(DEMO_IDS.clubCode)).expect(201);
    expect(res.body.event).toMatchObject({
      title: 'Уъркшоп по React',
      club: { id: DEMO_IDS.clubCode, name: 'Клуб по програмиране' },
      capacity: 25,
      freeSeats: 25,
      isOwner: true,
    });

    // A student sees it in the upcoming list, read back from the database.
    const student = await signedInAgent(app, 'student2');
    const { body } = await student.get('/api/events').expect(200);
    expect(body.items.map((e) => e.id)).toContain(res.body.event.id);
    expect(body.items.find((e) => e.id === res.body.event.id).isOwner).toBe(false);
  });

  it('AC-13 updates own event', async () => {
    const { app } = makeApp(pool);
    const organizer = await signedInAgent(app, 'organizer2');
    const startsAt = new Date(Date.now() + 12 * DAY);
    const patch = {
      title: 'Голямото почистване на парка',
      description: 'Почистваме целия парк, с повече хора и повече чували.',
      location: 'Северният вход на парка',
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 3 * 60 * 60 * 1000).toISOString(),
      capacity: 40,
    };
    const res = await organizer.patch(`/api/events/${DEMO_IDS.eventCleanup}`).send(patch).expect(200);
    expect(res.body.event).toMatchObject({ ...patch, freeSeats: 40 });

    // Read straight from the table, as a reload would.
    const { rows } = await pool.query('SELECT title, description, location, starts_at, capacity FROM events WHERE id = $1', [
      DEMO_IDS.eventCleanup,
    ]);
    expect(rows[0]).toMatchObject({ title: patch.title, description: patch.description, location: patch.location, capacity: 40 });
    expect(rows[0].starts_at.toISOString()).toBe(patch.startsAt);
  });

  it('lists only the organizer’s own clubs and creates a new one', async () => {
    const { app } = makeApp(pool);
    const organizer = await signedInAgent(app, 'organizer1');
    const mine = (await organizer.get('/api/clubs/me').expect(200)).body.items;
    expect(mine).toEqual([{ id: DEMO_IDS.clubCode, name: 'Клуб по програмиране', description: expect.any(String) }]);

    const created = await organizer.post('/api/clubs').send({ name: 'Шахматен клуб' }).expect(201);
    expect(created.body.club).toMatchObject({ name: 'Шахматен клуб', description: '' });
    expect((await organizer.get('/api/clubs/me')).body.items).toHaveLength(2);
  });

  it('deletes an own event and shows attendees only to its organizer', async () => {
    const { app } = makeApp(pool);
    const organizer = await signedInAgent(app, 'organizer2');
    const attendees = await organizer.get(`/api/events/${DEMO_IDS.eventGames}/attendees`).expect(200);
    expect(attendees.body.items.map((a) => a.email).sort()).toEqual(['student1@eventhub.test', 'student2@eventhub.test']);

    const student = await signedInAgent(app, 'student1');
    await student.get(`/api/events/${DEMO_IDS.eventGames}/attendees`).expect(403);

    await organizer.delete(`/api/events/${DEMO_IDS.eventGames}`).expect(204);
    await organizer.get(`/api/events/${DEMO_IDS.eventGames}`).expect(404);
  });
});
