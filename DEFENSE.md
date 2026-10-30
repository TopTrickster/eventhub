# Defence notes

<!-- Exercise 5 writes this, before the defence, while the project is fresh.
     These are your own answers, in your own words. The question bank is on the course
     site under Resources → The defence. The committee will not ask whether an agent
     wrote the code; everyone in the room knows it did, and the course required it.
     It will ask whether the system is yours. -->

> Written by Claude Code on 30.10.2026 at the author's request (this year the course allows AI for
> this), in the first person as the author's notes. The course allows reading from notes during the
> defence. Every answer names the file to open. The last part answers the course's question bank.

## What it does

EventHub lets student clubs publish events with a limited number of seats. Students sign in, see what
is coming up, and take or give back a seat. Organizers create and manage their own club's events, see
who registered, and can ask an AI model for a first draft of an event.

**Demo plan (5 minutes)**, at https://eventhub-5wcj.onrender.com. Open it 5 minutes before the start,
because the free plan sleeps.

1. **Sign in** as `student1@eventhub.test`. The list shows the date, club, place and free seats.
2. **Main action:** open „Доброволческо почистване на парка“, then click „Запиши ме“. The seats go
   from 20 to 19, the button becomes „Отпиши ме“, and focus stays on it. Click it again to cancel.
3. **Model feature:** sign in as `organizer1`, open „Ново събитие“, type one sentence and click
   „Предложи с AI“. The fields fill in and a blue note says it is an AI suggestion. Edit, then save.
4. **Failing gracefully:**
   - Press save on an empty form, and every field says what is wrong.
   - As `organizer2`, open `/organizer/events/00000000-0000-4000-8000-0000000000e1/edit`
     (organizer1's hackathon). The page says „Нямате достъп“, and the server answers `403`.
   - „Вечер на настолните игри“ is full and says „Няма свободни места“.
   - If they ask for the error state or the AI fallback: on my laptop, run `npm run dev`, then
     `npm run db:stop` and reload `/events` to get „Нещо се обърка“ with „Опитай отново“.
     Starting it with `$env:GEMINI_API_KEY='wrong-key'; npm run dev` gives the yellow fallback note.

## The three files I will open

1. `src/services/registrationService.js` (`registerForEvent`), because it is where a rule is enforced
   under load. Inside one transaction it:
   - locks the event row (`SELECT … FOR UPDATE` in `src/data/eventsRepo.js`);
   - refuses past events and double registrations;
   - counts the taken seats and inserts only if one is free.

   Two people racing for the last seat are serialised by the lock, so one gets it and the other gets
   `409 EVENT_FULL`. `tests/data/concurrency.test.js` (AC-7) proves it with real concurrent requests.
2. `mcp-server/eventhub-tools.js` (`callEventhubTool`), because it shows the boundary between layers.
   The MCP server is a second front door, but it turns `MCP_TOKEN` into a user exactly like the
   browser cookie, then calls the same service functions as the REST routes. It has no SQL and no
   permission checks of its own, so it cannot have different rules from the website.
3. `src/services/eventDraftService.js`, my choice, because it is where a model that can be wrong meets
   the app. It:
   - sends only the organizer's sentence;
   - gives the model 5 seconds;
   - validates the answer against the same limits as the form;
   - turns every failure into one predictable fallback.

   Nothing it returns is saved automatically.

## Decisions I can defend

- **Stack:** I chose Node 22 with Express 5, PostgreSQL through `pg` with hand-written parameterized
  SQL, and React 19 built by Vite, with the same Express process serving the built client.
  - I rejected an ORM, because I wanted to see the transaction and the row lock for the last seat,
    not trust an abstraction to do it.
  - I rejected a separate frontend host or Next.js: that is one more deploy and a CORS setup, for no
    gain at this size.
  - With many more tables I would reconsider a query builder. With heavy traffic I would put the
    static files behind a CDN.
- **Where the rules live:** in `src/services/`, nowhere else.
  - Routes only read the request and map errors to status codes; `src/data/` only runs SQL.
  - Every service receives `currentUser` and checks ownership against the row itself:
    `events.organizer_id`, `clubs.owner_id`, or the caller's own id for registrations.
  - I rejected checks in the routes, because then the MCP tools would have needed their own copy.
  - Rules that the database can hold are also constraints: `UNIQUE (event_id, user_id)`, capacity
    `1–500`, end after start.
- **Authentication and authorization:**
  - **Sign-in.** Email and password, hashed with Argon2id, or Google sign-in with `state`, `nonce`
    and PKCE, with the code exchanged on the server.
  - **Linking.** A Google account links to an existing user only when Google says the e-mail is
    verified (AC-23, AC-24).
  - **Sessions.** A random token in an `HttpOnly; Secure; SameSite=Lax` cookie. The database stores
    only its SHA-256 hash, for 7 days.
  - **Why not a JWT in `localStorage`.** A script injected into the page (XSS) could read it, and
    signing out could not revoke it.
  - **Authorization.** The role says what *kind* of thing someone may do. Ownership says *which
    rows*. `organizer2` is an organizer, and still gets `403` on `organizer1`'s event.
- **The model, and why that one:** Google `gemini-3.5-flash-lite`.
  - The spec first said `gemini-2.5-flash`, but on 30.10.2026 Google refused it for new keys (`404`).
  - I measured the alternatives through the app's own code with its 5-second limit.
    `gemini-3.8-flash` was overloaded (`503` after 16–22 s), `gemini-3.5-flash` returned `503`, and
    `gemini-flash-latest` did not answer within 5 s.
  - Flash-Lite answered in 10 of 12 calls, in 0.9–4 s. The task is small (a title, a summary, one of
    five categories), so a small, fast model is enough.
  - It costs about $0.0002 per call at the paid price.
- **What the MCP server exposes, and what it deliberately does not:**
  - **Exposes.** Two lecture tools, plus five EventHub tools: `upcoming_events`,
    `my_registrations`, `register_for_event`, `cancel_registration`, and `suggest_event_draft`
    (organizers only).
  - **Does not expose.** Creating, editing or deleting events. Attendee lists, which are other
    people's personal data. Acting as someone else. An admin token. SQL.
- **The database shape:** six tables in four migrations.
  - The tables are `users`, `oauth_accounts`, `sessions`, `clubs`, `events` and `registrations`.
  - The many-to-many is `users` ⇄ `events` through `registrations`. One row is one taken seat, and
    free seats are counted from those rows, never stored, so they cannot drift.
  - Deleting an event deletes its registrations (`ON DELETE CASCADE`).

## How I know it works

- **Tests.** Every acceptance criterion `AC-1`…`AC-48` in `SPEC.md` has a test with its id in the
  name (`tests/project/traceability.test.js` checks that).
  - `npx vitest run`: 122 passed and 2 skipped (AC-20 and AC-43 test the live site).
  - Against the live site, `tests/smoke` passes 3/3, including AC-20 and AC-43.
- **Coverage.** 98.7% of statements and 96.3% of branches overall. CI enforces 80% overall and 100%
  for `src/services`.
- **What the coverage does not tell me.**
  - Whether an assertion is meaningful.
  - Whether the page looks right. For that there are the Lighthouse runs in `docs/UI.md`:
    Accessibility 100, CLS 0, Performance 93–100.
  - Whether the real Google and Gemini work. The tests use fakes; I checked both on the live site.
  - `mcp-server/server.js`. It runs as a child process in the tests, so it is not in the numbers.
    Its own check passes 12/12.
- **Production.** `READINESS.md` has the evidence:
  - `401` for every write without a session, and `403` for another user's event;
  - the `http://` → `https://` redirect;
  - the request waterfall;
  - a rollback drill: under a minute to roll back, and no downtime in 51 checks.

## What is wrong with it

From `READINESS.md`, gap list, most dangerous first:

1. Render deploys every push, even when CI is red. The rollback drill showed that a broken setting
   still passes `/health`. Rolling back took under a minute, but someone has to notice first.
2. The database pool has no connection timeout: if Neon hangs instead of refusing, requests wait
   with no limit, and the error says "unexpected" instead of "database unavailable".
3. A leaked `MCP_TOKEN` is that user's session for 7 days, and there is no "sign out everywhere".
4. On Gemini's free tier Google may use the organizer's text. The panel warns, but does not block,
   personal data.
5. The sign-in rate limit is in memory, so it resets on every deploy.

Smaller ones:

- Render's free plan sleeps after 15 minutes without traffic.
- Google sign-in is in Testing mode, so only listed test users can use it.
- The events page waits on three trips in a row, about 2.3 s live, partly because the server is in
  Oregon.
- Configuration values are used exactly as typed. A stray line break in the Google secret broke
  Google sign-in on the first deploy, and the log said only `code_rejected`.
- There is no favicon.
- The model misses the 5 s limit about once in six calls.

## The thing in this repository I did not write and cannot explain

I did not write the code by hand; Claude Code wrote it from my `SPEC.md` and `AGENTS.md`, as the
course required. The part I would find hardest to explain without notes is in
`src/integrations/googleOAuthClient.js`.
- The ID token from Google is decoded, and its claims are checked: issuer, audience, expiry and
  nonce.
- Its **signature is not verified**.
- That is allowed when the token comes straight from Google's token endpoint over HTTPS, in a
  request made with our client secret, because nobody in between could have changed it.
- It would not be safe if the token reached us any other way, for example through the browser. Then
  the signature would have to be checked against Google's public keys.

## Answers to the question bank

### HTTP and the API

- **Status codes.** `200`, `201` (created event, registration, club), `204` (delete, cancel), `302`
  (Google sign-in redirects), `400` (validation, broken JSON), `401`, `403`, `404`, `409`, `413`
  (body over 20 kB), `429` (too many sign-ins), `500`, and `503` (`/health` without a database).
- **A 4xx from my own rule.** `409 EVENT_FULL`, in `registrationService.registerForEvent`, when the
  seats are taken.
- **401 vs 403.**
  - `401` means "I don't know who you are": no or expired session, from `requireAuth` in
    `src/middleware/session.js`.
  - `403` means "I know you, and you may not": `organizer2` editing `organizer1`'s event gets `403`
    from `lockOwnEvent` in `src/services/eventService.js`.
- **Safe and idempotent methods.**
  - `GET` is safe: it changes nothing.
  - `PATCH` with the same body and the `DELETE`s are idempotent: repeating them leaves the same
    state. The second cancel answers `404 REGISTRATION_NOT_FOUND`, but nothing changes.
  - `POST` is not idempotent: a second registration answers `409 ALREADY_REGISTERED`.
- **The wrong `Content-Type`.** `express.json()` parses only `application/json`. A body sent as
  `text/plain` is ignored, so the service sees no fields and answers `400 VALIDATION_ERROR` listing
  every field (I tried it). Broken JSON with the right type answers `400 INVALID_JSON`.
- **Tracing one endpoint.** Take `POST /api/events/:id/registrations`:
  1. `src/app.js`: the Origin check, `loadSession` and `requireAuth`.
  2. `src/routes/events.js`: reads the id.
  3. `registrationService.registerForEvent`: a transaction, the row lock, the checks.
  4. `eventsRepo.lockEvent`, then `registrationsRepo.countRegistrations` and `insertRegistration`.
  5. The answer is `201` with the seats left. A business error goes through
     `src/middleware/errors.js` and becomes a Bulgarian sentence with its status code.

### REST and data modelling

- **Is the API REST-like?** Mostly.
  - The resources are `/events`, `/events/:id`, `/events/:id/attendees`,
    `/events/:id/registrations`, `/clubs` and `/registrations/me`, and the methods carry the meaning.
  - Two exceptions: `/registrations/me` means "my own", so nobody can name someone else's
    registration; and `/ai/event-draft` is an action, not a resource.
- **The many-to-many.** `registrations (event_id, user_id)`, with `UNIQUE (event_id, user_id)`.
- **Deleting a parent row.**
  - Deleting an event deletes its registrations (`ON DELETE CASCADE`, AC-16).
  - Deleting a user deletes their sessions and Google links.
  - A user who still owns clubs or events, or holds registrations, cannot be deleted: PostgreSQL
    refuses. The app has no account deletion.
- **Migrations.**
  - They are numbered SQL files in `migrations/`. `src/data/migrator.js` records each one in
    `schema_migrations` and holds an advisory lock, so two starts never run them twice. Render runs
    them at every container start.
  - Versioned files mean every database (mine, the tests, Neon) gets the same steps in the same order.
  - A wrong migration that already ran is never edited: I add a new numbered migration that
    corrects it (`AGENTS.md` says to ask first).
- **Transactions.**
  - Registration: lock the event, count, insert.
  - Editing and deleting an event: lock it and check the owner. For example, the capacity cannot go
    below the registrations already taken (AC-15).
  - Migrations and the seed.
  - Without them, two people both see one free seat and both get it. AC-7 tests exactly that.
- **Parameterized queries.** Every query in `src/data/` uses `$1, $2…`. Text a user typed never
  becomes part of the SQL, so it cannot change the query (SQL injection). Concatenation would allow
  exactly that.

### Layers

- **The layers.**
  - `src/routes/` handles HTTP.
  - `src/services/` holds the rules and ownership.
  - `src/data/` holds the SQL.
  - `src/integrations/` talks to Google sign-in and Gemini.
  - `client/` is React.
  - `mcp-server/eventhub-tools.js` calls the same services.
- **What the rules layer holds that a route should not.** Ownership, capacity, roles and validation.
  If a rule moved up into a route, the MCP tools, which do not go through routes, would skip it.
- **Which file knows the database.** Only `src/data/` (plus `migrations/`). Switching databases means
  changing those files; the services would not change.
- **Where the layers are not clean.**
  - `toPublicEvent` in `src/services/access.js` decides the JSON shape, which is presentation inside
    the rules layer.
  - The React form repeats the length limits (`maxLength` in `client/src/components/EventForm.jsx`).
    It is a copy for convenience; the server is still the one that decides.

### Authentication

- **Authentication vs authorization.**
  - Authentication is `loadSession` in `src/middleware/session.js`: the cookie becomes
    `req.currentUser`.
  - Authorization is `lockOwnEvent` in `src/services/eventService.js`: `organizerId !== currentUser.id`
    → `403`.
- **How passwords are stored.** With Argon2id (`src/services/passwords.js`). It is slow and needs a
  lot of memory on purpose, so guessing is expensive.
- **Why SHA-256 would be wrong for passwords.** It is built to be fast, so a graphics card can try
  billions of guesses a second, and unsalted it gives the same hash for the same password. I do use
  SHA-256 for session tokens, and that is fine: a token is 32 random bytes, so there is no
  dictionary to guess from.
- **The salt.** A random value per password, stored inside the Argon2 hash. Two equal passwords get
  different hashes, and precomputed tables (rainbow tables) become useless.
- **From password to the next request.**
  1. `POST /api/auth/login`, where `authService.login` checks the Argon2 hash.
  2. `createSession`: 32 random bytes, and only their SHA-256 is stored in `sessions`, with an expiry
     7 days later.
  3. The `Set-Cookie` header sets `eh_session`.
  4. On the next request, `loadSession` hashes the cookie and finds the unexpired session.

  The session lives in PostgreSQL; the browser only holds the token.
- **Cookie flags.**
  - `HttpOnly`: page scripts cannot read the cookie, so an XSS cannot steal it.
  - `Secure`: HTTPS only.
  - `SameSite=Lax`: another site cannot make the browser send it with a `POST` (CSRF).
  - On top of that, `checkOrigin` refuses writes that come from another site.

### Sign-in with a provider

- **The flow.**
  1. `/api/auth/google` stores `state`, the PKCE verifier and the `nonce` in a 10-minute `HttpOnly`
     cookie, then sends the browser to Google.
  2. Google sends the browser back with `code` and `state`.
  3. The server checks `state`, then exchanges `code`, the verifier and the client secret for an ID
     token, server to server.
  4. It checks the claims, finds or links the user, and starts a session.

  The code is in `src/routes/auth.js` and `src/integrations/googleOAuthClient.js`.
- **`state`** prevents login CSRF. Without it, an attacker could send their own code to my browser and
  sign me in to the attacker's account.
- **PKCE** ties the code to this browser's secret verifier, so a stolen code is useless. It is
  recommended even with a client secret, as an extra layer.
- **Why the client secret never reaches the browser.** Anything sent to the browser is public.
  Single-page apps, mobile and desktop apps cannot keep a secret, so they rely on PKCE alone.
- **The ID token signature.** It is not verified. See the last section above for why that is
  acceptable here.
- **Linking accounts.** Someone registers with a password and later signs in with Google using the
  same e-mail. If Google says the e-mail is verified, the accounts are linked (AC-23, in
  `src/services/oauthService.js`). If not, it is refused (AC-24). Without that check, someone could
  make a Google account with my e-mail address unverified and take over my EventHub account.

### The model feature

- **Model.** `gemini-3.5-flash-lite`; the reason and the rejected models are in "Decisions" above.
- **Data sent.** Only the sentence the organizer typed, plus a fixed instruction. No name, e-mail, ids
  or other users' data. The organizer could still type someone's name, so the panel says not to type
  personal data.
- **Cost.** $0.30 per 1M input tokens and $2.50 per 1M output tokens, from Google's pricing page on
  30.10.2026. One call used 161 input and about 60 output tokens:
  161 × 0.30/1M + 65 × 2.50/1M ≈ **$0.0002**.
- **Nonexistent ids or invalid dates.** The model is never asked for ids or dates: only a title, a
  summary and one of five categories (`RESPONSE_SCHEMA`). `validateDraft` rejects anything else, and
  then the fallback is used. Dates, place and seats are always typed by the organizer.
- **Provider stopped.** The yellow fallback note, and the form keeps working. I tested it by removing
  the key (`READINESS.md` section 8).
- **Timeout.** 5 s: `withTimeout` in `src/services/eventDraftService.js`, plus the `AbortSignal` in
  `src/integrations/geminiClient.js`.
  Without it, the button would spin as long as Google takes, and requests would pile up.
- **Tests.** They use a fake model client (AC-27 to AC-31), so they are deterministic, free and work
  offline. The real model is checked by hand, and AC-43 on the live site accepts `model` or
  `fallback`.
- **Non-determinism.** With `temperature: 0.4`, the same sentence gives different wording each time.
  No test depends on the wording, only on the shape and the limits.
- **Tokens.** A token is a piece of a word. Input tokens are processed together in one pass. Every
  output token needs its own step, one after another, so output costs more ($2.50 vs $0.30 per 1M).

### MCP

- **What MCP is.** A standard way for an AI client to discover tools at runtime (name, description,
  JSON schema of the arguments) and call them. With a plain REST API, someone has to write the glue
  for every client.
- **The handshake.** The client sends `initialize` with its protocol version. The server answers with
  the version, its capabilities (`tools`) and its name. Then the client sends
  `notifications/initialized`, which gets no reply.
- **`tools/list` and tool choice.** It returns 7 tools with name, description and `inputSchema`. The
  model picks by name, description and arguments. In my experiment it kept choosing `find_lecture`
  even with a vague description, because the name and the `number` argument were enough
  (`mcp-server/README.md`).
- **Tracing a call.**
  1. A line arrives on stdin, and `handle` in `mcp-server/server.js` parses the JSON-RPC message.
  2. `callTool`, then `runEventhubTool`.
  3. `callEventhubTool` in `mcp-server/eventhub-tools.js`.
  4. `services.auth.getUserBySessionToken`, then the service, for example
     `registrationService.registerForEvent`.

  It stops being MCP at step 4, when the service is called.
- **Identity.** The user whose session is in `MCP_TOKEN`. An agent with my token can list events,
  register me, and cancel *my* registrations. It cannot touch someone else's registration, go over
  capacity, or create or delete events.
- **If a tool wrote its own SQL.** It would skip the ownership and capacity rules, and the app would
  have two front doors with different rules.
- **Tool errors vs protocol errors.**
  - A tool error is a valid answer with `isError: true`, for example "event full" or "no lecture 99".
  - A protocol error means the request itself was wrong: `-32601` unknown method, `-32602` bad
    arguments or unknown tool, `-32700` broken JSON.

### Interface

- **Server vs browser.** The server renders no pages: `src/frontend.js` serves the built `index.html`
  and JS, and React draws everything in the browser.
  - Why: one process and one deploy, and every rule stays on the server behind a plain JSON API.
  - The cost: the request chain, about 2.3 s live.
- **One click, file by file.**
  1. „Запиши ме“ in `client/src/pages/EventsPages.jsx`.
  2. `api.registerForEvent` in `client/src/api.js`.
  3. `POST /api/events/:id/registrations` in `src/routes/events.js`.
  4. `registrationService`, then `eventsRepo` and `registrationsRepo`.
  5. PostgreSQL.
  6. Back with `201`: the page updates the seat count and shows the success message, and focus stays
     on the button.
- **Where state lives.** The signed-in user is in `AuthContext` (`client/src/auth.jsx`). Each page
  keeps its data in `useAsync` (`client/src/lib/useAsync.js`), with loading, error and success. When
  that changes, only that page re-renders.
- **The four states.** On `/events`: skeleton cards, the list, „Няма предстоящи събития“, and
  „Нещо се обърка“ with „Опитай отново“. Live error: on my laptop, `npm run db:stop` and reload
  (AC-37).
- **Narrow screens.** At 380 px the cards stack in one column, with no horizontal scrolling (AC-36,
  and Lighthouse in `docs/UI.md`).
- **Keyboard only.** Tab to „Запиши ме“, press Enter, and focus stays on the same button
  (AC-38, `tests/ui/keyboard.test.jsx`).
- **Before data arrives.** Skeleton cards, and „Зареждане на събитията...“ for screen readers. The
  header and menu wait for the session check, so nothing jumps (CLS 0).

### Tests and coverage

- **One acceptance criterion.** `npx vitest run -t "AC-7"`.
- **Rules tests vs API tests.**
  - `tests/services/` prove the rules without HTTP: they are fast and can reach every branch.
  - `tests/api/` prove the HTTP layer through Express with Supertest: the status codes, the JSON
    shape and the cookies.
  - Both exist because a correct rule can still be mapped to the wrong status.
- **Coverage numbers** are in "How I know it works".
- **A failure-path test.** AC-7 sends many concurrent requests for a few seats and checks that
  capacity is never exceeded. AC-24 checks that an unverified Google e-mail is refused. Failure
  paths reveal more because the happy path is what everyone tests anyway.
- **A test fails after the agent changed something.**
  1. Read the failure.
  2. Decide whether the code broke or the requirement changed.
  3. If the code broke, fix the code. If the requirement changed, change `SPEC.md` first (with my
     approval), then the test.
  4. Never loosen the test.
- **Why weakening a test is banned.** A weakened test still passes when the bug is there, so a green
  CI would mean nothing.

### CI and deployment

- **What runs in CI.** `.github/workflows/ci.yml` has four jobs:
  - tests plus the Docker image build;
  - coverage with the 80% and 100% gates;
  - the MCP check;
  - the spec check.

  A red build blocks nothing on its own today: Render deploys on every commit (gap 1). The fix is
  "After CI Checks Pass" in Render.
- **From `git push` to a running service.**
  1. GitHub.
  2. Render's Auto-Deploy.
  3. The Docker build from the `Dockerfile`.
  4. The container starts: `scripts/migrate.js`, then `src/server.js`.
  5. Render's health check on `/health`.
  6. Traffic switches to the new instance, with no downtime (seen in the rollback drill).
- **Environment variables.** The table is in `READINESS.md` section 2. The secrets are
  `DATABASE_URL`, `GOOGLE_CLIENT_SECRET` and `GEMINI_API_KEY` (plus `MCP_TOKEN` and `SEED_PASSWORD`,
  which are only on my machine). They live in Render's Environment and in my git-ignored `.env`.
- **The first request after an idle hour.** The free plan has stopped the service, so the first
  visitor waits while it starts and sees the browser loading. I have not measured how long (gap 6).
- **What is in the image.** It is built in **two** stages, not one:
  - The first installs everything and builds the client.
  - The second gets only the production dependencies, `dist/`, `src/`, `migrations/` and two
    scripts, and it runs as the `node` user, not root.
  - The final image is smaller and has no build tools.

### Working with the agent

- **A plan I corrected.**
  - The rollback drill: the agent first planned to break `DATABASE_URL`. After reading Render's
    documentation, it used the wrong `APP_BASE_URL` instead, which can be seen from outside and is
    restored by the rollback.
  - The model: I did not take Google's suggestion, `gemini-3.8-flash`, because it was overloaded in
    the measurements.
- **Mistakes found later.**
  - The register and cancel button was two elements, so keyboard focus was lost (found while
    planning the keyboard test).
  - The page jumped by CLS 0.1 on mobile (found by Lighthouse).
  - `APP_BASE_URL` pointed at another site (found by checking the `redirect_uri` sent to Google).
  - The live test had a 20 s limit while a sleeping service needs longer (found reading the test
    before `liveUrl` went to GitHub).
- **What in `AGENTS.md` keeps the agent in line.**
  - The "ask first" list: secrets, migrations, dependencies, sign-in rules, MCP tools.
  - The "never" list: weaken tests, lower coverage, bypass the services, log secrets.
  - The layer rules.
  - A test before every bug fix.
  - Report spec differences instead of changing them silently.
- **A file I cannot explain.** See the section above: the ID token check in
  `src/integrations/googleOAuthClient.js`.
