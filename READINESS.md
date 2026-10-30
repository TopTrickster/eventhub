# Readiness report: EventHub

Written on 30.10.2026 by Claude Code at the author's request (the course allowed AI for this
document), from checks it ran that day. Everything was run against a **local production build**
(`npm run build`, then `NODE_ENV=production node src/server.js`) with the local PostgreSQL, because
the app is not deployed yet. Each "How I checked" note names what was run and what was seen. The
parts that need the deployment are marked **Not checked yet** and listed as gap 1.

## 1. Live URL and how to verify it

- **URL:** **https://eventhub-5wcj.onrender.com** (Render web service from `render.yaml`, Oregon, free
  plan; database on Neon). It is also in `course.json` (`liveUrl`).
- **Quick check 1:** `curl <live URL>/health` must answer `200` and `{"status":"ok","database":"ok"}`.
  If the database is unreachable it answers `503` and `{"status":"degraded","database":"unavailable"}`.
- **Quick check 2:** open the URL, sign in with a demo account, and see the three seeded events on
  `/events`, with free seats.
- **Quick check 3:** `node checks/ex4.mjs` reads `liveUrl` and checks the deployment itself.
- How I checked (locally, 30.10.2026): with a working database `/health` answered
  `200 {"status":"ok","database":"ok"}`. With `DATABASE_URL` pointed at a closed port it answered
  `503 {"status":"degraded","database":"unavailable"}`.
- How I checked (live, 30.10.2026):
  - `curl https://eventhub-5wcj.onrender.com/health` answered `200 {"status":"ok","database":"ok"}`
    in 0.4 s while the service was awake.
  - `node checks/ex4.mjs` passed 33 of 34. The live checks pass: `/health` 200 and the site serves a
    page. The one failure is the local `.env` file on disk (it is git-ignored and was never committed).
  - `npx vitest run tests/smoke`, run by the author with the demo accounts in the `SMOKE_*`
    variables: **3 of 3 passed**.
    - AC-20: the public deployment and the database.
    - AC-43, in 7.8 s: `student1` lists events, registers for one with a free seat and cancels again,
      and `organizer1` gets an AI draft (`model` or `fallback`).
  - The author signed in on the live site with `organizer1` and with their Google account. Google
    sign-in worked only after two configuration fixes (section 3, last row).

## 2. Environment variables

| Name | What it is for | Where the value comes from | Secret? |
|---|---|---|---|
| `NODE_ENV` | `production` turns on Secure cookies, the CSP header, `trust proxy` and the built client | `render.yaml` | no |
| `PORT` | Port the server listens on | `render.yaml` (3000) | no |
| `APP_BASE_URL` | Public address; the Origin check and the Google redirect URI are built from it | Render dashboard, the service URL | no |
| `DATABASE_URL` | PostgreSQL connection string, with `?sslmode=require` | Neon dashboard → Connection string | **yes** (contains the DB password) |
| `GOOGLE_CLIENT_ID` | Google sign-in client | Google Cloud Console → Credentials | no (it appears in the Google sign-in URL) but kept out of git |
| `GOOGLE_CLIENT_SECRET` | Exchanges Google's code for tokens, server side only | Google Cloud Console → Credentials | **yes** |
| `GOOGLE_REDIRECT_URI` | Optional; defaults to `APP_BASE_URL` + `/api/auth/google/callback` | not set | no |
| `GEMINI_API_KEY` | The AI event draft; without it the app uses the fallback draft | Google AI Studio → API keys | **yes** |
| `MODEL_NAME` | Which Gemini model (`gemini-3.5-flash-lite`) | `render.yaml` | no |
| `MCP_TOKEN` | The session the MCP server acts as (section 9). Not used by the web service | `npm run mcp:token`, in the author's local `.env` only | **yes** (a 7-day session token) |
| `SEED_PASSWORD` | Password of the demo accounts when seeding Neon; required in production | typed in the author's own shell for one `npm run db:seed` | **yes** |
| `SESSION_SECRET` | Not used: sessions are random tokens stored hashed, so nothing is signed | not set | — |
| `DATABASE_URL_TEST` | Optional: run tests against this database instead of a throwaway one | not set | yes if set |

- How I checked: compared `src/config/env.js`, `scripts/*.js` and `mcp-server/*.js` (every `env.X`
  they read) with `.env.example` and `render.yaml`. Nothing is read that is not in this table.
  `tests/project/docs.test.js` (AC-40) checks that `.env.example` lists the secret names with
  empty values. In `render.yaml` the five secrets have `sync: false`, which means no value in git.

## 3. What happens when things fail

| Failure | What the user sees | How I checked |
|---|---|---|
| **Database unreachable** | `/events` shows „Нещо се обърка“, „Възникна неочаквана грешка. Опитайте отново по-късно.“ and an „Опитай отново“ button. No JSON or stack trace. `/health` answers `503 degraded`. The server log line is `[error] GET /api/auth/me: AggregateError (ECONNREFUSED)`: the error type only, no request data. | Started a second copy with `DATABASE_URL=postgres://…@localhost:5499/eventhub` (nothing listens there), opened `/events` in the browser and read the page; the API answered `500` in 4 ms. |
| **Bad deploy and rollback** (drill on 30.10.2026) | During the bad deploy, Google sign-in failed: the app sent Google a callback address on another site. Everything else worked. During both deploys the site stayed up. | The drill repeated the real mistake from the first deploy: `APP_BASE_URL` set to `https://eventhub.onrender.com`, then **Save, rebuild and deploy**. Render's Events show the bad deploy starting at 23:26 and live at 23:27. A monitor script checked `/health` and the `redirect_uri` that `/api/auth/google` sends to Google every 5 s. It saw the bad address from **23:27:16**. **Rollback**: Render → Events → "Rollback to" the previous good deploy. It started at 23:29 (it reuses the old build, so there is no build step) and was live by **23:29:48**, when the monitor saw the right address again. **The rollback took under a minute**, and the bad version was live for 2 min 32 s in total, including the time to notice it and click. `/health` was `ok` in all 51 checks, so there was **no downtime**. A Dashboard rollback switches Render's Auto-Deploy off. It must be set back to "On Commit" in Settings, or the next push does not deploy. |
| **Invalid user input** | A sentence per field next to the field, not a crash. | `POST /api/events` with every field wrong → `400 VALIDATION_ERROR` and 7 field messages (title, description, category, location, capacity, start in the past, end before start). Broken JSON → `400 INVALID_JSON` „Заявката не е валиден JSON.“. AI text of 1 character → `400` „Описанието за AI трябва да е между 10 и 500 символа.“ (no model call). Tests: `tests/api/validation.test.js`. |
| **Event full / many people racing for the last seat** | „Няма свободни места“ on the event; the server's sentence for a full event. | `tests/data/concurrency.test.js` (AC-7: concurrent registrations never go over capacity); `tests/ui/states.test.jsx` „a full event answers with the server’s sentence“. |
| **Model provider down or slow** | Section 8: the yellow fallback note, and the form keeps working. | Section 8. |
| **Google sign-in fails or is cancelled** | Back on `/login` with a sentence saying why. | `tests/ui/states.test.jsx` „/login explains why a Google sign-in came back“; `tests/services/oauth.test.js` (AC-24 unverified email is refused). |
| **Wrong Google settings in production** (happened on 30.10.2026) | `/login?error=google_failed`: „Входът с Google не беше завършен. Опитайте отново.“ The app kept working, and password sign-in was not affected. | It happened for real on the first deploy. First, `APP_BASE_URL` pointed at `eventhub.onrender.com`, which is another site, so Google would have sent people there. `curl` on `/api/auth/google` showed the wrong `redirect_uri`; it was fixed in Render's Environment. Second, Render's log showed `[oauth] code_rejected`. The `.env` pair was valid (Google's token endpoint answered `invalid_grant`, not `invalid_client`, to a made-up code), and Render used the same client ID. The author re-entered `GOOGLE_CLIENT_SECRET` on Render, and Google sign-in then worked. |

## 4. Four states of one screen

Screen: **`/events`** (the upcoming events list), loaded with `GET /api/events`.

- **Loading:** three grey skeleton cards, and for screen readers `role="status"` „Зареждане на събитията...“.
  The header and menu are not drawn until the session check ends, so nothing jumps (CLS 0, see `docs/UI.md`).
- **Content:** one card per event with club, category, title, date and time, place, capacity, and
  „Свободни места: 28 от 30“ or „Няма свободни места“; „Записани сте“ on events you joined.
- **Empty:** „Няма предстоящи събития“, „Когато някой клуб публикува събитие, то ще се появи тук.“,
  and for organizers a „Създайте събитие“ button.
- **Error:** „Нещо се обърка“, the server's sentence, and „Опитай отново“, which loads the list again.
- How I checked: content and error in the browser on 30.10.2026 (content as `student1`; error with the
  copy that has no database, section 3). All four states in `tests/ui/states.test.jsx`: „/events:
  skeleton while loading, then the empty state“ and „/events: a failed load says why and can be
  retried into the list“ (AC-37).

## 5. Request waterfall

Measured on `/events` as a signed-in student, local production build, **empty cache**: the page was
opened on a port the browser had never loaded (`localhost:3004`), and every response had a non-zero
transfer size, so nothing came from the cache.

| # | Request | Type | Start | End | Size | Waits for |
|---|---|---|---|---|---|---|
| 1 | `/events` (HTML) | document | 0 ms | 9 ms | 0.9 kB | — |
| 2 | `/assets/index-….js` | script | 14 ms | 25 ms | 294 kB | 1 |
| 3 | `/assets/index-….css` | stylesheet | 14 ms | 25 ms | 9 kB | 1 |
| 4 | `/api/auth/me` | fetch | 63 ms | 108 ms | 0.4 kB | 2 (the JS has to run first) |
| 5 | `/api/events` | fetch | 114 ms | 128 ms | 2.4 kB | 4 (the list waits for the session check) |

- **5 requests, Finish 128 ms**, DOMContentLoaded 53 ms. 2 and 3 run in parallel. 4 and 5 are a
  chain: the list is requested only after the session check answers, which adds one round trip.
  On Render and Neon each of those waits is a network round trip, so the live numbers will be larger.
- Locally the JS is sent uncompressed (294 kB). On Render it arrives compressed (see below).
- How I checked: `performance.getEntriesByType('navigation' | 'resource')` in the browser pane right
  after loading the page (start, `responseEnd` and `transferSize` for each request). This is the same
  data as the Network tab.

**Live, 30.10.2026**, at https://eventhub-5wcj.onrender.com/events. The author's browser (Firefox
DevTools → Network, **Disable Cache** on, no throttling), signed in as `student1`, from Bulgaria;
the Render service runs in Oregon.

| # | Request | Type | Time | On the wire (size) | Waits for |
|---|---|---|---|---|---|
| 1 | `/events` (HTML) | document | 232 ms | 1.03 kB (599 B) | — |
| 2 | `/assets/index-….js` | script | 1068 ms | 92.73 kB (293.69 kB) | 1 |
| 3 | `/assets/index-….css` | stylesheet | 218 ms | 2.98 kB (8.76 kB) | 1 |
| 4 | `/favicon.ico` | answered with the HTML page | 213 ms | 1.03 kB (599 B) | 1 |
| 5 | `/api/auth/me` | fetch | 448 ms | 755 B (143 B) | 2 (started by the JS) |
| 6 | `/api/events` | fetch | 479 ms | 1.39 kB (2.07 kB) | 5 |

- **6 requests. Finish ≈ 2.3 s.** The Finish figure is read off the timeline (its scale ends at 2.56 s
  and the last request ends shortly before that). The status bar with the exact figure was not in the
  screenshot.
- The chain is the same as locally: HTML → JS → session check → list. It now costs about 2.3 s instead
  of 0.13 s. The JS download (1.07 s) is the longest step. Each API call takes about 0.45 s, which
  points at the distance to Oregon rather than at the server. Gap 8.
- Render compresses responses: the 293.69 kB JS travels as 92.73 kB.
- `/favicon.ico` does not exist, so the client-side-route fallback answers it with `index.html`.
  It is a wasted request and the wrong content type. Gap 11.
- How I checked: the author's DevTools screenshot of the Network panel (the request list with the
  Transferred, Size and timeline columns), read by the agent.

## 6. Security basics checked

- **Secret scan:** 0 tracked files and 0 lines in the history of all 9 commits match the patterns
  for Google API keys (`AIza…`, `AQ.…`), OAuth client secrets (`GOCSPX-…`), private keys, Neon
  passwords (`npg_…`) or a Neon URL with a password. `.env` was never committed; `.env`, `.pgdata/`,
  `dist/` and `coverage/` are git-ignored. How I checked: `git grep -E` over the tracked files and
  `git log -p --all | grep -E` with those patterns; `git log --all -- .env` is empty;
  `git check-ignore -v`. `tests/project/docs.test.js` also runs the course `secretScan`.
  A Gemini key and the Google client secret were shown in chat screenshots on 30.10.2026 (never in
  a file in git). The author replaced both that day and deleted the old ones in AI Studio and the
  Google Cloud console.
- **HTTPS everywhere:**
  - `curl -I http://eventhub-5wcj.onrender.com/` answered `301 Moved Permanently` with
    `Location: https://eventhub-5wcj.onrender.com/`, so plain HTTP only redirects.
  - The live sign-in cookie for Google (`eh_oauth`) came back `HttpOnly; Secure; SameSite=Lax`, from
    `curl -D -` on `/api/auth/google`.
  - The Google redirect URI the app sends is `https://eventhub-5wcj.onrender.com/api/auth/google/callback`.
  - The app trusts one proxy hop in production, so `req.protocol` is right. The session cookie is
    `Secure`, so the browser never sends it over plain HTTP.
- **Every write endpoint refuses a visitor who is not signed in** (`401`). How I checked: curl without
  a cookie against the local production build: `POST /api/events`, `PATCH` and `DELETE /api/events/:id`,
  `POST` and `DELETE /api/events/:id/registrations(/me)`, `POST /api/clubs`, `POST /api/ai/event-draft`,
  `POST /api/auth/logout`, `POST /api/auth/password` all answered `401`. So did `GET /api/events/:id/attendees`.
- **And refuses a signed-in user who does not own the thing** (`403`). How I checked: signed in as
  `organizer2` and went after `organizer1`'s hackathon: `PATCH` → `403`;
  **`DELETE` → `403` „Можете да управлявате само собствените си събития.“**; attendees → `403`;
  creating an event in `organizer1`'s club → `403` „Можете да създавате събития само в собствения си клуб.“.
  As `student1`: `POST /api/clubs` → `403`, `DELETE` of the event → `403`. Afterwards the event still
  opened for its owner (`200`). Cancelling is `/registrations/me`, so nobody can name another person's
  registration. Tests: `tests/services/events.test.js` (AC-14 foreign event, AC-17 attendees),
  `tests/services/clubs.test.js` (AC-18), `tests/services/ownership.test.js` (AC-26).
- **Session cookie:** `eh_session=…; Path=/; Expires=(7 days); HttpOnly; Secure; SameSite=Lax`, from
  the `Set-Cookie` header of `POST /api/auth/login`.
  - `HttpOnly`: page scripts cannot read the cookie, so an XSS cannot steal the session.
  - `Secure`: it is sent only over HTTPS.
  - `SameSite=Lax`: another site cannot make the browser send it with a `POST`, `PATCH` or `DELETE`
    (CSRF). It is still sent when the user follows a link to the site.
  - `Path=/`: every page and the API get it.
  - `Expires`: it lasts 7 days. The token is random and stored only as a hash, so a leak of the
    database does not give working sessions.
- **More:**
  - A `POST` with `Origin: https://evil.example` and a valid session answered
    `403` „Заявката идва от друг сайт и беше отказана.“ (`src/middleware/security.js`).
  - Production sends `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`
    and `Referrer-Policy: same-origin` (`securityHeaders` in `src/middleware/security.js`).
  - Sign-in and registration are limited to 20 attempts per 15 minutes per address.
  - Passwords are hashed with Argon2id.
  - All SQL is parameterized in `src/data/`.
  - JSON bodies are limited to 20 kB.
  - Google sign-in uses state, nonce and PKCE (`tests/services/oauth.test.js`).

## 7. Known gaps, ranked by risk

1. **Render deploys every push to `main`, even when CI is red.** Auto-Deploy is "On Commit", so a
   commit that fails its tests still goes live. Only `/health` stands in the way, and the rollback
   drill showed that a broken setting passes `/health` (section 3). Rolling back takes under a
   minute, but someone has to notice first. Next step: Render → Settings → Auto-Deploy →
   "After CI Checks Pass".
2. **A database that hangs, instead of refusing, makes requests wait with no limit.** `createPool` in
   `src/data/db.js` sets no `connectionTimeoutMillis`, and the `pg` default is no timeout. Section 3 only
   tested a refused connection, which fails at once. If Neon stops answering, the user sees the
   loading state for a long time instead of the error. Also, the error says „неочаквана грешка“ (500)
   instead of saying the database is unavailable (503). Next step: a test first, then
   `connectionTimeoutMillis: 5000` and a 503 with a clear sentence for connection errors.
3. **A leaked `MCP_TOKEN` is that user's session for 7 days.** Only signing out with that exact token
   ends it; there is no "sign out everywhere". Next step: use a member account for MCP, not an organizer,
   keep the token only in the local `.env`, and add a way to end all of one user's sessions.
4. **On Gemini's free tier, Google may use the text to improve its products.** The text an organizer
   types for the AI draft goes to Google (section 8). The panel says „Не въвеждайте лични данни“, but
   nothing stops it. Next step: a paid key for real use, or a server-side check that refuses
   e-mail addresses and phone numbers before the call.
5. **The sign-in rate limit is in memory.** It resets on every restart or deploy and is per process,
   so with two instances an attacker gets twice the attempts. Argon2id still makes each guess slow.
   Next step: store the counters in PostgreSQL if the service ever runs more than one instance.
6. **Render's free plan stops the service after 15 minutes without traffic**, so the first visitor
   waits while it starts, and during a demo that looks like a broken site. The wait is not measured
   yet. Next step: time the first request after 15 idle minutes (`curl -w '%{time_total}' …/health`).
   Open the site a few minutes before the defence.
7. **Google sign-in is in "Testing" mode**: only the test users listed in the Google Cloud console can
   use it. Everyone else gets Google's error. Email and password sign-in works for everybody. Next
   step: add the reviewers as test users, or publish the consent screen.
8. **The events list needs three trips one after another, and the server is far away.** HTML, then
   JS, then `/api/auth/me`, then `/api/events`. That is about 2.3 s live, against 0.13 s locally
   (section 5). Each API call costs about 0.45 s from Bulgaria to Oregon. Compression is not the
   problem: Render already compresses the JS to 93 kB. Next step: start `/api/events` at the same time
   as the session check, and run Render and Neon in Frankfurt. The region of an existing Render
   service cannot be changed, so that means a new service with `region: frankfurt` in `render.yaml`.
9. **The model is sometimes slower than the 5 s limit.** That happened in 2 of 12 calls on 30.10.2026.
   The user then gets the fallback (section 8). That is by design, but it is visible. Next step: count
   fallbacks in the logs after deployment and decide whether the limit or the model should change.
10. **Configuration values are used exactly as typed, and the Google error in the log is vague.** A
    stray space or line break in `GOOGLE_CLIENT_SECRET` breaks Google sign-in. The log then says only
    `[oauth] code_rejected`, not Google's own reason (`invalid_client` or `invalid_grant`). That cost
    time on 30.10.2026. Next step: trim the values in `src/config/env.js` and add Google's error code
    to the log line, with a test.
11. **There is no favicon, so `/favicon.ico` gets the HTML page.** The browser asks for it on every
    first visit (section 5, request 4). It is harmless but wasteful. Next step: add an icon to the
    client, and answer `404` for missing files that have an extension, instead of serving `index.html`.

## 8. Model feature

- **What it does:** on `/organizer/events/new`, „Предложи с AI“ turns one sentence into a suggested
  title, summary and category. Model: Google **`gemini-3.5-flash-lite`** over the Gemini REST API. The
  suggestion fills the form; nothing is saved until the organizer presses save.
- **What data leaves the app:** only the sentence the organizer typed (10–500 characters), plus a fixed
  instruction and the JSON schema. It goes to Google (`generativelanguage.googleapis.com`). The app does
  **not** send the name, e-mail, user id, cookie, other events or registrations. The key is sent in the
  `x-goog-api-key` header, not the URL. On the free tier Google may use what it receives to improve its
  products (gap 4). The panel tells the organizer the text goes to Google and not to type personal data.
  How I checked: read `src/integrations/geminiClient.js` (the request body has `systemInstruction`,
  `contents` with the user text, and `generationConfig`, nothing else) and `src/services/eventDraftService.js`.
- **Cost of one call:** official Standard (paid) tier price from
  `https://ai.google.dev/gemini-api/docs/pricing`, checked on **30.10.2026**: **$0.30 per 1M input
  tokens** and **$2.50 per 1M output tokens**, thinking tokens included. Three real calls with the app's
  exact request used **161 input tokens** and **50–65 output tokens** (0 thinking tokens). That is
  161 × $0.30/1M + 65 × $2.50/1M ≈ **$0.0002 per call** (0.02 US cents), so about $0.20 per 1,000
  drafts. The free tier, which this project uses, costs $0. How I checked: a script sent the request
  `geminiClient.js` builds 3 times and printed `usageMetadata` (token counts only).
- **When the provider is down:** every failure gives the same fallback draft: title and summary from
  the organizer's own sentence, category `other`, `source: "fallback"`. The yellow note says
  „AI предложението не е налично. Можете да редактирате полетата ръчно.“, and the form keeps working.
  This covers a missing key, a timeout after 5 s, a network error, 429, other HTTP errors, an empty or
  invalid answer, and an answer that breaks the limits.
  How I checked: **removed the key** by starting a copy with `GEMINI_API_KEY=` (empty). It printed
  „GEMINI_API_KEY is not set: AI drafts will use the fallback.“, and `POST /api/ai/event-draft` answered
  `200` with `source: "fallback"` and that message in 7 ms. The log line was
  `[ai] event draft fallback: missing_key`, without the text. With the key, the same request answered
  `source: "model"` in 1.7 s. Tests: `tests/services/event-draft.test.js` (AC-27 to AC-31).
- **What it may not do:** the instruction forbids inventing dates, times, place or capacity. The answer
  must pass `validateDraft` (lengths, category from the fixed list) before anyone sees it. Raw model output
  never reaches the page.

## 9. MCP

- **Tools offered:** `find_lecture` and `search_lectures` (Exercise 1, local data), and five over
  EventHub: `upcoming_events`, `my_registrations`, `register_for_event`, `cancel_registration` and
  `suggest_event_draft` (organizers only).
- **Who may call them:** whoever runs `npm run mcp` with a valid `MCP_TOKEN`, usually the author's AI
  client on their own machine. It speaks JSON-RPC over stdio, so it is **not** on the internet; the
  Render service does not start it. To use it against the live data, it runs locally with the Neon
  `DATABASE_URL` and a token from `npm run mcp:token` run against that database.
- **What a token grants:** `MCP_TOKEN` is an ordinary session token of one user, checked exactly like the
  browser cookie, and it lasts 7 days. The EventHub tools call the same services as the REST routes with
  that user as `currentUser`, so they can do only what that person can do in the browser. A member can
  list events and join or leave events with free seats. Only an organizer can use `suggest_event_draft`.
  Nobody can touch another person's registration or go over capacity. There is no admin or master token.
  Without a valid token the EventHub tools answer `isError: true`
  „MCP_TOKEN is missing or is not a valid session…“, and the lecture tools still work.
- How I checked: `node mcp-server/check.mjs -- node mcp-server/server.js` passes 12/12. A recorded
  session is in `mcp-server/README.md`. `tests/mcp/security.test.js` (AC-34) checks that a member
  cannot cancel someone else's registration or go over capacity through MCP, and that a missing or
  expired token is refused. `tests/mcp/protocol.test.js` (AC-32, AC-35) checks the protocol over stdio.
