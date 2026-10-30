# EventHub — Instructions for the coding agent

Read this file at the start of every session. `SPEC.md` is the source of truth for goals, non-goals, architecture, business rules, acceptance criteria and the 30 mandatory course requirements. This file instructs the agent how to work **without silently changing the specification**.

> **Status (2026-10-30):** implemented; the commands below exist in `package.json` and were run. `mcp-server/server.js` exists (written by the agent on 2026-10-30 at the owner's request; the teacher allowed AI for it) and passes `mcp-server/check.mjs` and AC-32/AC-35. Not done yet: git history, deployment, READINESS.md, the partner review, DEFENSE.md. Preserve the course template files and the MCP server.

## Project

EventHub is a club-events application for university students and student club organizers. Members browse events with limited seats, register and cancel; organizers manage only their own clubs/events and can request a validated AI draft. All scope decisions and numbered acceptance criteria are in `SPEC.md`.

## Commands

- Install: `npm install`
- Local database: `npm run db:local` (real PostgreSQL from `embedded-postgres` on localhost:5433, data in `.pgdata/`; it is the default `DATABASE_URL` outside production); `npm run db:stop` stops it, including one left by a closed terminal
- Run: `npm run dev` (Express + Vite middleware on :3000); production: `npm run build`, then `npm start`
- Shell: the owner uses Windows PowerShell 5.1, where `&&` is a syntax error. Give commands one per line.
- Test: `npm test` (starts a throwaway PostgreSQL unless `DATABASE_URL_TEST` is set)
- Coverage: `npm run coverage` (alias `npm run test:coverage`; fails below 80% overall or 100% in `src/services`)
- MCP server: `npm run mcp` (Exercise 1 server + EventHub tools from `mcp-server/eventhub-tools.js`; `MCP_TOKEN` from `npm run mcp:token`)
- DB migrations: `npm run db:migrate`
- Demo seed: `npm run db:seed` (dev/test only, never production without explicit approval)
- Course check: `node checks/ex2.mjs`; later `node checks/ex3.mjs`, `node checks/ex4.mjs <LIVE_URL>`, `node checks/ex5.mjs`, `node checks/project.mjs`
- MCP protocol check: `node mcp-server/check.mjs -- npm run --silent mcp`

## Conventions

- Node.js 22, Express, React + Vite, PostgreSQL (`pg`), Vitest/Supertest. `mcp-server/` belongs to Exercise 1 and must be extended, not replaced.
- Keep responsibilities separated: `src/routes/` parses HTTP and maps responses; `src/services/` implements business rules + ownership; `src/data/` alone performs parameterized SQL and transactions; `src/integrations/` wraps OAuth and Gemini; `client/` is the React app.
- Every schema change is a new numbered `.sql` file in `migrations/`. Never rewrite or remove a migration once it has been executed.
- Both HTTP routes and MCP tools call **the same services**. Never duplicate a business rule in MCP or put SQL in an MCP tool.
- Store datetimes in UTC; present them in `Europe/Sofia`. Never rely on a test fixture with a hard-coded future date that may expire.
- Keep UI tokens centralized in `client/src/styles/tokens.css`; implement loading/empty/error/success on every screen, responsive 380/768/1280 px, visible keyboard focus and measured text contrast of at least 4.5:1.
- Each `AC-N` in `SPEC.md` must be named in at least one automated `test(...)`/`it(...)` title. Keep the `Traceability` table up to date.
- If actual implementation differs from `SPEC.md`, report the discrepancy and ask the project owner to approve the spec change **before** changing scope or criteria.

## Layers

```text
HTTP route  -> service -> data -> PostgreSQL
MCP tool    -> same service -> same data -> PostgreSQL
AI route    -> eventDraftService -> injected Gemini client (or deterministic fallback)
```

Routes must not apply ownership rules themselves; the service receives `currentUser` and enforces ownership. All seat reservations must be transaction-safe. `registrations` is the many-to-many table for users and events.

## The model feature

- One model feature only: generate a proposed event title, summary and fixed-list category from organizer text. No automatic publishing.
- The provider is encapsulated in `src/integrations/geminiClient.js`; the business behavior is in `src/services/eventDraftService.js`. HTTP routes never talk to the provider directly.
- Only the organizer-provided text may leave the application. Do not send member names, emails, registration lists, session data or credentials.
- Obtain `GEMINI_API_KEY` from runtime environment only. Do not commit, print or log it.
- A request has a 5-second timeout, validates model JSON against strict field limits and category allowlist, and returns a deterministic draft if the key is missing, the provider fails or the result is invalid.
- Inject a fake model client in tests. All automated tests must run with no AI network request.

## Auth and security

- Local login uses a salted Argon2id password hash; social login uses Google OAuth authorization code flow, validated `state` and PKCE.
- Social-email account matching is allowed only for provider-verified email addresses. Both login paths produce identical session handling and one user ID.
- Session values are opaque secrets stored hashed server-side; cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in production. Apply appropriate CSRF/Origin checks.
- Organizers may modify only their own event/club, and members may cancel only their own registration; enforce in `services/`.
- Never send real secrets to the browser. Keep `.env` untracked; `.env.example` contains only empty/example placeholders.

## The MCP server

- Located in `mcp-server/` and based on the code from Exercise 1. Do not delete the two Exercise 1 tools or existing exercise protocol behavior.
- The protocol loop is `mcp-server/server.js` (plain Node, newline-delimited JSON-RPC over stdio, no SDK) with the two Exercise 1 tools `find_lecture` and `search_lectures`. The owner asked the agent to write it on 2026-10-30, with the teacher's permission; the owner must be able to explain it at the defense, so keep it small and commented. EventHub tools live in `mcp-server/eventhub-tools.js` and are plugged into that loop (`eventhubTools`, `isEventhubTool`, `runEventhubTool`).
- Add at least 3 EventHub project tools listed in `SPEC.md`, with meaningful descriptions of at least 20 characters and validated `inputSchema`.
- Every EventHub tool resolves the current user from ordinary session `MCP_TOKEN` and invokes the matching service function. No admin token or privileged bypass.
- Keep JSON-RPC output on stdout and diagnostics without personal data on stderr. Protocol errors differ from business tool failures (`isError: true`).

## Tests and coverage

- Create a numbered test before fixing a business-rule bug. Verify both successful and negative branches: full event, duplicate registration, concurrent last seat, wrong owner, missing key, bad AI output, unverified OAuth email, expired session.
- Test service rules independently, API status mapping with Supertest, real Postgres constraints/transactions in isolated test DB, MCP protocol/security, and keyboard/responsive UI behavior.
- CI runs `npm run test:coverage` and blocks passing if the overall code coverage is below 80%. Aim for full coverage of critical service branches.
- Never weaken, remove or skip a failing test merely to make a build green. No changes to thresholds without explicit approval.

## Always ask before

- removing any existing file or folder;
- altering a migration that has already been executed;
- adding, upgrading or removing package dependencies;
- pushing commits, creating tags or modifying CI workflows;
- changing any secret, credentials, `.env` values or secret-handling conventions;
- changing authentication, account linking, permissions or ownership policy;
- adding, renaming or removing an MCP tool;
- lowering or otherwise changing test coverage gates;
- sending user-provided data to an external AI service or broadening which data is sent.

## Never

- Commit credentials, tokens, passwords, API keys, OAuth client secrets, `.env`, or real personal data.
- Weaken assertions or hide failing tests to satisfy CI.
- Lower the coverage threshold or disable a CI check to achieve a green result.
- Bypass the service layer from MCP, a route or background helper.
- Log model prompts, personal data, cookies, access tokens or provider secrets.
- Claim a requirement/test/hosting step is complete without observing evidence.
- Implement features explicitly excluded by `SPEC.md` without approval.

## Session workflow

1. Read `SPEC.md` and `AGENTS.md`; choose the smallest unfinished vertical slice and the `AC-N` numbers it must satisfy.
2. Propose a plan naming tables/migrations, services, routes/MCP tools, UI and tests. Cross-check with `Non-goals`. **Do not change code until the plan is reviewed.**
3. Implement in small commits or checkpoints: migration/data → service + tests → HTTP/MCP → UI + tests.
4. Run applicable tests and course checks. Explain what passed, what failed, and what has not been tested; do not invent outcomes.
5. Update `Traceability`, `Spec vs result`, `AGENT_LOG.md`, `USAGE.md`, `docs/UI.md` and `DEFENSE.md` only when supported by actual work.
6. End each session with a concise list of changed files, criteria covered, test output and the next smallest action.
