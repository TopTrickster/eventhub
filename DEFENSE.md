# Defence notes

<!-- Exercise 5 writes this, before the defence, while the project is fresh.
     These are your own answers, in your own words. The question bank is on the course
     site under Resources → The defence. The committee will not ask whether an agent
     wrote the code; everyone in the room knows it did, and the course required it.
     It will ask whether the system is yours. -->

> Drafted by Claude Code on 30.10.2026 at the author's request (this year the course allows AI for
> this). It is written in the first person as the author's notes. Before the defence the author
> reads it, rewrites anything they would say differently, and opens every file named here once.

## What it does

EventHub lets student clubs publish events with a limited number of seats. Students sign in, see what
is coming up and take or give back a seat; organizers create and manage their own club's events and
see who registered. Demo: sign in as `student1`, register for the park clean-up and watch the free
seats go from 20 to 19. Then sign in as `organizer2` and show that `organizer1`'s hackathon cannot be
edited or deleted (`403`). Last, as `organizer1`, use „Предложи с AI“ on a new event.

## The three files I will open

1. `src/services/registrationService.js` (`registerForEvent`), because it is where a rule is enforced
   under load. Inside one transaction it locks the event row (`SELECT … FOR UPDATE` in
   `src/data/eventsRepo.js`), refuses past events and double registrations, counts the taken seats
   and inserts only if one is free. Two people racing for the last seat are serialised by the lock, so
   one gets it and the other gets `409 EVENT_FULL`. `tests/data/concurrency.test.js` (AC-7) proves it
   with real concurrent requests.
2. `mcp-server/eventhub-tools.js` (`callEventhubTool`), because it shows the boundary between layers.
   The MCP server is a second front door, but it turns `MCP_TOKEN` into a user exactly like the
   browser cookie, then calls the same service functions as the REST routes. It has no SQL and no
   permission checks of its own, so it cannot have different rules from the website.
3. `src/services/eventDraftService.js`, my choice, because it is where a model that can be wrong
   meets the app. It sends only the organizer's sentence, gives the model 5 seconds, validates the
   answer against the same limits as the form, and turns every failure into one predictable fallback.
   Nothing it returns is saved automatically.

## Decisions I can defend

- **Stack:** I chose Node 22 with Express 5, PostgreSQL through `pg` with hand-written parameterized
  SQL, and React 19 built by Vite, with the same Express process serving the built client. I rejected
  an ORM, because I wanted to see the transaction and the row lock for the last seat, not trust an
  abstraction to do it. I also rejected a separate frontend host or Next.js: that is one more deploy
  and a CORS setup, for no gain at this size. With many more tables I would reconsider a query
  builder. With heavy page traffic I would put the static files behind a CDN.
- **Where the rules live:** in `src/services/`, nowhere else. Routes only read the request and map
  errors to status codes; `src/data/` only runs SQL. Every service receives `currentUser` and checks
  ownership against the row itself: `events.organizer_id`, `clubs.owner_id`, or the caller's own id
  for registrations. I rejected checks in the routes, because then the MCP tools would have needed
  their own copy. Rules that the database can hold are also constraints: `UNIQUE (event_id, user_id)`,
  capacity `1–500`, end after start. If a rule could be written as a constraint, I would move it into
  the database as well.
- **Authentication and authorization:**
  - **Sign-in.** Email and password, hashed with Argon2id, or Google sign-in. Google sign-in uses
    `state`, `nonce` and PKCE, and the code is exchanged on the server.
  - **Linking.** A Google account links to an existing user only when Google says the e-mail is
    verified (AC-23, AC-24).
  - **Sessions.** A session is a random token in an `HttpOnly; Secure; SameSite=Lax` cookie. The
    database stores only its SHA-256 hash, for 7 days.
  - **Why not a JWT in `localStorage`.** A script injected into the page (XSS) could read it, and
    signing out could not revoke it.
  - **Authorization.** The role says what *kind* of thing someone may do (only organizers create
    events). Ownership says *which rows*. `organizer2` is an organizer, and still gets `403` on
    `organizer1`'s event.
  - **What would change my mind.** If the app grew to several services, I would consider a shared
    identity provider.
- **The model, and why that one:** Google `gemini-3.5-flash-lite`. The spec first said
  `gemini-2.5-flash`, but on 30.10.2026 Google refused it for new keys (`404`, "no longer available
  to new users"). I measured the alternatives through the app's own code with its 5-second limit.
  `gemini-3.8-flash` was overloaded (`503` after 16–22 s). `gemini-3.5-flash` returned `503`, and
  `gemini-flash-latest` did not answer within 5 s. Flash-Lite answered in 10 of 12 calls, in 0.9–4 s.
  The task is small (a title, a summary, one of five categories), so a small fast model is enough.
  One call is about $0.0002 at the paid price (161 input and about 60 output tokens; see
  `READINESS.md`). I would change it if the production logs show many fallbacks.
- **What the MCP server exposes, and what it deliberately does not:**
  - **Exposes.** Two lecture tools from Exercise 1, plus five EventHub tools: `upcoming_events`,
    `my_registrations`, `register_for_event`, `cancel_registration`, and `suggest_event_draft`
    (organizers only).
  - **Does not expose.** Creating, editing or deleting events. Attendee lists, which are other
    people's personal data. Any way to act as someone else. An admin token. SQL.
  - **Whose rights it has.** It acts as the one user whose session is in `MCP_TOKEN`, so an AI
    client gets exactly that person's rights and nothing more.
- **The database shape:** six tables in four migrations: `users`, `oauth_accounts`, `sessions`,
  `clubs`, `events` and `registrations`. The many-to-many is `users` ⇄ `events` through
  `registrations`: one row is one taken seat, and free seats are counted from those rows, never
  stored, so they cannot drift. A user owns many clubs, a club has many events, and an organizer runs
  many events. Deleting an event deletes its registrations (`ON DELETE CASCADE`). The tests run
  against a real PostgreSQL, so the constraints are tested too.

## How I know it works

- **Tests.** Every acceptance criterion `AC-1`…`AC-48` in `SPEC.md` has a test with its id in the
  name (`tests/project/traceability.test.js` checks that). The whole suite runs with
  `npm run coverage` against a throwaway PostgreSQL.
- **Results on 30.10.2026.** 122 tests passed and 2 were skipped (AC-20 and AC-43, which test the
  live site). Against the live site, `tests/smoke` passes 3/3, including AC-20 and AC-43.
  Coverage is 98.7% of statements and 96.3% of branches overall. The CI gates are 80% overall and
  100% for `src/services`.
- **What the coverage does not tell me.**
  - Whether the page looks right. For that there are the Lighthouse runs in `docs/UI.md`:
    Accessibility 100, CLS 0, Performance 93–100.
  - Whether the real Google sign-in and the real Gemini work. The tests use fakes. I checked both
    by hand with my own keys.
  - Anything about production. For that there are the live tests: AC-20 and AC-43 pass against
    https://eventhub-5wcj.onrender.com. There is also the rollback drill in `READINESS.md`.
  - `mcp-server/server.js`. It runs as a child process in the tests, so it is not in the numbers.
    `node mcp-server/check.mjs -- node mcp-server/server.js` passes 12/12.
- **Checked by hand on a production build.**
  - Registering and cancelling as `student1`.
  - `401` on every write endpoint without a session.
  - `403` when `organizer2` tries to edit or delete `organizer1`'s event.
  - The fallback with the key removed.
  - The error screen with the database unreachable.
  - The details are in `READINESS.md` and in `SPEC.md` → "Spec vs result".

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
- The events page waits on three trips in a row, about 2.3 s live, partly because the server is in Oregon.
- There is no favicon.
- The model misses the 5 s limit about once in six calls.

## The thing in this repository I did not write and cannot explain

> Drafted by the agent as a suggestion: the author replaces it with their own honest answer.

I did not write the code by hand; Claude Code wrote it from my `SPEC.md` and `AGENTS.md`, as the
course required. The part I would find hardest to explain without notes is in
`src/integrations/googleOAuthClient.js`. The ID token from Google is decoded and its claims are
checked: issuer, audience, expiry and nonce. Its **signature is not verified**. That is allowed when
the token comes straight from Google's token endpoint over HTTPS, in a request made with our client
secret, because then nobody in between could have changed it. I need to be able to say why that is
safe, and when it would not be: for example, if the browser handed us the token.
