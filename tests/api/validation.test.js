import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DAY, DEMO_IDS, makeApp, newEventInput, seedDemo, signedInAgent, testPool } from '../helpers/db.js';

const pool = testPool();
afterAll(() => pool.end());
beforeEach(() => seedDemo(pool));

const eventCount = async () => (await pool.query('SELECT count(*)::int AS n FROM events')).rows[0].n;

describe('POST /api/events validation', () => {
  it('AC-19 rejects invalid event input', async () => {
    const { app } = makeApp(pool);
    const organizer = await signedInAgent(app, 'organizer1');
    const valid = newEventInput(DEMO_IDS.clubCode);
    const { location, ...withoutLocation } = valid;
    expect(location).toBeTruthy();

    const cases = [
      [{ ...valid, startsAt: new Date(Date.now() - DAY).toISOString() }, 'startsAt', 'Началото трябва да е в бъдещето.'],
      [{ ...valid, capacity: -5 }, 'capacity', 'Капацитетът трябва да е цяло число от 1 до 500.'],
      [{ ...valid, capacity: 501 }, 'capacity', 'Капацитетът трябва да е цяло число от 1 до 500.'],
      [{ ...valid, capacity: 2.5 }, 'capacity', 'Капацитетът трябва да е цяло число от 1 до 500.'],
      [withoutLocation, 'location', 'Мястото трябва да е между 3 и 160 символа.'],
      [{ ...valid, category: 'party' }, 'category', 'Изберете категория от списъка.'],
      [{ ...valid, endsAt: valid.startsAt }, 'endsAt', 'Краят трябва да е след началото.'],
      [{ ...valid, startsAt: 'не е дата' }, 'startsAt', 'Началото не е валидна дата.'],
      [{ ...valid, clubId: 'club-1' }, 'clubId', 'Изберете клуб.'],
      [{ ...valid, title: '  ' }, 'title', 'Заглавието трябва да е между 3 и 100 символа.'],
      [{ ...valid, description: 'кратко' }, 'description', 'Описанието трябва да е между 10 и 2000 символа.'],
    ];
    for (const [body, field, message] of cases) {
      const res = await organizer.post('/api/events').send(body);
      expect(res.status, field).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.fields[field]).toBe(message);
      expect(res.body.error.message).toEqual(expect.any(String));
    }

    const empty = await organizer.post('/api/events').send({});
    expect(empty.status).toBe(400);
    expect(Object.keys(empty.body.error.fields).sort()).toEqual(
      ['capacity', 'category', 'clubId', 'description', 'endsAt', 'location', 'startsAt', 'title'].sort(),
    );
    expect(await eventCount()).toBe(3);
  });
});
