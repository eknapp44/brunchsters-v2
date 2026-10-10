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

- [x] `ci.yml`: new `e2e` job (Postgres 17 service, install, generate, build, cached Playwright browser, `pnpm test:e2e`, upload report and traces on failure). **Diverged:** no separate `migrate deploy` / `db:seed` steps — `pnpm test:e2e` already creates the `brunchsters_e2e` database, migrates and seeds it, which is the same code path used locally
- [~] Confirm the job fails when a test fails — **verified at the Playwright level locally under `CI=true`** (deliberate failing test → exit 1, one retry, `playwright-report/` and `trace.zip` produced, i.e. exactly what the upload step collects); **not yet verified in GitHub Actions** (needs the branch pushed — see notes)
- [x] `docs/SETUP.md`: e2e section (database, `pnpm test:e2e`, `--headed` / `--ui` / trace viewer, where reports land, isolation from the dev server, CI), plus two troubleshooting rows and the test-types table row
- [x] `docs/PLANNING.md`: §16 item 10 in progress; §17 E2E entry marked decided and linked to ADR 0007; branch-protection bullet lists `e2e` as a required-check candidate
- [x] `CLAUDE.md` Testing section: E2E location, own-your-data / real-services rule, journeys-not-permutations rule, no-production-changes-for-testability rule
- [x] Document that the E2E check must be added as a **required status check** with "require branches to be up to date" — in `docs/SETUP.md` ("Required status checks"). **Not done by this milestone:** it is a GitHub settings change the repo owner makes; as of M3, `main` has no branch protection, so the job runs but does not yet block merges
- [x] `pnpm typecheck && pnpm lint && pnpm test` pass; CI e2e job green on the branch — **first run on PR #9: all 7 checks passed; `E2E Tests` took 1m56s on a cold cache**
- [x] Commit: `ci: run Playwright e2e on every PR and document setup (M3)`

**Testing notes:**

- **What was tested:** The CI-only execution path, which is where "works locally" is most likely to diverge: `CI=true pnpm build` (production `next build`) followed by `CI=true pnpm test:e2e`, which makes Playwright serve the build with `next start` instead of `next dev`, enables `forbidOnly`, the `github` reporter and one retry — 10 of 10 passed. The failure path: a temporary deliberately failing spec under `CI=true` exited 1, retried once, and left `playwright-report/` and `test-results/<test>-retry1/trace.zip`, the exact paths the upload step collects. The temporary spec was deleted before commit.
- **How:** Local simulation only (real Postgres, production build, no mocks beyond the suite's own). The workflow YAML itself has not been executed by GitHub Actions: this milestone changed `.github/workflows/ci.yml`, docs and `CLAUDE.md`; no application or test code. Unit suites unchanged (core 333, web 215).
- **What's deferred / unverified:** (1) **Update after the first run on PR #9:** the job ran green on a GitHub runner (cold cache, 1m56s), which proves the Postgres service host, the version/cache step, `install --with-deps` and the production-build path. Still unproven on a runner: the **cache-hit branch** (`install-deps` only; first seen on the next push) and the **artifact upload on failure** (no red run yet). Original note: the job had never run on a GitHub runner — Ubuntu-specific parts were unproven: the Postgres service container and `E2E_DATABASE_URL` host (`localhost`), the Playwright version/cache step (`playwright --version | awk`), the `install-deps` vs `install --with-deps` branching on cache hit, and artifact upload. **Next step: push the branch and open a PR, then confirm the `E2E Tests` job is green and, ideally, flip a test red once to see the artifact.** (2) Branch protection / required checks is a manual GitHub step (documented, not done). (3) Whether the first cold run fits comfortably in the 20-minute job timeout (expected a few minutes: install, build, ~150 MB browser download).
- **Two design choices worth knowing:** the e2e job sets `DATABASE_URL`/`DIRECT_URL` to the service's default `postgres` database purely so `prisma generate` and `next build` have a datasource — the e2e server and fixtures use `E2E_DATABASE_URL` (`brunchsters_e2e`, created by `pnpm test:e2e`), and the guard would refuse the plain `postgres` name. And browsers are cached but OS packages are not, so a cache hit still runs `playwright install-deps`.
- **How to run it:** locally, `pnpm test:e2e`; to mimic CI, `CI=true pnpm build && CI=true pnpm test:e2e`. Workflow: `.github/workflows/ci.yml`, job `e2e`.

---

## M4 — Create brunch and access journeys (specs 0002, 0003)

- [x] **C1** — wizard end to end (two places with multi-location hint, two times with hint and deadline field, invitee emails) → detail page → on dashboard
- [x] **C3** — access rule: stranger 404, host and attendee can open
- [x] **C2** — place search behavior (P1): 4 tests — title required, search debounce/3-char/billing session, hints and deadline field follow option count, back keeps entered data
- [x] **C4** — dashboard empty state and listing (P2): ordering/role/status/going-count, Past vs Upcoming (empty state is asserted in C1 and A2)
- [x] Add accessible labels to any wizard controls that lack them rather than falling back to `data-testid` — one found and fixed: the step-3 date/time input (`aria-label="Date and time"`). Everything else was already reachable by role/label (the place search and email inputs are named by their placeholder)
- [x] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` pass
- [x] Commit: `test: e2e journeys for brunch creation and access (M4)`

**Testing notes:**

- **What was tested:** Journeys C1–C4, 10 new tests. **C1:** a host takes the real wizard end to end — title and description, two intercepted place searches (no hint after one place, "Multiple locations will be put to a vote" after two), two times (multi-time hint, the "Voting closes by" field), a deadline, two invitee emails — and lands on the new brunch's detail page showing the title, `Active` status, both places and both times as ballot checkboxes (4 checkboxes), and both invitees; the rows are then read back from Postgres (2 locations, 2 times, description, deadline set, invites for both guests plus the host's own) so the browser→API→DB round trip is verified, not just the page; the brunch then appears on the dashboard. **C2:** title required (empty and whitespace-only keep Next disabled); place search fires nothing for under three characters, fires **once** for a word typed quickly (debounce), and the search and the details lookup share one session token while the next search gets a different one; hints and the deadline field appear and disappear as options are added and removed (one place + one time shows no deadline field); going Back through every step keeps the title, description, place, time and email. **C3:** host and an RSVP'd attendee get 200 and the title; an unrelated signed-in user gets a real 404 with no brunch title anywhere on the page; a malformed id and an unknown valid UUID are 404 rather than an error. **C4:** a host's dashboard lists newest first, with `(Host)`, status label and going count per row; a guest sees only their own brunch and no `(Host)`; a `completed` brunch is listed under Past with Upcoming showing its empty message.
- **How:** Playwright against real Postgres and a real server; nothing mocked except the browser-level Places routes. The debounce test uses Playwright's clock (`page.clock.install`/`pauseAt`/`runFor`) so "no request happened" is provable instead of a sleep — this is the technique H7 (deadline passing) will reuse. Verified stable with `--workers=4 --repeat-each=3` (57/57, 19 tests × 3). **Mutation checks on production code**, each reverted: removing the 3-character guard (`query.length < 1`) and weakening the multi-location hint (`> 2`) together made 3 tests fail (the search test, the hints test and C1), confirming they discriminate. Also run in CI mode (`CI=true`, production build served by `next start`): 19/19. Web unit 215, core 333 unchanged.
- **The one production change:** `aria-label="Date and time"` on the step-3 `datetime-local` input in `brunch/new/page.tsx`. It was the only wizard control with no accessible name; it is invisible and an accessibility improvement, consistent with ADR 0007 ("no production changes just to make code testable" — this one is a real a11y fix that tests happen to need).
- **A flake caught before it shipped:** one test used `getByRole('button', { name: 'Next' })`, which in **dev mode** also matches Next.js's "Open Next.js Dev Tools" button — strict-mode failures in 3 tests, and the one test that passed only did so because the dev-tools button had not mounted yet. All wizard buttons now use `exact: true`. CI (production build) would not have shown this, so the local dev-mode run found something CI never would.
- **Environment pinned:** `playwright.config.ts` now sets `locale: 'en-US'` and `timezoneId: 'America/Chicago'`, so rendered dates do not depend on the machine running the suite; Chicago is deliberately different from two of the three fixture places for the V6 timezone journey.
- **Findings about the product, not fixed here (out of scope for a test milestone):** (1) **[Fixed after M5 in a separate commit — see "Fixes made after M5" below.]** `getBrunchVoting` had **no `orderBy`**, so the order of locations and times was whatever Postgres returned. In C1 the wizard added Sunny Side first but Harbor Bistro rendered first, and the time labels' "(at <place>…)" subline uses the first option as the representative location — so which place's timezone is shown can change between loads. V6 (timezone subline) should pin this down; it likely wants a stable ordering and a decision on the representative location. (2) Nothing else surprising: the access rule and dashboard behave exactly as spec 0003 describes.
- **What's deferred:** A3, I1–I6 (M5); V*, H* (M6–M7). C4's "Past" case sets the status with one direct Prisma update, the only place a fixture skips the services: the app has no way to complete a brunch yet. The mock Places layer means the real Google adapter is still exercised only by its unit tests. Browser coverage is Chromium only.
- **How to run it:** `pnpm test:e2e` (full), or `pnpm --filter @brunchsters/web exec playwright test create-brunch access-and-dashboard` for just this milestone; add `--headed` to watch the wizard.

---

## M5 — Invitation journeys (spec 0004)

- [x] **I1** — invite list with statuses and copyable links (an answered invitee with an account and a silent address with none; the copy button's clipboard contents are compared to the real link)
- [x] **I2** — existing user opens link, RSVPs; host sees the status
- [x] **A3** — signed-out invite link: preview with no PII, sign-in CTA `callbackUrl`, resumed with minted session → auto-accepted
- [x] **I4** — revoked (via the real Revoke button), expired (direct token update — no service expires an invite early), resend retires the old link, made-up token
- [x] **I5** — attendee suggests someone; host approves one and declines another; control hidden when disallowed; auto-approve variant
- [x] **I6** — historic regressions: host self-invite in a batch (a); host and attendee opening an invite link when they already belong (b). "Invite of an existing member" via the panel is covered by I6b's second case; see the case-sensitivity finding below for what is _not_ covered
- [x] **I3** — invite more later; `draft` → `active` (P1)
- [x] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` pass
- [x] Commit: `test: e2e journeys for invitations (M5)`

**Testing notes:**

- **What was tested:** 13 new tests in three files. **I1:** the host's list shows `yes` for an invitee who answered and `pending` for an address with no account; "Copy link" turns into "Copied!" and the clipboard holds exactly `<base>/invite/<token>`. **I3:** a draft brunch says "No invites sent yet."; the first invite sent from "Invite more people" makes it `Active`, clears the box, and a second joins the list. **I4:** revoking through the UI removes the row and the old link shows "Invite not found" with neither the brunch title nor the host's name; an expired link is dead until the host clicks Resend, after which the old link is still dead and the new one shows the preview; a made-up token gets the same page. **I6a:** through the real wizard, a batch of the host's own address (in two cases) plus a guest results in the guest invited and shown `pending`, the brunch `Active`, the host not listed as an invitee, and exactly two invite rows in Postgres (guest + the host's built-in one). **I2:** an existing user opens their link and lands on the brunch already `yes`, switches to `maybe` then `no` with the RSVP control, and the host's list follows each change. **A3:** a signed-out visitor sees "You're invited to …", "Hosted by <host>" and the status, and _nothing else_ (no other invitee's email, no host email, not even their own); the sign-in link carries `callbackUrl=/invite/<token>` into `/sign-in`'s hidden field; resuming with a minted session for that address lands them on the brunch, `yes`, and the host sees them accepted while the other invitee is still `pending`. **I6b:** the host opening one of their own guests' links, and an attendee opening someone else's link, both land on the brunch with their answer untouched, the other invite still `pending`, and one attendee row. **I5:** an attendee's suggestion is invisible to them afterwards but listed for the host as "suggested by <name>"; approving turns one into a real invite, declining the other creates none (also checked in Postgres); with `allowInviteSuggestions` off the attendee gets no control; with `requireHostApprovalToInvite` off a suggestion becomes an invite immediately; the host never sees the suggestion control.
- **How:** Playwright against real Postgres and a real server, nothing mocked. Invites go through the real services (`sendInvites`, `respondToInvite`); the wizard is used where the wizard is the thing under test. Stress run `--workers=4 --repeat-each=3`: 96/96. CI mode (`CI=true`, production build): 32/32. **Both historic bugs were reintroduced temporarily to confirm the tests catch them:** making `sendInvites` reject a batch containing the host's address failed I6a; disabling the `existingMembership` guard in `respondToInvite` failed both I6b tests; every other test kept passing, and `packages/` was restored (clean `git status`). Unit suites unchanged: core 333, web 215.
- **Direct database writes (the only fixture shortcuts this milestone):** expiring an invite's token (nothing but time expires one) and flipping `allowInviteSuggestions` / `requireHostApprovalToInvite` (no screen exposes those settings yet). Both are noted in the helpers.
- **Findings about the product, not fixed here:**
  1. **Case-sensitive duplicates across requests.** **[Not fixed — logged in PLANNING §17 as needing its own ADR and spec.]** Inviting `Case-X@Example.com` and later `case-x@example.com` creates **two** invite rows (two links, two lines in the host's list) for the same person: de-duplication is case-insensitive within one batch and against the host's own address, but the unique key is the exact string (no `citext`). Probed with a throwaway test (not committed); no test asserts either behavior. A fix would normalize the address at the boundary.
  2. **Two buttons both named "Suggest"** on an attendee's brunch page (the invite panel and the time control) — indistinguishable to a screen reader, and the reason the test scoped by section heading. **[Fixed after M5 — see below.]** (Written as "three" at the time of M5; there were two.)
  3. **Spec/implementation drift:** **[Fixed after M5: spec 0004 now describes the implemented behavior.]** spec 0004 says an invalid link should read "Ask **[host name]** to resend it"; the page says "Ask **the host**" (deliberately generic, and it reveals nothing — the test asserts the actual text). And spec 0004 says a first visit surfaces an RSVP _prompt_; the landing page instead **auto-accepts as `yes`** and the RSVP control is where people change it. The tests follow the implementation; the spec text is worth correcting.
- **What's deferred:** The invite email itself (nothing sends mail yet — links are copied by hand, which is what I1 tests). The real Google sign-in step in A3 (ADR 0007). Resending to someone who already answered, and revoking an invite someone already accepted, are not exercised end to end. Chromium only.
- **How to run it:** `pnpm test:e2e`, or `pnpm --filter @brunchsters/web exec playwright test invitations invite-suggestions` for this milestone; add `--headed` to watch.
- **Fixes made after M5 (separate `fix:` commits on this branch, each with its own test), prompted by the findings above:** (a) `getBrunchVoting` now orders locations by creation time then name, times chronologically, pending suggestions by creation time, and the host's voter names alphabetically (all with an `id` tiebreak) — covered by a real-Postgres test in `voting.integration.test.ts` that inserts options and votes in the _wrong_ order and was confirmed to fail without the fix, plus the updated query-shape unit test; (b) the invite panel's button is now "Suggest this person" and the time-suggestion control's is "Suggest this time" (and its date input is labelled "Suggested date and time" — the same missing-name gap fixed in the wizard in M4), so I5 clicks by unique name with no section scoping; (c) spec 0004's text for the invalid-link message and the first-visit RSVP behavior now matches the implementation. The case-sensitivity finding was logged, not fixed.

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
