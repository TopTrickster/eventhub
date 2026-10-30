# Agent log

One entry per agent session, newest at the bottom. Be honest: what went wrong is the useful part.

<!-- Copy this block for each session:

## YYYY-MM-DD · <short title>
- Goal:
- Delegated:
- Checkpoints:
- Went wrong:
- Changed by hand:

-->

## 2026-10-29 · Full EventHub build from SPEC.md and AGENTS.md
- Goal: build the whole project the spec describes (all stages), in the course template's structure.
- Delegated: everything except the Exercise 1 MCP protocol loop. Claude Code (Opus 5.5) copied the official template (checks, CI, devcontainer, mcp-server data), wrote migrations, data/services/routes, Google OAuth + PKCE, the Gemini draft with fallback, the EventHub MCP tools module, the React client and 120+ tests named after the AC ids.
- Checkpoints: three decisions were asked before any code: (1) the student writes `mcp-server/server.js` (course rule), the agent only the tools module; (2) `embedded-postgres` as a dev dependency so tests and local dev use real PostgreSQL without installing it; (3) full scope rather than Slice 1 only.
- Went wrong: embedded PostgreSQL on Windows initialised as WIN1252 and rejected Cyrillic (fixed with `--encoding=UTF8 --locale=C`). The register/cancel button was first two different elements, so keyboard focus dropped to the page after registering (noticed while planning the keyboard test; now one button with `aria-disabled`). `checks/ex4.mjs` wants `/health`, the spec only had `/api/health` (both exist now). `gemini-2.5-flash` is limited to existing users per Google's deprecations page (29.10.2026): kept as the spec says, configurable via `MODEL_NAME`.
- Not done: `mcp-server/server.js` (yours), deployment to Render/Neon, Lighthouse contrast measurement, DEFENSE.md, READINESS.md, git commits. AC-32/AC-35 fail and AC-20/AC-43 (live) are skipped until then.
- Changed by hand:

## 2026-10-30 · Local run fixes, keys, and the MCP server
- Goal: get the app running on Windows, enable Gemini and Google sign-in, and add the MCP protocol loop.
- Delegated: `scripts/db-local.js` now reuses a running database and prints PostgreSQL's own error; new `npm run db:stop`; one command per line in the docs (PowerShell 5.1 has no `&&`); the dev server says where to open the app. `mcp-server/server.js`: the author wrote their Exercise 1 server on a university computer and asked Claude Code to write this one, saying the teacher allowed AI for it. It is plain Node (no SDK) with `find_lecture`, `search_lectures` and the five EventHub tools.
- Checkpoints: the author put `GEMINI_API_KEY` and the Google client into `.env` themselves; the agent did not copy them from screenshots.
- Went wrong: `npm run db:local` showed only `undefined` when PostgreSQL failed to start, because its log was silenced. Both keys were shared as screenshots in the chat, so both should be replaced before deploying.
- Checked: `node mcp-server/check.mjs -- node mcp-server/server.js` 12/12; `npm run coverage` 121 passed, 2 skipped (AC-20/AC-43, live), 98.8% statements overall. `server.js` runs as a child process in the tests, so it is not in the coverage numbers.
- Changed by hand:
