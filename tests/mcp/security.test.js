// MCP_TOKEN is an ordinary session of one user. These tests check that a tool can do
// exactly what that person can do in the browser, and nothing more.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { callEventhubTool } from '../../mcp-server/eventhub-tools.js';
import { DEMO_IDS, makeServices, registrationCount, seedDemo, testPool } from '../helpers/db.js';

const pool = testPool();
afterAll(() => pool.end());
beforeEach(() => seedDemo(pool));

const services = makeServices(pool);
const tokenFor = async (userId) => (await services.auth.createSession(userId)).token;
const text = (result) => result.content[0].text;

describe('MCP acts as the user behind MCP_TOKEN', () => {
  it('AC-34 enforces session identity and ownership', async () => {
    const student2 = await tokenFor(DEMO_IDS.student2);

    // Student 2's "my registrations" is student 2's, never student 1's.
    const mine = JSON.parse(text(await callEventhubTool(services, student2, 'my_registrations', {})));
    expect(mine.items.map((e) => e.id)).toEqual([DEMO_IDS.eventGames]);

    // Cancelling the hackathon can only mean student 2's own (absent) row; student 1 keeps the seat.
    const cancel = await callEventhubTool(services, student2, 'cancel_registration', { event_id: DEMO_IDS.eventHackathon });
    expect(cancel.isError).toBe(true);
    expect(text(cancel)).toMatch(/^REGISTRATION_NOT_FOUND/);
    expect(await registrationCount(pool, DEMO_IDS.eventHackathon, DEMO_IDS.student1)).toBe(1);

    // A member's token does not unlock the organizer-only tool.
    const draft = await callEventhubTool(services, student2, 'suggest_event_draft', { text: 'Турнир по шах в петък вечерта' });
    expect(draft.isError).toBe(true);
    expect(text(draft)).toMatch(/^FORBIDDEN/);

    // Capacity cannot be bypassed either.
    const full = await callEventhubTool(services, await tokenFor(DEMO_IDS.organizer1), 'register_for_event', {
      event_id: DEMO_IDS.eventGames,
    });
    expect(text(full)).toMatch(/^EVENT_FULL/);
  });

  it('AC-34 refuses every tool without a valid, unexpired session token', async () => {
    const token = await tokenFor(DEMO_IDS.student1);
    for (const bad of [undefined, '', 'made-up-token']) {
      const result = await callEventhubTool(services, bad, 'upcoming_events', {});
      expect(result.isError).toBe(true);
      expect(text(result)).toMatch(/MCP_TOKEN/);
    }
    await services.auth.logout(token);
    expect((await callEventhubTool(services, token, 'upcoming_events', {})).isError).toBe(true);
  });
});
