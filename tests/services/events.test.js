import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DAY, DEMO_IDS, demoUser, makeServices, newEventInput, seedDemo, testPool } from '../helpers/db.js';

const pool = testPool();
afterAll(() => pool.end());
beforeEach(() => seedDemo(pool));

const { events } = makeServices(pool);
const eventRow = async (id) => (await pool.query('SELECT * FROM events WHERE id = $1', [id])).rows[0];

describe('eventService', () => {
  it('AC-14 rejects changing foreign event', async () => {
    const before = await eventRow(DEMO_IDS.eventCleanup);
    const intruder = demoUser('organizer1'); // owns the code club, not the culture club's events

    await expect(events.updateEvent(intruder, DEMO_IDS.eventCleanup, { title: 'Чуждо заглавие' })).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });
    // Ownership is checked before the body: an invalid body still answers 403, not 400.
    await expect(events.updateEvent(intruder, DEMO_IDS.eventCleanup, { capacity: -1 })).rejects.toMatchObject({ status: 403 });
    await expect(events.deleteEvent(intruder, DEMO_IDS.eventCleanup)).rejects.toMatchObject({ status: 403 });
    await expect(events.updateEvent(demoUser('student1'), DEMO_IDS.eventCleanup, { title: 'Студентско' })).rejects.toMatchObject({
      status: 403,
    });

    expect(await eventRow(DEMO_IDS.eventCleanup)).toEqual(before);
  });

  it('AC-15 rejects capacity below registrations', async () => {
    const owner = demoUser('organizer2');
    await expect(events.updateEvent(owner, DEMO_IDS.eventGames, { capacity: 1 })).rejects.toMatchObject({
      status: 409,
      code: 'CAPACITY_BELOW_REGISTRATIONS',
    });
    expect((await eventRow(DEMO_IDS.eventGames)).capacity).toBe(2);

    // Equal to the registrations is fine.
    const updated = await events.updateEvent(owner, DEMO_IDS.eventGames, { capacity: 2, summary: '' });
    expect(updated).toMatchObject({ capacity: 2, freeSeats: 0, summary: '' });
  });

  it('AC-17 restricts attendee list to organizer', async () => {
    const list = await events.listAttendees(demoUser('organizer2'), DEMO_IDS.eventGames);
    expect(list).toEqual([
      expect.objectContaining({ userId: DEMO_IDS.student1, email: 'student1@eventhub.test' }),
      expect.objectContaining({ userId: DEMO_IDS.student2, email: 'student2@eventhub.test' }),
    ]);
    for (const other of ['organizer1', 'student1', 'student2']) {
      await expect(events.listAttendees(demoUser(other), DEMO_IDS.eventGames)).rejects.toMatchObject({ status: 403 });
    }
    await expect(events.listAttendees(demoUser('organizer2'), 'x')).rejects.toMatchObject({ status: 404 });
    // What everybody else sees is a count.
    const publicView = await events.getEvent(demoUser('student1'), DEMO_IDS.eventGames);
    expect(publicView).toMatchObject({ registeredCount: 2, freeSeats: 0 });
    expect(JSON.stringify(publicView)).not.toContain('@');
  });

  it('validates a partial update against the stored dates', async () => {
    const owner = demoUser('organizer1');
    const stored = await eventRow(DEMO_IDS.eventHackathon);

    const endBeforeStart = new Date(stored.starts_at.getTime() - DAY).toISOString();
    await expect(events.updateEvent(owner, DEMO_IDS.eventHackathon, { endsAt: endBeforeStart })).rejects.toMatchObject({
      status: 400,
      details: { fields: { endsAt: 'Краят трябва да е след началото.' } },
    });
    const pastStart = new Date(Date.now() - DAY).toISOString();
    await expect(events.updateEvent(owner, DEMO_IDS.eventHackathon, { startsAt: pastStart })).rejects.toMatchObject({
      details: { fields: { startsAt: 'Началото трябва да е в бъдещето.' } },
    });
    await expect(events.updateEvent(owner, DEMO_IDS.eventHackathon, { title: 'ab', category: 'party' })).rejects.toMatchObject({
      message: 'Заглавието трябва да е между 3 и 100 символа.',
      details: { fields: { title: expect.any(String), category: expect.any(String) } },
    });

    // Moving the end later on its own is allowed; the stored start is still in the future.
    const laterEnd = new Date(stored.ends_at.getTime() + 60 * 60 * 1000).toISOString();
    const updated = await events.updateEvent(owner, DEMO_IDS.eventHackathon, { endsAt: laterEnd, category: 'other' });
    expect(updated).toMatchObject({ endsAt: laterEnd, category: 'other' });
  });

  it('answers 404 for missing or malformed ids', async () => {
    const owner = demoUser('organizer1');
    const missing = '00000000-0000-4000-8000-00000000ffff';
    await expect(events.getEvent(owner, missing)).rejects.toMatchObject({ status: 404 });
    await expect(events.getEvent(owner, 42)).rejects.toMatchObject({ status: 404 });
    await expect(events.updateEvent(owner, missing, {})).rejects.toMatchObject({ status: 404 });
    await expect(events.updateEvent(owner, 'bad', {})).rejects.toMatchObject({ status: 404 });
    await expect(events.deleteEvent(owner, missing)).rejects.toMatchObject({ status: 404 });
    await expect(events.deleteEvent(owner, 'bad')).rejects.toMatchObject({ status: 404 });
    await expect(events.listAttendees(owner, missing)).rejects.toMatchObject({ status: 404 });
  });

  it('requires a signed-in user for every read and write', async () => {
    await expect(events.listUpcomingEvents(null)).rejects.toMatchObject({ status: 401 });
    await expect(events.getEvent(null, DEMO_IDS.eventGames)).rejects.toMatchObject({ status: 401 });
    await expect(events.createEvent(null, newEventInput(DEMO_IDS.clubCode))).rejects.toMatchObject({ status: 401 });
    await expect(events.updateEvent(null, DEMO_IDS.eventGames, {})).rejects.toMatchObject({ status: 401 });
    await expect(events.deleteEvent(null, DEMO_IDS.eventGames)).rejects.toMatchObject({ status: 401 });
    await expect(events.listAttendees(null, DEMO_IDS.eventGames)).rejects.toMatchObject({ status: 401 });
  });

  it('creates an event without a summary, which then defaults to empty', async () => {
    const { summary, ...input } = newEventInput(DEMO_IDS.clubCode);
    expect(summary).toBeTruthy();
    const created = await events.createEvent(demoUser('organizer1'), input);
    expect(created).toMatchObject({ summary: '', isOwner: true, isRegistered: false });
  });
});
