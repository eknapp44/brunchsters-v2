# Plan 0006 — End-to-End Testing Infrastructure

**Companion to:** `spec.md`

---

## Architecture

### Files introduced

```
docs/adrs/0007-e2e-testing-stack.md                  (new — committed with the spec)

apps/web/playwright.config.ts                        (new — M1)
apps/web/e2e/global-setup.ts                         (new — M1: target guard + server-uses-e2e-db check)
apps/web/e2e/support/env.ts                          (new — M1: reads DATABASE_URL / BASE_URL / AUTH_*)
apps/web/e2e/support/db.ts                           (new — M2: Prisma client for fixtures)
apps/web/e2e/support/session.ts                      (new — M2: mint session cookie via next-auth/jwt)
apps/web/e2e/support/factories.ts                    (new — M2+: createUser, createBrunch, invite/RSVP/vote helpers)
apps/web/e2e/support/places.ts                       (new — M2: page.route fixtures for /api/v1/places/**)
apps/web/e2e/support/fixtures.ts                     (new — M2: test.extend — actor fixtures, per-test data)
apps/web/e2e/journeys/*.spec.ts                      (new — M2..M7: one file per area)
apps/web/scripts/e2e-db-reset.ts                     (new — M1)

apps/web/package.json                                (updated — M1: test:e2e, e2e:db:reset)
package.json (root)                                  (updated — M1: test:e2e passthrough; NOT part of `pnpm test`)
apps/web/vitest.config.ts                            (updated — M1: exclude e2e/)
.github/workflows/ci.yml                             (updated — M3: e2e job)
.github/workflows/release.yml                        (removed — M8: the release job now lives in ci.yml)
docs/SETUP.md, docs/PLANNING.md, CLAUDE.md           (updated — M3 / M8)
```

`apps/web/src/auth.ts` and the Places route handlers are deliberately **not** touched.

### Environment

| Variable                                                             | Local                                                                                       | CI                                                                      |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `E2E_DATABASE_URL` (server gets it as `DATABASE_URL` / `DIRECT_URL`) | `…/brunchsters_e2e` on the local Supabase Postgres (port 54322), the built-in default       | the job's Postgres 17 service container; database must be named `*_e2e` |
| `BASE_URL` / `AUTH_URL`                                              | `http://localhost:3100`                                                                     | `http://localhost:3100`                                                 |
| `AUTH_SECRET`                                                        | a fixed non-secret test value, shared by the test process and the server                    | same                                                                    |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`                          | placeholders (needed only so `auth.ts` boots)                                               | placeholders                                                            |
| `GOOGLE_PLACES_API_KEY`                                              | set to **empty** (requests are intercepted; empty stops `.env.local`'s real key leaking in) | empty                                                                   |

The server is started by Playwright's `webServer` with this env set explicitly (`next dev -p 3100` locally, `next build && next start -p 3100` in CI). Process env takes precedence over `.env.local` in Next; M1 verifies this and records it.

### The guard

`global-setup.ts` runs before any test:

1. Parse `E2E_DATABASE_URL` (the suite's own variable, never the dev `DATABASE_URL`); fail unless the database name ends in `_e2e` (or `e2e`) **and** the host is `localhost`/`127.0.0.1` (CI's service container is on localhost too). This is a deliberate allow-list, so pointing the suite at a real environment is a code change, not a typo.
2. Hit a lightweight check against the running server proving it is on the e2e DB. Mechanism chosen in M1 (candidates: fixtures create a marker row and the server-rendered result is inspected; or a test-only response header — rejected if it needs production code). If no mechanism avoids touching production code, rely on the dedicated port plus explicit `webServer.env` and record the residual risk.

### Authentication

```
createUser()  ──►  signInWithProvider({ provider:'google', providerUserId:<uuid>, email:<unique>, name, db })
                      │  returns userId
                      ▼
mintSessionCookie(userId, email, name)  ──►  encode({ token:{ userId, email, name, sub }, secret: AUTH_SECRET, salt: <cookieName> })
                      │   cookieName = authjs.session-token  (http)  |  __Secure-authjs.session-token (https)
                      ▼
browser.newContext({ storageState: { cookies:[…] } })     // one context per actor
```

An `Actor` fixture bundles `{ user, context, page }`. Multi-actor tests request several (`host`, `invitee`, `stranger`); each gets its own context, so identities never share cookies.

### Data per test

- Reference data (lookup tables) is seeded once by `e2e:db:reset`.
- A `factories.ts` function per step, each wrapping the real core service with an explicit `ctx` (`db`, `NoopEventBus`): `createUser`, `createBrunch`, `sendInvites`, `respondToInvite`, `castBallot`, `closeVoting`, … Fixtures put a brunch into the starting state a journey needs (e.g. "active brunch, host + 3 yes-attendees, 2 locations, 2 times") and the test drives only the step under test through the UI.
- Emails and titles include a per-test unique suffix, so parallel workers never collide. No reset between tests; the e2e database is disposable.
- Invite links: email is a no-op, so a helper reads the invite token from the DB and builds `/invite/<token>`.

### Places

`support/places.ts` exposes `mockPlaces(page, fixtures)`, which routes `GET /api/v1/places/search` and `GET /api/v1/places/[placeId]` to fixture responses shaped like the real routes' output (a few named places with distinct IANA timezones so V6 is testable). Response shapes are copied from the route tests so drift is visible in review.

### Time

Deadline journeys (H2, H7) use relative dates computed in the test, plus Playwright's clock control (`page.clock`) for H7. No fixed calendar dates anywhere.

### Selectors and style

`getByRole` / `getByLabel` first. Where a control has no accessible name, prefer adding an accessible label to the component (it improves the product) over a `data-testid`; use `data-testid` only as a last resort. Assertions are web-first; no `waitForTimeout`. Page objects only when a flow is reused by 3+ journeys (the wizard, the ballot).

### CI

New job `e2e` in `ci.yml`: Postgres 17 service container; `pnpm install`, `db:generate`, `migrate deploy`, `db:seed`; `pnpm build`; `playwright install --with-deps chromium` (cached); `pnpm test:e2e`; upload `playwright-report/` and traces on failure. Retries: 1 in CI, 0 locally. Test files shard-ready (no cross-file state) so `--shard` can be added if runtime grows.

Release gating (M8, done): the release job moved from `release.yml` into `ci.yml` and `needs` every other job, gated on `github.event_name == 'push' && github.ref == 'refs/heads/main'`; CI now also triggers on `push` to `main`. `release.yml` was removed. Chosen over `workflow_run` because a `needs` dependency within one workflow run is exact (same commit), whereas `workflow_run` follows the latest `main` and semantic-release refuses to release anything but the current branch tip. See ADR 0007.

---

## Decisions already made (do not reopen without an ADR amendment)

See ADR 0007: cookie minting not a Credentials provider; no testcontainers for now; Chromium only; browser-level Places interception; fixtures through core services; tests in `apps/web/e2e/`; release gated on CI.

## Risks

| Risk                                           | Mitigation                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Flaky tests erode trust                        | Web-first assertions, per-test data, 1 CI retry with investigation, no shared state              |
| Auth.js upgrade breaks cookie minting          | Failure is loud (everything unauthenticated); helper is one file; covered by A1/A2 failing first |
| Server silently on the wrong DB                | Dedicated port, explicit `webServer.env`, guard in global setup                                  |
| Suite runtime grows                            | Keep to journeys; sharding-ready; extra browsers nightly only                                    |
| Places fixtures drift from real response shape | Shapes copied from route tests; update-in-same-PR rule in ADR                                    |
| E2E slows every PR                             | One Chromium project, cached browser install, single build                                       |
