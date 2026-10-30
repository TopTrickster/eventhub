// EventHub tools for the MCP server from Exercise 1. This module is not a server: the
// protocol loop (initialize, tools/list, tools/call, JSON-RPC errors) is in server.js.
// It gives that loop three things:
//
//   eventhubTools           the definitions to append to your tools/list result
//   isEventhubTool(name)    whether a tools/call belongs here
//   callEventhubTool(...)   runs one, returning a tools/call result ({ content, isError? })
//                           or throwing ToolArgumentError, which your loop sends as a
//                           JSON-RPC error with error.code === -32602
//
// Every tool calls the same function in src/services that the matching HTTP route calls,
// on behalf of the one ordinary user whose session token is in MCP_TOKEN. There is no
// admin token and no shortcut into src/data: a tool may do exactly what that person may.
import { loadConfig, loadDotEnv } from '../src/config/env.js';
import { AppError } from '../src/services/errors.js';
import { createServicesFromConfig } from '../src/services/index.js';

const eventIdSchema = {
  type: 'object',
  properties: {
    event_id: { type: 'string', format: 'uuid', description: 'The id of the event, as upcoming_events returns it.' },
  },
  required: ['event_id'],
  additionalProperties: false,
};

const noArguments = { type: 'object', properties: {}, additionalProperties: false };

export const eventhubTools = [
  {
    name: 'upcoming_events',
    description:
      'Lists the EventHub club events that have not started yet, soonest first, with club, place, start time and free seats. Use it when asked what events are coming up.',
    inputSchema: noArguments,
  },
  {
    name: 'my_registrations',
    description:
      'Lists the upcoming EventHub events the signed-in user is registered for. It only ever shows that user’s own registrations.',
    inputSchema: noArguments,
  },
  {
    name: 'register_for_event',
    description:
      'Registers the signed-in user for one upcoming EventHub event if a seat is still free. Fails with a readable message when the event is full, past or already booked.',
    inputSchema: eventIdSchema,
  },
  {
    name: 'cancel_registration',
    description:
      'Cancels the signed-in user’s own registration for one EventHub event and frees the seat. It cannot touch anybody else’s registration.',
    inputSchema: eventIdSchema,
  },
  {
    name: 'suggest_event_draft',
    description:
      'Organizers only: turns one line of text into a suggested event title, summary and category. Nothing is saved; dates, place and seats are left to the organizer.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', minLength: 10, maxLength: 500, description: 'What the event is about, in a sentence.' } },
      required: ['text'],
      additionalProperties: false,
    },
  },
];

const names = new Set(eventhubTools.map((tool) => tool.name));

export const isEventhubTool = (name) => names.has(name);

/** Invalid arguments are the caller's mistake, not a business failure: JSON-RPC -32602. */
export class ToolArgumentError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ToolArgumentError';
    this.code = -32602;
  }
}

function requireString(args, key) {
  if (typeof args?.[key] !== 'string' || args[key].length === 0) {
    throw new ToolArgumentError(`Argument "${key}" is required and must be a non-empty string.`);
  }
  return args[key];
}

const ok = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const failure = (text) => ({ content: [{ type: 'text', text }], isError: true });

/** Each tool, and the service function it shares with the HTTP API. */
const HANDLERS = {
  upcoming_events: async (services, user) => ({ items: await services.events.listUpcomingEvents(user) }),
  my_registrations: async (services, user) => ({ items: await services.registrations.listMine(user) }),
  register_for_event: async (services, user, args) => ({
    registration: await services.registrations.registerForEvent(user, requireString(args, 'event_id')),
  }),
  cancel_registration: async (services, user, args) => {
    await services.registrations.cancelMine(user, requireString(args, 'event_id'));
    return { cancelled: true };
  },
  suggest_event_draft: (services, user, args) => services.drafts.createDraft(user, requireString(args, 'text')),
};

/**
 * Runs one EventHub tool as the user behind `token`. Business failures (event full,
 * not yours, signed out) come back as a result with isError: true, so a model can read
 * them and the server keeps running.
 */
export async function callEventhubTool(services, token, name, args) {
  const handler = HANDLERS[name];
  if (!handler) throw new ToolArgumentError(`Unknown tool: ${name}`);
  try {
    const user = await services.auth.getUserBySessionToken(token);
    if (!user) return failure('MCP_TOKEN is missing or is not a valid session. Sign in to EventHub and run npm run mcp:token.');
    return ok(await handler(services, user, args));
  } catch (error) {
    if (error instanceof ToolArgumentError) throw error;
    if (error instanceof AppError) return failure(`${error.code}: ${error.message}`);
    // stderr only, and only the error type: stdout belongs to JSON-RPC.
    console.error(`[eventhub-tools] ${name} failed: ${error.name}`);
    return failure('EventHub could not complete the request. Try again later.');
  }
}

let shared;

/**
 * The services for a real server process, built on first use, so `initialize` and
 * `tools/list` work even where no database is configured (the CI conformance check).
 */
export function eventhubServices(env = process.env) {
  if (!shared) {
    loadDotEnv();
    shared = createServicesFromConfig(loadConfig(env)).services;
  }
  return shared;
}

/** What your tools/call handler calls for an EventHub tool. */
export async function runEventhubTool(name, args, env = process.env) {
  let services;
  try {
    services = eventhubServices(env);
  } catch (error) {
    console.error(`[eventhub-tools] not configured: ${error.message}`);
    return failure('EventHub is not configured on this machine: set DATABASE_URL and MCP_TOKEN.');
  }
  return callEventhubTool(services, env.MCP_TOKEN, name, args);
}
