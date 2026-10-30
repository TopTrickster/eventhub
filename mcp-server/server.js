// The EventHub MCP server: JSON-RPC 2.0 over stdio, one message per line. It grew out of
// Exercise 1: find_lecture and search_lectures read lectures.json, and the EventHub tools
// from eventhub-tools.js run as the one user whose session token is in MCP_TOKEN.
//
//   npm run mcp
//   node mcp-server/check.mjs -- npm run --silent mcp
//
// stdout carries protocol messages and nothing else; diagnostics go to stderr.
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { eventhubTools, isEventhubTool, runEventhubTool, ToolArgumentError } from './eventhub-tools.js';

// A library that prints with console.log would put a non-JSON line into the client's stream.
console.log = console.info = console.debug = console.error;

// Newest first: a client asking for one of these gets it back, any other gets the newest.
const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = { name: 'eventhub', version: '0.1.0' };

// JSON-RPC 2.0 error codes.
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

const lectures = JSON.parse(readFileSync(new URL('./lectures.json', import.meta.url), 'utf8'));

// ---- Exercise 1 tools: read-only, local data ---------------------------------------

const lectureTools = [
  {
    name: 'find_lecture',
    description:
      'Returns the title and topics of one Web Development course lecture by its number (1 to 10). Use it when asked what a given lecture covers.',
    inputSchema: {
      type: 'object',
      properties: { number: { type: 'integer', description: 'The lecture number, from 1 to 10.' } },
      required: ['number'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_lectures',
    description:
      'Finds the course lectures whose title or topics mention a word or phrase, such as "testing" or "OAuth". Use it when the lecture number is not known.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', minLength: 2, maxLength: 100, description: 'A word or phrase to look for.' } },
      required: ['query'],
      additionalProperties: false,
    },
  },
];

const text = (value, isError = false) => ({ content: [{ type: 'text', text: value }], ...(isError && { isError: true }) });
const describeLecture = (lecture) => `Lecture ${lecture.number}: ${lecture.title}\nTopics: ${lecture.topics}`;

const LECTURE_HANDLERS = {
  find_lecture(args) {
    if (!Number.isInteger(args.number)) throw new ToolArgumentError('Argument "number" is required and must be an integer.');
    const lecture = lectures.find((l) => l.number === args.number);
    // A lecture that does not exist is the tool's answer, not a broken request: isError, readable.
    if (!lecture) return text(`There is no lecture ${args.number}. The course has lectures 1 to ${lectures.length}.`, true);
    return text(describeLecture(lecture));
  },
  search_lectures(args) {
    const query = typeof args.query === 'string' ? args.query.trim() : '';
    if (query.length < 2 || query.length > 100) {
      throw new ToolArgumentError('Argument "query" is required and must be 2 to 100 characters.');
    }
    const found = lectures.filter((l) => `${l.title} ${l.topics}`.toLowerCase().includes(query.toLowerCase()));
    return text(found.length ? found.map(describeLecture).join('\n\n') : `No lecture mentions "${query}".`);
  },
};

// ---- Protocol methods ---------------------------------------------------------------

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

async function callTool(params) {
  const name = params?.name;
  const args = params?.arguments ?? {};
  if (typeof name !== 'string') throw new ToolArgumentError('params.name must be the name of a tool.');
  if (!isObject(args)) throw new ToolArgumentError('params.arguments must be an object.');
  if (Object.hasOwn(LECTURE_HANDLERS, name)) return LECTURE_HANDLERS[name](args);
  // EventHub tools resolve to a result (business failures carry isError) or throw
  // ToolArgumentError for bad arguments, which becomes a JSON-RPC error below.
  if (isEventhubTool(name)) return runEventhubTool(name, args);
  throw new ToolArgumentError(`Unknown tool: ${name}`);
}

const METHODS = {
  initialize: (params) => ({
    protocolVersion: PROTOCOL_VERSIONS.includes(params?.protocolVersion) ? params.protocolVersion : PROTOCOL_VERSIONS[0],
    capabilities: { tools: {} },
    serverInfo: SERVER_INFO,
  }),
  ping: () => ({}),
  'tools/list': () => ({ tools: [...lectureTools, ...eventhubTools] }),
  'tools/call': callTool,
};

// ---- The loop -----------------------------------------------------------------------

const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

async function handle(line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return fail(null, PARSE_ERROR, 'Parse error: each line must be one JSON-RPC message.');
  }

  if (!isObject(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    // A response from the client needs no answer: this server never sends requests.
    if (isObject(message) && ('result' in message || 'error' in message)) return;
    return fail(isObject(message) && message.id !== undefined ? message.id : null, INVALID_REQUEST, 'Invalid request: expected a JSON-RPC 2.0 message with a method.');
  }

  // A notification (notifications/initialized, notifications/cancelled, ...) has no id and gets no reply.
  if (!('id' in message)) return;

  const { id, method, params } = message;
  if (!Object.hasOwn(METHODS, method)) return fail(id, METHOD_NOT_FOUND, `Method not found: ${method}`);
  try {
    reply(id, await METHODS[method](params));
  } catch (error) {
    if (error instanceof ToolArgumentError) return fail(id, INVALID_PARAMS, error.message);
    // Only the error type: a message could carry personal data.
    console.error(`[mcp] ${method} failed: ${error.name}`);
    fail(id, INTERNAL_ERROR, 'Internal error.');
  }
}

const pending = new Set();
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });

lines.on('line', (line) => {
  if (!line.trim()) return;
  const work = handle(line)
    .catch((error) => console.error(`[mcp] could not answer a message: ${error.name}`))
    .finally(() => pending.delete(work));
  pending.add(work);
});

// The client closed stdin: finish the answers in flight, then exit, or the database
// pool the EventHub tools opened would keep the process alive.
lines.on('close', async () => {
  await Promise.allSettled(pending);
  process.exit(0);
});

// The client went away mid-write: nobody is left to answer.
process.stdout.on('error', () => process.exit(0));

console.error('EventHub MCP server: waiting for JSON-RPC messages on stdin (Ctrl+C stops it).');
