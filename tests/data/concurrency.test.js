import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPool } from '../../src/data/db.js';
import { inject } from 'vitest';
import { DEMO_IDS, demoUser, insertMember, makeServices, registrationCount, seedDemo, testPool } from '../helpers/db.js';

// A pool big enough that every request below really runs on its own connection at once.
const pool = createPool(inject('databaseUrl'), { max: 20 });
const setupPool = testPool();
afterAll(async () => {
  await pool.end();
  await setupPool.end();
});
beforeEach(() => seedDemo(setupPool));

const { registrations } = makeServices(pool);

describe('registerForEvent under concurrency', () => {
  it('AC-7 prevents overbooking concurrently', async () => {
    // One seat left: the hackathon with capacity 2 and student 1 already in.
    await setupPool.query('UPDATE events SET capacity = 2 WHERE id = $1', [DEMO_IDS.eventHackathon]);

    const results = await Promise.allSettled([
      registrations.registerForEvent(demoUser('student2'), DEMO_IDS.eventHackathon),
      registrations.registerForEvent(demoUser('organizer2'), DEMO_IDS.eventHackathon),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ status: 409, code: 'EVENT_FULL' });
    expect(await registrationCount(setupPool, DEMO_IDS.eventHackathon)).toBe(2);
  });

  it('AC-7 never exceeds capacity when many people race for a few seats', async () => {
    await setupPool.query('UPDATE events SET capacity = 5 WHERE id = $1', [DEMO_IDS.eventCleanup]);
    const people = await Promise.all(Array.from({ length: 15 }, (_, i) => insertMember(setupPool, `racer${i}@eventhub.test`)));

    const results = await Promise.allSettled(people.map((person) => registrations.registerForEvent(person, DEMO_IDS.eventCleanup)));

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
    expect(results.filter((r) => r.status === 'rejected').every((r) => r.reason.code === 'EVENT_FULL')).toBe(true);
    expect(await registrationCount(setupPool, DEMO_IDS.eventCleanup)).toBe(5);
  });
});
