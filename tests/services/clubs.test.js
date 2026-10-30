import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DEMO_IDS, demoUser, makeServices, newEventInput, seedDemo, testPool } from '../helpers/db.js';

const pool = testPool();
afterAll(() => pool.end());
beforeEach(() => seedDemo(pool));

const { clubs, events } = makeServices(pool);
const eventCount = async () => (await pool.query('SELECT count(*)::int AS n FROM events')).rows[0].n;

describe('clubService and who may create what', () => {
  it('AC-18 denies member and foreign-club creation', async () => {
    const student = demoUser('student1');
    await expect(clubs.createClub(student, { name: 'Студентски клуб' })).rejects.toMatchObject({ status: 403 });
    await expect(clubs.listMine(student)).rejects.toMatchObject({ status: 403 });
    await expect(events.createEvent(student, newEventInput(DEMO_IDS.clubCode))).rejects.toMatchObject({ status: 403 });

    // An organizer, but of a different club.
    await expect(events.createEvent(demoUser('organizer2'), newEventInput(DEMO_IDS.clubCode))).rejects.toMatchObject({
      status: 403,
      message: 'Можете да създавате събития само в собствения си клуб.',
    });
    // A club that does not exist is no better.
    await expect(
      events.createEvent(demoUser('organizer2'), newEventInput('00000000-0000-4000-8000-00000000ffff')),
    ).rejects.toMatchObject({ status: 403 });
    expect(await eventCount()).toBe(3);
  });

  it('creates a club for an organizer and validates its fields', async () => {
    const organizer = demoUser('organizer2');
    const club = await clubs.createClub(organizer, { name: '  Клуб по шах  ', description: 'Всеки четвъртък.' });
    expect(club).toEqual({ id: expect.any(String), name: 'Клуб по шах', description: 'Всеки четвъртък.' });
    expect((await clubs.listMine(organizer)).map((c) => c.name)).toEqual(['Културен клуб', 'Клуб по шах']);

    await expect(clubs.createClub(organizer, { name: 'ab' })).rejects.toMatchObject({
      status: 400,
      details: { fields: { name: 'Името на клуба трябва да е между 3 и 100 символа.' } },
    });
    await expect(clubs.createClub(organizer, { name: 'Дълго описание', description: 'x'.repeat(1001) })).rejects.toMatchObject({
      status: 400,
    });
    await expect(clubs.createClub(null, { name: 'Клуб' })).rejects.toMatchObject({ status: 401 });
  });
});
