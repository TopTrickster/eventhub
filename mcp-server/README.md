# Exercise 1 · MCP server

Your hand-written MCP server lives in this folder. Write it in any language you like. The full task is on the exercise page; this file is the short version plus your notes.

## What is already here

| File | What it is |
|---|---|
| `lectures.json` | The course lectures. Your first tool reads this file. |
| `messages.jsonl` | The messages a client sends, in order, with what your server must answer. |
| `check.mjs` | The self-check. It starts your server, sends those messages and tells you what is wrong. |

## The two tools

1. **`find_lecture`**: everyone writes this one. Input: `number` (1 to 10). It returns the title and topics of that lecture from `lectures.json`. A number outside the range is not a crash and not a protocol error: it is a result with `isError: true` and a readable message.
2. **One of your own**: anything useful that reads local data. Give it a description a model can choose by. Every tool needs one: the self-check applies the same rule to all of them, because a description is the only thing a model reads when it decides what to call.

## Where this goes next

Do not throw this folder away after Exercise 1. From Exercise 3 it becomes **your project's own MCP server**: the same protocol loop, with the tools rewired from `lectures.json` to your real data. Its tools call exactly the same service functions your HTTP routes call, so a tool obeys the same rules an API request does, and it carries a user (the `MCP_TOKEN` in `.env.example`) so it may do what that person may do and no more.

That is the whole design, and it is one sentence: **one set of rules, two front doors.** An MCP tool that writes its own database query is a second way into your data with none of your rules on it, and Exercise 5 is very good at finding those.

Add an `mcp` script to `package.json` (`"mcp": "node mcp-server/server.js"`) so your agent, CI and the lecturer can all start the server the same way.

## Run the self-check

```bash
node mcp-server/check.mjs -- <your start command>
# for example
node mcp-server/check.mjs -- node mcp-server/server.js
node mcp-server/check.mjs -- python3 mcp-server/server.py
# once you have added the mcp script
node mcp-server/check.mjs -- npm run --silent mcp
```

It prints one line per check. Fix the failures yourself: the agent may explain a message or review your handler, but it must not write the protocol code for you.

## EventHub tools (the project part)

`eventhub-tools.js` holds the five EventHub tools from `SPEC.md` (`upcoming_events`, `my_registrations`,
`register_for_event`, `cancel_registration`, `suggest_event_draft`). It is **not** a server.
`server.js` holds the protocol loop and the Exercise 1 tools (`find_lecture`, `search_lectures`),
and uses three exports:

| Export | Where your loop uses it |
|---|---|
| `eventhubTools` | append to the `tools` array you return from `tools/list` |
| `isEventhubTool(name)` | in `tools/call`, to tell an EventHub tool from your own |
| `runEventhubTool(name, args)` | resolves to the `tools/call` **result** (`{ content, isError? }`); rejects with a `ToolArgumentError` whose `code` is `-32602` for bad arguments, which your loop sends back as a JSON-RPC **error** |

Every tool calls the same `src/services` function as its HTTP route, as the user whose session
token is in `MCP_TOKEN`. Business refusals (`EVENT_FULL`, `FORBIDDEN`, an invalid token) come back
as results with `isError: true`, so the server keeps running. The module never writes to stdout.
It connects to the database on the first EventHub call, so `initialize` and `tools/list` work in CI,
where there is no database.

Getting a token: `npm run mcp:token` signs in like the login form does and prints a session token.
Put it in `MCP_TOKEN` (`.env` locally, Codespaces secret otherwise), never in git.

`tests/mcp/protocol.test.js` (AC-32, AC-35) starts `node mcp-server/server.js` over stdio, the way a
client does. `tests/mcp/integration.test.js` and `tests/mcp/security.test.js` (AC-33, AC-34) test
the module directly.

`server.js` was written by Claude Code on 2026-10-30 at the author's request; the teacher allowed
AI for it. See `AGENT_LOG.md`.

## How to start it

```bash
npm run mcp
```

`find_lecture` and `search_lectures` work without anything else. The EventHub tools need the
database (`npm run db:local`) and `MCP_TOKEN` from `npm run mcp:token` in `.env`. The server waits
for JSON-RPC messages on stdin, one per line; Ctrl+C stops it.

Self-check: `node mcp-server/check.mjs -- node mcp-server/server.js` (on Windows the `npm run
--silent mcp` form fails to start, because `check.mjs` launches `npm` without a shell).

## Session transcript
<!-- Paste one full session: initialize, the reply, tools/list, one good tools/call, one that fails. -->

## The description experiment
<!-- Three sentences: what you changed in the description, whether the model chose the tool differently, and why you think so. -->
