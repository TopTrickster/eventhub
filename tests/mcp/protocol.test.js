// Talks to the real MCP server process over stdio, the way a client does: the protocol
// loop in mcp-server/server.js, with the EventHub tools from eventhub-tools.js plugged in.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { eventhubTools } from '../../mcp-server/eventhub-tools.js';
import { DEMO_IDS, makeServices, seedDemo, testPool } from '../helpers/db.js';

// MCP_SERVER_SCRIPT lets the same tests point at another server file while you develop one.
const SERVER = process.env.MCP_SERVER_SCRIPT || 'mcp-server/server.js';
const pool = testPool();
let server;

function startServer(env) {
  const child = spawn(process.execPath, [SERVER], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  const replies = [];
  const junk = [];
  let buffer = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      try {
        replies.push(JSON.parse(line));
      } catch {
        junk.push(line);
      }
    }
  });
  child.stderr.resume();
  const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
  const reply = async (id, ms = 10_000) => {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      const found = replies.find((r) => r.id === id);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`no reply to request ${id}`);
  };
  const call = async (id, method, params) => {
    send({ jsonrpc: '2.0', id, method, ...(params && { params }) });
    return reply(id);
  };
  return { child, send, call, replies, junk };
}

beforeAll(async () => {
  await seedDemo(pool);
  const token = (await makeServices(pool).auth.createSession(DEMO_IDS.organizer2)).token;
  if (existsSync(SERVER)) server = startServer({ DATABASE_URL: inject('databaseUrl'), MCP_TOKEN: token, NODE_ENV: 'test' });
});
afterAll(async () => {
  server?.child.kill();
  await pool.end();
});
beforeEach(() => {
  expect(existsSync(SERVER), `${SERVER} is missing: add your Exercise 1 server and wire in mcp-server/eventhub-tools.js`).toBe(true);
});

describe('MCP server over stdio', () => {
  it('AC-32 exposes legacy and EventHub tools', async () => {
    const init = await server.call(1, 'initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'eventhub-tests', version: '1.0.0' },
    });
    expect(init.result).toMatchObject({ protocolVersion: expect.any(String), serverInfo: { name: expect.any(String) }, capabilities: { tools: {} } });
    server.send({ jsonrpc: '2.0', method: 'notifications/initialized' });

    const list = await server.call(2, 'tools/list');
    const tools = list.result.tools;
    const names = tools.map((t) => t.name);
    expect(names).toContain('find_lecture');
    for (const tool of eventhubTools) expect(names).toContain(tool.name);
    // Exercise 1's two tools plus at least three project tools.
    expect(tools.length).toBeGreaterThanOrEqual(2 + 3);
    for (const tool of tools) {
      expect(tool.description.length, tool.name).toBeGreaterThanOrEqual(20);
      expect(tool.inputSchema.type, tool.name).toBe('object');
    }

    const lecture = await server.call(3, 'tools/call', { name: 'find_lecture', arguments: { number: 5 } });
    expect(lecture.result.content[0].text).toContain('What the agent built, part 1');

    const events = await server.call(4, 'tools/call', { name: 'upcoming_events', arguments: {} });
    expect(JSON.parse(events.result.content[0].text).items).toHaveLength(3);
  });

  it('AC-35 distinguishes RPC and business errors', async () => {
    const unknownTool = await server.call(10, 'tools/call', { name: 'no_such_tool', arguments: {} });
    expect(unknownTool.error.code).toBe(-32602);

    const badArguments = await server.call(11, 'tools/call', { name: 'register_for_event', arguments: {} });
    expect(badArguments.error.code).toBe(-32602);

    const unknownMethod = await server.call(12, 'nonsense/method');
    expect(unknownMethod.error.code).toBe(-32601);

    // A business failure is a normal result with isError, and the server keeps answering.
    const full = await server.call(13, 'tools/call', { name: 'register_for_event', arguments: { event_id: DEMO_IDS.eventGames } });
    expect(full.error).toBeUndefined();
    expect(full.result.isError).toBe(true);
    expect(full.result.content[0].text).toMatch(/EVENT_FULL/);

    const still = await server.call(14, 'tools/list');
    expect(still.result.tools.length).toBeGreaterThan(0);
    expect(server.junk, 'nothing but JSON-RPC on stdout').toEqual([]);
  });
});
