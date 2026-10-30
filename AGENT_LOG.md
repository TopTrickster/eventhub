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
- Changed by hand: no file in the repository. The author wrote `SPEC.md` and `AGENTS.md` before the session and answered the three checkpoint questions.

## 2026-10-30 · Local run fixes, keys, and the MCP server
- Goal: get the app running on Windows, enable Gemini and Google sign-in, and add the MCP protocol loop.
- Delegated: `scripts/db-local.js` now reuses a running database and prints PostgreSQL's own error; new `npm run db:stop`; one command per line in the docs (PowerShell 5.1 has no `&&`); the dev server says where to open the app. `mcp-server/server.js`: the author wrote their Exercise 1 server on a university computer and asked Claude Code to write this one, saying the teacher allowed AI for it. It is plain Node (no SDK) with `find_lecture`, `search_lectures` and the five EventHub tools.
- Checkpoints: the author put `GEMINI_API_KEY` and the Google client into `.env` themselves; the agent did not copy them from screenshots.
- Went wrong: `npm run db:local` showed only `undefined` when PostgreSQL failed to start, because its log was silenced. Both keys were shared as screenshots in the chat, so both should be replaced before deploying.
- Model switch: after the author replaced the Gemini key, every AI draft fell back. The server log reason was `provider_status_404`; Google's message said `gemini-2.5-flash` is no longer available to new users. The agent measured alternatives through the app's own service (see SPEC.md, "The model feature") and, with the author's approval, changed the default and `MODEL_NAME` to `gemini-3.5-flash-lite` (only that line of `.env` was changed, by script, without reading the file).
- Checked: `node mcp-server/check.mjs -- node mcp-server/server.js` 12/12; `npm run coverage` 121 passed, 2 skipped (AC-20/AC-43, live), 98.8% statements overall. `server.js` runs as a child process in the tests, so it is not in the coverage numbers.
- Changed by hand, by the author:
  - Created the Google Cloud project, the OAuth consent screen ("Testing", with test users) and the OAuth client.
  - Created the Gemini API key in AI Studio.
  - Replaced the Gemini key and the Google client secret after both appeared in chat screenshots, and deleted the old ones.
  - Put `GEMINI_API_KEY`, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` into `.env`.
  - Decided on no dark mode, and approved the model switch.
  - Nothing in the tracked files.

## 2026-10-30 · Readiness report, defence notes and MCP evidence
- Goal: write `READINESS.md`, the manual-check line in `SPEC.md` "Spec vs result", the MCP README "Session transcript" and "The description experiment", `DEFENSE.md`, and keep this log and `USAGE.md` current.
- Delegated: all of the above. The author asked the agent to write them instead of doing it themselves, saying the course allows AI-only work this year. Every claim comes from a check run in this session:
  - `READINESS.md`: API checks with curl against a local production build (401 without a session, 403 for a second account including a `DELETE`, the cookie flags, invalid input). A copy with no reachable database and a copy with the Gemini key removed. The request waterfall from the browser's resource timing with an empty cache. A secret scan of the files and of the history. The price from Google's pricing page and token counts from 3 real calls.
  - The description experiment: Gemini CLI is not installed, so a script gave `server.js`'s `tools/list` to `gemini-3.5-flash-lite` as function declarations, 5 runs before and 5 after making `find_lecture`'s description vague. The description was restored afterwards (`git diff` is empty).
  - `DEFENSE.md`: a first-person draft for the author to rewrite. Its last section is marked as the agent's suggestion.
- Checkpoints: `.env` was not read. The local database the author already had running was left alone (the "database down" test used a second copy of the app pointed at a closed port). The demo registration made during the manual check was cancelled again.
- Went wrong: the first fallback test showed `?????` in the title, because curl in Git Bash sent the Cyrillic argument in the wrong encoding. Re-sending the same JSON from a UTF-8 file gave the right text, so the app was fine. The experiment found no difference (5/5 both times), because the tool name and the `number` parameter still describe the tool. Writing the report surfaced a real gap: the database pool has no connection timeout (`READINESS.md`, gap 2). It is listed and not fixed.
- Checked: `npx vitest run` 122 passed, 2 skipped (AC-20/AC-43, live); `npm run coverage` passed its gates (98.7% statements, 96.3% branches). `node checks/ex4.mjs` 27/29: `liveUrl` is empty until deployment, and ".env is committed" fires only because the file exists on disk; git shows it was never committed.
- Changed by hand: nothing in this session.
