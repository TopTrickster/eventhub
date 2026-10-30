// The EventHub MCP tools and the HTTP API must share one implementation of each rule.
// This file drives the tools module directly (no protocol loop), with a real database.
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { callEventhubTool, eventhubTools, isEventhubTool, runEventhubTool, ToolArgumentError } from '../../mcp-server/eventhub-tools.js';
import { DEMO_IDS, makeApp, makeServices, registrationCount, seedDemo, testPool } from '../helpers/db.js';

const pool = testPool();
afterAll(() => pool.end());
beforeEach(() => seedDemo(pool));

const tokenFor = async (services, userId) => (await services.auth.createSession(userId)).token;
const parse = (result) => JSON.parse(result.content[0].text);

describe('EventHub MCP tools', () => {
  it('AC-33 shares registration service and capacity rule', async () => {
    const services = makeServices(pool);
    const spy = vi.spyOn(services.registrations, 'registerForEvent');
    const { app } = makeApp(pool, { services });

    // The HTTP route and the MCP tool both end in the very same function object.
    const token = await tokenFor(services, DEMO_IDS.student2);
    const viaMcp = await callEventhubTool(services, token, 'register_for_event', { event_id: DEMO_IDS.eventCleanup });
    expect(viaMcp.isError).toBeUndefined();
    expect(parse(viaMcp).registration).toMatchObject({ eventId: DEMO_IDS.eventCleanup, freeSeats: 19 });

    const viaHttp = await request(app)
      .post(`/api/events/${DEMO_IDS.eventHackathon}/registrations`)
      .set('Cookie', `eh_session=${token}`)
      .expect(201);
    expect(viaHttp.body.registration.eventId).toBe(DEMO_IDS.eventHackathon);

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls.map(([user, id]) => [user.id, id])).toEqual([
      [DEMO_IDS.student2, DEMO_IDS.eventCleanup],
      [DEMO_IDS.student2, DEMO_IDS.eventHackathon],
    ]);

    // The capacity rule holds through MCP too: the full event is refused, nothing is written.
    const organizerToken = await tokenFor(services, DEMO_IDS.organizer1);
    const full = await callEventhubTool(services, organizerToken, 'register_for_event', { event_id: DEMO_IDS.eventGames });
    expect(full.isError).toBe(true);
    expect(full.content[0].text).toBe('EVENT_FULL: Няма свободни места за това събитие.');
    expect(await registrationCount(pool, DEMO_IDS.eventGames)).toBe(2);
  });

  it('lists upcoming events and the caller’s own registrations, and cancels', async () => {
    const services = makeServices(pool);
    const token = await tokenFor(services, DEMO_IDS.student1);

    const upcoming = parse(await callEventhubTool(services, token, 'upcoming_events', {}));
    expect(upcoming.items.map((e) => e.id)).toEqual([DEMO_IDS.eventGames, DEMO_IDS.eventHackathon, DEMO_IDS.eventCleanup]);

    const mine = parse(await callEventhubTool(services, token, 'my_registrations', {}));
    expect(mine.items.map((e) => e.id).sort()).toEqual([DEMO_IDS.eventGames, DEMO_IDS.eventHackathon].sort());

    expect(parse(await callEventhubTool(services, token, 'cancel_registration', { event_id: DEMO_IDS.eventHackathon }))).toEqual({
      cancelled: true,
    });
    expect(await registrationCount(pool, DEMO_IDS.eventHackathon, DEMO_IDS.student1)).toBe(0);
  });

  it('suggests an event draft for an organizer through the same draft service', async () => {
    const services = makeServices(pool);
    const token = await tokenFor(services, DEMO_IDS.organizer1);
    const result = parse(await callEventhubTool(services, token, 'suggest_event_draft', { text: 'Турнир по шах за начинаещи в петък' }));
    expect(result).toMatchObject({ source: 'fallback', draft: { category: 'other' } });
  });

  it('describes every tool for a model and validates arguments as a protocol error', async () => {
    expect(eventhubTools.map((t) => t.name)).toEqual([
      'upcoming_events',
      'my_registrations',
      'register_for_event',
      'cancel_registration',
      'suggest_event_draft',
    ]);
    for (const tool of eventhubTools) {
      expect(tool.description.length).toBeGreaterThanOrEqual(20);
      expect(tool.inputSchema.type).toBe('object');
    }
    expect(isEventhubTool('upcoming_events')).toBe(true);
    expect(isEventhubTool('find_lecture')).toBe(false);

    const services = makeServices(pool);
    const token = await tokenFor(services, DEMO_IDS.student1);
    await expect(callEventhubTool(services, token, 'register_for_event', {})).rejects.toBeInstanceOf(ToolArgumentError);
    await expect(callEventhubTool(services, token, 'register_for_event', { event_id: 7 })).rejects.toMatchObject({ code: -32602 });
    await expect(callEventhubTool(services, token, 'suggest_event_draft', undefined)).rejects.toMatchObject({ code: -32602 });
    await expect(callEventhubTool(services, token, 'drop_tables', {})).rejects.toMatchObject({ code: -32602 });
  });

  it('turns an unexpected failure into a tool error on stderr, without crashing', async () => {
    const services = makeServices(pool);
    const token = await tokenFor(services, DEMO_IDS.student1);
    services.events.listUpcomingEvents = vi.fn().mockRejectedValue(new TypeError('boom'));
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await callEventhubTool(services, token, 'upcoming_events', {});
    expect(result).toEqual({ content: [{ type: 'text', text: 'EventHub could not complete the request. Try again later.' }], isError: true });
    expect(stderr).toHaveBeenCalledWith('[eventhub-tools] upcoming_events failed: TypeError');
    stderr.mockRestore();
  });

  it('runs a tool from the environment the server process has', async () => {
    const services = makeServices(pool);
    const token = await tokenFor(services, DEMO_IDS.student1);
    const { inject } = await import('vitest');
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
    const unconfigured = await runEventhubTool('my_registrations', {}, { NODE_ENV: 'production', MCP_TOKEN: token });
    expect(unconfigured).toMatchObject({ isError: true });
    expect(unconfigured.content[0].text).toMatch(/DATABASE_URL/);
    stderr.mockRestore();

    const env = { DATABASE_URL: inject('databaseUrl'), MCP_TOKEN: token, NODE_ENV: 'test' };
    const result = await runEventhubTool('my_registrations', {}, env);
    expect(parse(result).items).toHaveLength(2);
  });
});
