import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  DEMO_IDS,
  demoUser,
  insertPastEvent,
  makeServices,
  registrationCount,
  seedDemo,
  testPool,
} from '../helpers/db.js';

const pool = testPool();
afterAll(() => pool.end());
beforeEach(() => seedDemo(pool));

const services = makeServices(pool);
const { registrations } = services;

describe('registrationService', () => {
  it('AC-5 rejects duplicate registration', async () => {
    const student1 = demoUser('student1');
    await expect(registrations.registerForEvent(student1, DEMO_IDS.eventHackathon)).rejects.toMatchObject({
      status: 409,
      code: 'ALREADY_REGISTERED',
    });
    expect(await registrationCount(pool, DEMO_IDS.eventHackathon, student1.id)).toBe(1);
  });

  it('AC-6 rejects full event', async () => {
    const organizer = demoUser('organizer1');
    const before = await registrationCount(pool, DEMO_IDS.eventGames);
    await expect(registrations.registerForEvent(organizer, DEMO_IDS.eventGames)).rejects.toMatchObject({
      status: 409,
      code: 'EVENT_FULL',
      message: 'Няма свободни места за това събитие.',
    });
    expect(await registrationCount(pool, DEMO_IDS.eventGames)).toBe(before);
  });

  it('AC-11 rejects past or missing event', async () => {
    const student2 = demoUser('student2');
    const pastId = await insertPastEvent(pool);
    await expect(registrations.registerForEvent(student2, pastId)).rejects.toMatchObject({
      status: 409,
      code: 'EVENT_NOT_UPCOMING',
    });
    await expect(
      registrations.registerForEvent(student2, '00000000-0000-4000-8000-00000000ffff'),
    ).rejects.toMatchObject({ status: 404, code: 'EVENT_NOT_FOUND' });
    await expect(registrations.registerForEvent(student2, 'not-a-uuid')).rejects.toMatchObject({ status: 404 });
    expect(await registrationCount(pool, pastId)).toBe(0);
  });

  it('refuses every operation without a signed-in user', async () => {
    await expect(registrations.registerForEvent(null, DEMO_IDS.eventHackathon)).rejects.toMatchObject({ status: 401 });
    await expect(registrations.cancelMine(undefined, DEMO_IDS.eventHackathon)).rejects.toMatchObject({ status: 401 });
    await expect(registrations.listMine(null)).rejects.toMatchObject({ status: 401 });
  });

  it('registers, reports the seats left, and lists only upcoming own registrations', async () => {
    const student2 = demoUser('student2');
    const result = await registrations.registerForEvent(student2, DEMO_IDS.eventCleanup);
    expect(result).toEqual({ eventId: DEMO_IDS.eventCleanup, registeredAt: expect.any(String), freeSeats: 19 });

    await pool.query('INSERT INTO registrations (event_id, user_id) VALUES ($1, $2)', [await insertPastEvent(pool), student2.id]);
    const mine = await registrations.listMine(student2);
    expect(mine.map((e) => e.id)).toEqual([DEMO_IDS.eventGames, DEMO_IDS.eventCleanup]);
    expect(mine.every((e) => e.isRegistered)).toBe(true);
  });

  it('cancelMine answers 404 for a malformed id or an event the user is not registered for', async () => {
    const student2 = demoUser('student2');
    await expect(registrations.cancelMine(student2, 'nope')).rejects.toMatchObject({
      status: 404,
      code: 'REGISTRATION_NOT_FOUND',
    });
    await expect(registrations.cancelMine(student2, DEMO_IDS.eventHackathon)).rejects.toMatchObject({ status: 404 });
  });
});
