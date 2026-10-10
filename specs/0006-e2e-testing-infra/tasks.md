# Tasks 0006 — End-to-End Testing Infrastructure

Infrastructure and CI land first (M1–M3), so every journey milestone (M4–M7) runs in CI from the day it is written. Release gating is last (M8) because it depends on a stable CI job. Testing notes are filled in as each milestone completes (CLAUDE.md — Testing notes required per milestone). Branch: `feat/0006-e2e-testing-infra`. Close each milestone with `/milestone-done`.

For this spec "tests" means the Playwright suite itself; "green" for a journey milestone means `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` all pass.

---

## M1 — Playwright foundation and e2e database

- [x] Commit ADR 0007 and this spec (docs-only commit, before any code) — `d548770`
- [x] Add `@playwright/test` to `apps/web`; Chromium only (also added `tsx` as a devDependency for the reset script)
- [x] `playwright.config.ts`: `testDir: e2e/journeys`, one Chromium project, `webServer` on port 3100 with explicit env (`DATABASE_URL`, `DIRECT_URL`, `AUTH_URL`, `AUTH_SECRET`, placeholder Google creds), retries 1 in CI / 0 locally, trace on first retry, web-first defaults
- [x] `e2e/support/env.ts`: single place that reads `E2E_DATABASE_URL` / `BASE_URL` (**diverged:** `E2E_DATABASE_URL`, not `DATABASE_URL` — see notes)
- [x] `scripts/e2e-db-reset.ts` and `pnpm e2e:db:reset`: create-or-recreate the `brunchsters_e2e` database, `migrate deploy`, run the seed — non-interactive, works on Windows
- [x] `global-setup.ts`: allow-list guard on the e2e database URL; ~~server-uses-e2e-db check~~ **replaced** by `reuseExistingServer: false` plus a one-off probe (see notes)
- [x] Verify and record: does `webServer.env` override `apps/web/.env.local`? **Yes.**
- [x] Exclude `e2e/journeys` from `apps/web`'s vitest config; lint and typecheck now cover `e2e/`, `scripts/` and `playwright.config.ts`
- [x] Scripts: `pnpm test:e2e` (root passthrough) — **not** wired into `pnpm test` / turbo `test`
- [x] One smoke spec: `/` renders the public landing page (**diverged:** `/` is currently a "Coming soon" stub with no sign-in CTA, so the spec asserts the heading; sign-in is covered from M2)
- [x] A guard test (vitest, not Playwright): the allow-list rejects a dev DB URL, a remote host, and a missing URL; accepts the e2e URL
- [x] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` pass
- [x] Commit: `test: add Playwright foundation and isolated e2e database (M1)`

**Testing notes:**

- **What was tested:** The allow-list guard (`assertE2eDatabaseUrl`): accepts a local `*_e2e` database and a bare `e2e`; rejects an unset/empty URL, an unparseable URL, the dev database name, a remote host with the right database name, a name that merely contains `e2e` (`e2e_prod`), and a non-postgres protocol. End to end: the Playwright server boots on port 3100 against a freshly built e2e database and serves the public landing page. Also verified by hand, not by a committed test: (1) a throwaway probe route showed the server process sees `DATABASE_URL` → `/brunchsters_e2e`, the e2e `AUTH_URL`, and the placeholder Google id, i.e. **`webServer.env` overrides `apps/web/.env.local`**; (2) with another process already listening on 3100, Playwright aborts with "http://localhost:3100 is already used" rather than attaching; (3) the e2e server and a normal `next dev` on port 3000 run side by side without interfering (the `.next` directory is shared, but nothing broke). The probe route and its spec were deleted before commit.
- **How:** Unit — `e2e/support/guard.test.ts`, 8 tests, run by `apps/web`'s existing vitest (web total is now 215 tests, 26 files; core 333). E2E — 1 Playwright test (`smoke.spec.ts`) against real Postgres (local Supabase, port 54322) via `pnpm test:e2e`, which recreates the database each run (~10s of migrate + seed). No mocks.
- **Diverged from the original task list and ADR wording, and why:**
  - **`E2E_DATABASE_URL`, not `DATABASE_URL`.** `DATABASE_URL` is what dev shells and `.env` files set, so reading it from the suite could silently aim it at the dev database. ADR 0007, spec.md and plan.md are updated to match.
  - **No runtime "server is on the e2e database" check.** The plan wanted a mechanism proving the running server uses the e2e DB. Every candidate needed production code (a marker route or header) or an authenticated page, which does not exist until M2. Since Playwright starts the server itself with explicit env and `reuseExistingServer: false` refuses any other server on the port, the server is on the e2e DB by construction; the probe above verified it once. **M2's first authenticated test additionally proves it end to end** (a fixture-created brunch appears on the server-rendered dashboard).
  - **Smoke spec asserts the heading**, not a sign-in CTA: `/` is still a stub. Spec 0002's "landing page with Sign in with Google CTA" is not what the page currently shows; noted, not fixed here.
  - **`tsx` added** to `apps/web` devDependencies for the reset script.
- **What's deferred:** CI wiring (M3) — locally verified only; in CI `next start` needs a prior `pnpm build` step and `E2E_DATABASE_URL` pointing at a database named `*_e2e` (M3 must create the Postgres service with that name). No authenticated or multi-actor behavior is exercised yet (M2). The `reset` runs on every `pnpm test:e2e`; for fast iteration use `pnpm --filter @brunchsters/web exec playwright test` against the existing database.
- **How to run it:** `pnpm test:e2e` from the repo root (needs local Supabase running — `npx supabase start` from `packages/database`); `pnpm e2e:db:reset` for the database alone; `pnpm --filter @brunchsters/web exec playwright test --headed` or `--ui` to watch; guard unit tests run with `pnpm test`.

---

## M2 — Auth cookie minting, fixtures, Places interception

- [x] `support/db.ts`: Prisma client for fixtures with the app's soft-delete extension (resolved: `createDb()` is already exported by `@brunchsters/database`; re-pointed at the e2e URL)
- [x] `support/session.ts`: `mintSessionCookie`; cookie name derived from `AUTH_URL` (http vs https)
- [x] `support/factories.ts`: `createUser` (via `signInWithProvider`), `createBrunch`, `inviteToBrunch` (wraps `sendInvites`), `respondToInvite`, `getInviteToken`; each wraps the real core service with explicit `ctx` (**renamed:** `inviteToBrunch`, to avoid shadowing the core export)
- [x] `support/fixtures.ts`: `test.extend` with a `makeActor` fixture (own browser context per actor, cookie preloaded, Places mocked) — per-test unique suffix lives in `factories.ts` as `uniqueSuffix()`
- [x] `support/places.ts`: `mockPlaces()` with three named fixture places in three IANA timezones, typed against the real `PlaceDetails`/`PlaceResult` (**diverged:** typed against the core types rather than copied from route tests, so drift is a compile error)
- [x] **A1** — protected route redirects to `/sign-in?callbackUrl=…`; `/` and `/sign-in` public; protected API route answers 401
- [x] **A2** — signed-in user lands on `/dashboard` with name/avatar; sign-out returns to `/` and protected routes redirect again
- [x] Prove isolation: two tests creating same-named brunches in parallel do not interfere (permanent test in `fixtures.spec.ts`; also run with `--workers=4 --repeat-each=3`)
- [x] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` pass
- [x] Commit: `test: add session minting, fixtures, and places interception (M2)`

**Testing notes:**

- **What was tested:** Journeys A1 (3 tests: protected page redirects to `/sign-in?callbackUrl=%2Fdashboard` with the sign-in button; protected API route returns 401 with no redirect; `/` and `/sign-in` stay public) and A2 (a minted session lands on `/dashboard` showing the user's name, avatar and empty state, "Sign out" returns to `/` and a later `/dashboard` visit redirects to sign-in again). Harness checks in `fixtures.spec.ts`: data isolation (two parallel tests each create a same-titled brunch and each user's dashboard shows exactly one — which also proves the server reads the e2e database the fixtures wrote to, closing the item M1 deferred); two actors keep separate sessions and see a brunch created, invited-to and RSVP'd through the real `createBrunch` / `sendInvites` / `respondToInvite` services (`2 going`, so the invite really activated the brunch); Places interception returns fixture search/details, mirrors the real routes' 400 (<3 chars) and 404, and logs the requests it saw; and a request that bypasses interception gets 502, proving the e2e server cannot reach Google.
- **How:** 10 Playwright tests total (1 smoke from M1 + 9 new) against real Postgres and a real Next server; nothing mocked except the browser-level Places routes. Also verified beyond the committed tests: `--workers=4 --repeat-each=3` = 30/30 passed; a **mutation check** — temporarily signing cookies with the wrong secret made exactly the 5 session-dependent tests fail while the 4 signed-out tests still passed, then restored — shows the tests discriminate rather than pass vacuously; and a `--trace on` run produced a `trace.zip` with a separate trace stream per actor context, so multi-actor failures will be debuggable (manually created contexts are traced under `trace: 'on-first-retry'`). Unit/other suites unchanged: core 333, web 215 (no new vitest tests this milestone).
- **A real gap found and closed while writing this:** `GOOGLE_PLACES_API_KEY` is set in the dev `.env.local`, and the plan said the e2e server "doesn't need" it. Not setting it would not remove it — Next would load the real key from `.env.local` and an un-intercepted Places request would silently call Google (and bill). `playwright.config.ts` now sets it to the **empty string** in `webServer.env`, which overrides `.env.local` and makes `requireGooglePlacesApiKey()` throw, so an un-mocked request fails loudly with 502. The test above pins that behavior. Plan.md's env table is updated.
- **Design choices the plan did not pin down:** `makeActor` applies `mockPlaces` to the whole browser context (not just the page) so popups and second pages are covered, and each `Actor` exposes the mock's request log (`places.searchQueries()`), which C2 (query under 3 characters fires no request) will use. Fixture users get an inline `data:` avatar, so the nav `<img>` renders with no network request. The `UserAuthProvider.providerUserId` is unique per user (`e2e-<suffix>`), which `signInWithProvider` keys on.
- **What's deferred:** `https` cookie name (`__Secure-` prefix) is implemented and derived from the base URL but only the `http://localhost` form is exercised (CI also serves over http, so it stays untested until a deployed environment is targeted). The real Google sign-in redirect remains out of scope (ADR 0007). No invite-link flow yet (A3 is M5). The server logs one expected "Place search failed … Missing GOOGLE_PLACES_API_KEY" error per run, from the deliberate 502 test; it is noise, not a failure.
- **How to run it:** `pnpm test:e2e` from the repo root (recreates the e2e database, ~10s, then runs the suite). For fast iteration against the existing database: `pnpm --filter @brunchsters/web exec playwright test` (add `--headed`, `--ui`, `-g "<name>"`, or `--workers=4 --repeat-each=3` for the isolation stress run). Reports land in `apps/web/playwright-report/`, traces in `apps/web/test-results/` (both gitignored).

---

## M3 — CI job and docs

- [ ] `ci.yml`: new `e2e` job (Postgres 17 service, install, generate, migrate deploy, seed, build, cached `playwright install chromium`, `pnpm test:e2e`, upload report and traces on failure)
- [ ] Confirm the job fails when a test fails (temporary failing commit or `act`-style dry run noted in testing notes)
- [ ] `docs/SETUP.md`: e2e database setup, `pnpm test:e2e`, `--headed` / `--ui` / trace viewer, where reports land, the "never attaches to your dev server" note, Windows port notes if any
- [ ] `docs/PLANNING.md`: §16 item 10 in progress; §17 E2E entry linked to ADR 0007
- [ ] `CLAUDE.md` Testing section: E2E location, fixtures-use-core-services rule, journeys-not-permutations rule
- [ ] Document in `docs/SETUP.md` (or the PR) that the E2E check must be added as a **required status check** with "require branches to be up to date" — this is a GitHub settings change the user makes; flag it, do not assume it is done
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass; CI e2e job green on the branch
- [ ] Commit: `ci: run Playwright e2e on every PR and document setup (M3)`

**Testing notes:** _(fill on completion)_

---

## M4 — Create brunch and access journeys (specs 0002, 0003)

- [ ] **C1** — wizard end to end (two places with multi-location hint, two times with hint and deadline field, invitee emails) → detail page → on dashboard
- [ ] **C3** — access rule: stranger 404, host and attendee can open
- [ ] **C2** — place search behavior (P1)
- [ ] **C4** — dashboard empty state and listing (P2, if room)
- [ ] Add accessible labels to any wizard controls that lack them rather than falling back to `data-testid`
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` pass
- [ ] Commit: `test: e2e journeys for brunch creation and access (M4)`

**Testing notes:** _(fill on completion)_

---

## M5 — Invitation journeys (spec 0004)

- [ ] **I1** — invite list with statuses and copyable links after creation
- [ ] **I2** — existing user opens link, RSVPs; host sees the status
- [ ] **A3** — signed-out invite link: preview with no PII, sign-in CTA `callbackUrl`, resumed with minted session → auto-accepted
- [ ] **I4** — expired and revoked tokens (fixtures expire/revoke through the service or a direct token update)
- [ ] **I5** — attendee suggests someone; host approves one and declines another; control hidden when disallowed
- [ ] **I6** — historic regressions: host self-invite in a batch; invite of an existing member
- [ ] **I3** — invite more later; `draft` → `active` (P1)
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` pass
- [ ] Commit: `test: e2e journeys for invitations (M5)`

**Testing notes:** _(fill on completion)_

---

## M6 — Voting journeys (spec 0005)

- [ ] **V1** — vote, revise, unchecking the last option explanation, no empty ballot submitted
- [ ] **V2** — `invited`/`no` attendee read-only with explanation
- [ ] **V3** — voter names visible to host, not to other attendees
- [ ] **V4** — attendee suggestion pending (visible only to suggester and host, mode unchanged) → host approves → on ballot → vote for it
- [ ] **V5** — single-option kind is display-only (post-M8 regression)
- [ ] **V6** — timezone subline when candidate locations span timezones, during voting and unchanged at confirmation
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` pass
- [ ] Commit: `test: e2e journeys for voting (M6)`

**Testing notes:** _(fill on completion)_

---

## M7 — Host manage and confirm journeys (spec 0005)

- [ ] **H4** — non-host 404 on `/manage`
- [ ] **H1** — add/remove options with counts; attendee's ballot reflects the change
- [ ] **H2** — 66% nudge with ≥3 eligible; deadline; close voting; attendee read-only afterward
- [ ] **H3** — confirm: leader preselected, tie preselects none, one action, read-only everywhere, RSVP stays live, suggestion controls gone, `/manage` shows summary
- [ ] **H6** — warning when nobody but the host accepted (P1)
- [ ] **H7** — deadline passing closes voting via Playwright clock (P1)
- [ ] **H5** — removing the selected option leaves confirm usable (P2, if room — post-M8 regression)
- [ ] Close the spec 0005 deferred items: update `specs/0005-voting-and-confirmation/tasks.md` M7/M8 testing notes to point at the journeys that now cover the previously unverified client-side interactions
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` pass
- [ ] Commit: `test: e2e journeys for host management and confirmation (M7)`

**Testing notes:** _(fill on completion)_

---

## M8 — Release gating and wrap-up

- [ ] Read how `semantic-release` checks out and which SHA it releases under `workflow_run`; choose between `workflow_run` and `needs:` per plan.md; the release must be of the tested SHA
- [ ] `release.yml`: releases only when CI (including the e2e job) succeeded for that commit; verify with a dry run (`semantic-release --dry-run` in a branch or a documented manual check)
- [ ] Decide merge-skew handling: "require up to date" documented, or CI also on `push: main`; record in ADR 0007 as accepted
- [ ] Coverage audit: walk the spec's journey inventory and mark each journey built / deferred (with reason) in this file
- [ ] Reserve the `@smoke` tag convention in the e2e README section of SETUP.md
- [ ] `docs/PLANNING.md` §16 item 10 complete; §17 entry resolved
- [ ] Mark `spec.md` status Complete and tick its acceptance criteria
- [ ] Update the memory note for the E2E feature (shipped; what future specs must do: every new feature spec adds its journeys)
- [ ] Add to CLAUDE.md "Process": new feature specs must list their E2E journeys
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` pass
- [ ] Commit: `ci: gate releases on CI and close out the e2e spec (M8)`

**Testing notes:** _(fill on completion)_
