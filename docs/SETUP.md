# SETUP.md — Local Environment & Testing Guide

**Status:** v1 — verified against the scaffolded monorepo (specs/0001-repo-scaffold).

This guide gets a developer (today, that's you; later, future-you) from a fresh machine to a running local Brunchsters with tests passing. It is **local-first**: the default loop runs entirely on your machine, with cloud services only where they can't be replicated locally.

---

## 1. Philosophy

- **Dev-first.** Production is documented but not active yet. Everything here targets local development.
- **Local-centric testing.** Unit and integration tests run against a local Postgres — no cloud dependency, no network flakiness, fast feedback. External APIs (email, maps) are mocked locally.
- **Minimal required accounts to start.** You can build and test most of v1 with only a local stack plus a couple of free accounts. Paid/harder integrations (Apple Sign-In, live Maps) are deferred until you actually need them.

---

## 2. Required Local Tools

Install these before anything else.

| Tool               | Version                              | Why                                                   | Install                                                      |
| ------------------ | ------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------ |
| **Node.js**        | 20 LTS or newer (22 LTS recommended) | Runtime for Next.js + tooling                         | [nodejs.org](https://nodejs.org) or `nvm install 22`         |
| **pnpm**           | 11+                                  | Monorepo package manager (workspaces)                 | `npm install -g pnpm` or `corepack enable pnpm`              |
| **Git**            | latest                               | Source control                                        | [git-scm.com](https://git-scm.com)                           |
| **Docker Desktop** | latest                               | Runs local Postgres + the local Supabase stack        | [docker.com](https://www.docker.com/products/docker-desktop) |
| **Supabase CLI**   | latest                               | Spins up Postgres + Realtime + Auth locally in Docker | `npm install -g supabase`                                    |
| **A code editor**  | —                                    | VS Code recommended (good TS + Prisma extensions)     | [code.visualstudio.com](https://code.visualstudio.com)       |

**Recommended editor extensions:** Prisma, ESLint, Prettier, Vitest.

**Windows note:** Docker Desktop uses the WSL 2 backend on Windows 11. Ensure Docker Desktop is fully started (whale icon steady in system tray) before running `supabase start`.

**Why Docker if we're not containerizing the app?** We decided against containerizing the _application_ (Vercel handles deploys). Docker here is only for **local infrastructure** — Postgres and the Supabase stack — so local dev mirrors production behavior (especially Supabase Realtime) without touching the cloud.

---

## 3. Third-Party Accounts

You don't need all of these on day one. The "When" column tells you when each becomes necessary.

| Service                   | Purpose                                                                                                      | Free tier?                                                                     | When you need it                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| **GitHub**                | Source control + CI/CD (Actions)                                                                             | Yes                                                                            | Now — already done                                                                                                                   |
| **Supabase**              | Postgres + Realtime (prod/shared)                                                                            | Yes, generous                                                                  | When you want a shared/cloud DB. **Local dev needs none of this** — the CLI runs it locally. Create a cloud project when you deploy. |
| **Vercel**                | App hosting + preview deploys                                                                                | Yes (hobby)                                                                    | When you first deploy. Not needed for local dev.                                                                                     |
| **Resend**                | Transactional email                                                                                          | Yes (limited sends)                                                            | When building/testing email flows for real. Locally no account is needed: emails go to a local outbox folder.                        |
| **Google Cloud Platform** | **Places API (New)** + **Time Zone API** + **Google OAuth** credentials                                      | Places/Time Zone need billing enabled (has free monthly credit); OAuth is free | OAuth: when wiring Google sign-in. Places/Time Zone: when wiring the location picker. Until then, mock both.                         |
| **Apple Developer**       | Sign in with Apple                                                                                           | **No — $99/year**                                                              | Deferred. Build with Google sign-in first; add Apple closer to launch.                                                               |
| **Inngest**               | Async job queue (sends the invite and confirmation emails; later running-late, undo-cancel, vote auto-close) | Yes                                                                            | When building queued side effects. Has a **local dev server** — no cloud account needed for local work.                              |

### Recommended account order

1. **Now:** GitHub (done).
2. **Nothing else** until the scaffold runs locally — local Supabase + mocks cover early work.
3. **Google OAuth** when you reach the auth spec.
4. **Resend** when you reach the email/notifications spec.
5. **Google Places (New) + Time Zone API** when you reach the location-picker spec.
6. **Vercel + cloud Supabase** when you're ready for the first deploy.
7. **Apple Developer** last, near launch.

### Troubleshooting: Google Places API key setup

Two separate gates have to both be satisfied, and mixing them up produces different errors:

1. **Enable the API on the project** (Cloud Console → APIs & Services → Library). Enabling the
   legacy "Places API" does **not** enable "Places API (New)" — they're separate toggles. Using
   the new one without enabling it fails with `SERVICE_DISABLED`.
2. **Restrict the key to the right API** (Cloud Console → Credentials → the key → API
   restrictions). The dropdown lists "Places API" and "Places API (New)" as separate entries with
   different underlying service identifiers (`places-backend.googleapis.com` vs.
   `places.googleapis.com`). Restricting to the legacy entry while calling the new API's endpoint
   fails with `API_KEY_SERVICE_BLOCKED`, even though the API itself is enabled and the key is
   otherwise valid.

If you have the `gcloud` CLI installed, you can inspect and fix a key's restrictions directly
instead of clicking through the console:

```bash
gcloud services api-keys list --project=<your-project-id>
gcloud services api-keys update projects/<project-number>/locations/global/keys/<key-id> \
  --api-target=service=places.googleapis.com \
  --api-target=service=timezone-backend.googleapis.com
```

---

## 4. First-Time Setup

```bash
# 1. Clone
git clone git@github.com:<you>/brunchsters.git
cd brunchsters

# 2. Install all workspace dependencies
pnpm install

# 3. Copy the environment template — Next.js reads from apps/web/.env.local
cp .env.example apps/web/.env.local

# 4. Start local infrastructure (Postgres + Realtime + Auth) in Docker
supabase start
#    -> prints local URLs + keys; fill DATABASE_URL + DIRECT_URL in apps/web/.env.local
#    -> and in packages/database/.env (Prisma CLI reads from there for migrations).
#    -> Copy API_URL, ANON_KEY, SERVICE_ROLE_KEY into apps/web/.env.local too.
#    -> Local ports: DB on :54322, API on :54321, Studio on :54323

# 5. Apply the database schema
pnpm db:migrate
#    -> runs: prisma migrate dev (applies all pending migrations)

# 6. Generate the Prisma client
pnpm db:generate
#    -> runs: prisma generate

# 7. Seed lookup tables (statuses, RSVP states, decision types, etc.)
pnpm db:seed

# 8. (Optional) Start the Inngest local dev server in a second terminal
npx inngest-cli@1.46.0 dev --no-discovery -u http://localhost:3000/api/inngest
#    -> needed to actually deliver emails locally (see 'Email and the job queue' below);
#       set INNGEST_DEV=1 in apps/web/.env.local. Dev UI: http://localhost:8288

# 9. Run the app
pnpm dev
#    -> http://localhost:3000
```

When everything's up you should have: the Next.js app on `:3000`, local Supabase (Postgres + Realtime) on its CLI-reported ports, and optionally the Inngest dev server.

---

## 5. Environment Variables

Maintain a committed `.env.example` at the repo root (no secrets) as the canonical list. Real values live in two git-ignored files:

- **`apps/web/.env.local`** — all variables consumed by Next.js (runtime + auth + third-party APIs). This is the primary file to fill in.
- **`packages/database/.env`** — only `DATABASE_URL` and `DIRECT_URL`, read by Prisma CLI for migrations (`pnpm db:migrate`, `pnpm db:generate`). Keep in sync with `apps/web/.env.local`.

Update `.env.example` whenever a new var is introduced.

| Variable                                    | Purpose                                                        | Where to get it (local)                                                                        |
| ------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                              | Pooled Postgres connection (app runtime)                       | `DB_URL` from `supabase start` output                                                          |
| `DIRECT_URL`                                | Direct Postgres connection (Prisma migrations)                 | same as `DATABASE_URL` for local dev                                                           |
| `NEXT_PUBLIC_SUPABASE_URL`                  | Supabase URL for the Realtime client                           | `API_URL` from `supabase start` output                                                         |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`             | Public anon key for client-side Realtime                       | `ANON_KEY` from `supabase start` output                                                        |
| `SUPABASE_SERVICE_ROLE_KEY`                 | Server-side privileged key                                     | `SERVICE_ROLE_KEY` from `supabase start` output                                                |
| `AUTH_SECRET`                               | NextAuth/Auth.js session encryption                            | `openssl rand -base64 32`                                                                      |
| `AUTH_URL`                                  | Base URL for auth callbacks                                    | `http://localhost:3000` locally                                                                |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth                                                   | Google Cloud Console → Credentials (when you reach auth)                                       |
| `APPLE_CLIENT_ID` / `APPLE_CLIENT_SECRET`   | Apple Sign-In                                                  | Deferred — leave unset until Apple work begins                                                 |
| `RESEND_API_KEY`                            | Email sending through Resend                                   | Resend dashboard. Leave **blank** locally: emails then go to the local outbox instead          |
| `EMAIL_FROM`                                | Sending address, e.g. `Brunchsters <invites@mail.example.com>` | Your verified Resend domain (see below). Unset = Resend's sandbox sender                       |
| `EMAIL_OUTBOX_DIR`                          | Where the local outbox writes emails                           | Optional; defaults to `.mail-outbox/` (git-ignored)                                            |
| `GOOGLE_PLACES_API_KEY`                     | Location search + timezone lookup                              | Google Cloud Console (mock locally until then) — server-only, never exposed to the client      |
| `INNGEST_DEV`                               | Use the local Inngest dev server                               | `1` locally. **Must be unset in production**: the server refuses to start with it set          |
| `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` | Inngest Cloud auth (production)                                | Inngest dashboard. **Leave blank locally**; a set event key sends events to Inngest Cloud      |
| `TOKEN_ENCRYPTION_KEY`                      | AES-256-GCM key for OAuth token encryption                     | `openssl rand -base64 32` — 32 bytes. **Never commit. Rotating it invalidates stored tokens.** |

**Rule:** every var above must exist in `.env.example` with a placeholder/empty value and a one-line comment. The app should fail fast on startup with a clear message if a required var is missing (the production check is in `apps/web/src/lib/serverConfig.ts`).

### Email and the job queue

Emails are sent by queued handlers (ADR 0009, spec 0008). Which implementation runs is decided by configuration alone:

| Where                          | Queue                              | Email                                         |
| ------------------------------ | ---------------------------------- | --------------------------------------------- |
| Local dev, nothing set         | none: events are dropped, no email | would go to the outbox, but nothing queues it |
| Local dev with `INNGEST_DEV=1` | Inngest dev server                 | JSON files in `.mail-outbox/`                 |
| Unit / integration tests       | none                               | `MockEmailService`                            |
| E2E                            | Inngest dev server on port 8298    | files in `$TMPDIR/brunchsters-e2e-mail`       |
| Production deployment          | Inngest Cloud                      | Resend                                        |

**See an invite email locally**

1. In `apps/web/.env.local` set `INNGEST_DEV=1`, and leave `RESEND_API_KEY`, `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` **blank**.
   A real Resend key would send real mail (to your own address only, until a domain is verified); a real event key would send events to Inngest Cloud, which cannot reach your laptop.
2. Run `pnpm dev`, and in a second terminal `npx inngest-cli@1.46.0 dev --no-discovery -u http://localhost:3000/api/inngest`.
3. Invite someone from the app. The newest file in `.mail-outbox/` is the email: open it and copy the `href` out of the `html` field (or read the `subject` and `to`). Runs and retries show in the Inngest dev UI at <http://localhost:8288>.

**Production deployment.** A Vercel production deployment (`VERCEL_ENV=production`) refuses to start unless `AUTH_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` are set, and the error names whichever is missing. It also refuses to start if `INNGEST_DEV` is set there, because dev mode turns off signature checks on the public `/api/inngest` route. `EMAIL_FROM` is required there because without it Resend's sandbox sender would be used, which can only write to your own account address, so every real recipient would be rejected. Point Inngest Cloud at `https://<your-domain>/api/inngest` (the Vercel integration does this for you). `NODE_ENV=production` alone is deliberately not enough to trigger the check: CI and the e2e suite serve a production build that is not a deployment.

#### Verifying a sending domain in Resend

Until you do this, Resend only delivers to the email address of your own Resend account, so an invite to anyone else fails. Nothing in the code changes when you do it, only `EMAIL_FROM`.

1. **Buy a domain** (about $10-12 a year) from a registrar such as Cloudflare Registrar, Porkbun or Namecheap. It can double as the custom domain for the Vercel deployment later.
2. In Resend open **Domains → Add Domain**. Use a **subdomain** such as `mail.yourdomain.com` (this project uses `mail.brunchsters.com`): it keeps the sending reputation separate from anything else on the domain, and leaves the root free for ordinary mailboxes or Cloudflare Email Routing.
3. Resend then offers to add the DNS records for you. With Cloudflare, choose **Auto configure** and approve the one-time authorization it opens (check that the address bar says `dash.cloudflare.com` and that it lists only records on your `mail.` subdomain; it does not grant ongoing access). Otherwise copy the records **exactly as the dashboard shows them** into your DNS provider's panel. Resend's current setup creates three records on the subdomain: two **CNAMEs** (`send.mail` and `rsend.mail`, pointing at Resend's `forge.rmta.net` servers, which handle SPF and bounces) and one **TXT** (`resend._domainkey.mail`, the DKIM signing key), all DNS-only (grey cloud in Cloudflare).
   Then add one record yourself, on the **root** domain: a TXT named `_dmarc` with the value `v=DMARC1; p=none;`. It tells receivers what to do with failed mail and covers the subdomain too.
4. Back in Resend click **Verify**. It usually takes minutes; occasionally a few hours while DNS propagates.
5. Create an API key with **sending access only** (Resend → API Keys) and set it in Vercel as `RESEND_API_KEY`.
6. Set `EMAIL_FROM` in Vercel to an address on the verified subdomain, for example `Brunchsters <invites@mail.brunchsters.com>`, then redeploy.
7. Send yourself an invite from the deployed app and check that it arrives in the inbox, not spam. The message's "show original" view should report SPF, DKIM and DMARC as passing.

---

## 6. Daily Development Loop

```bash
supabase start            # if not already running
pnpm dev                  # app on :3000
npx inngest-cli@1.46.0 dev --no-discovery -u http://localhost:3000/api/inngest   # second terminal; only if you want emails delivered locally

# ... make changes on a feature branch ...

pnpm typecheck            # must pass
pnpm lint                 # must pass
pnpm test                 # must pass
git commit -m "feat(...): ..."   # commit at each green milestone

supabase stop             # when done for the day (frees Docker resources)
```

---

## 7. 30-Second Smoke Test

The shortest sequence that proves your local stack is healthy:

```bash
# 1. Supabase up?
supabase status           # should print DB_URL and other keys (not "not running")

# 2. Dependencies installed?
pnpm install              # should print "Already up to date"

# 3. Schema valid?
pnpm db:validate          # should print "The schema at prisma\schema.prisma is valid 🚀"

# 4. Tests passing?
pnpm test                 # should print "4 passed" across shared, core, database, web

# 5. App boots?
pnpm dev                  # visit http://localhost:3000 — should show "Brunchsters / Coming soon."
```

If all five pass, the stack is healthy.

---

## 8. Local Testing

The whole point: **fast, deterministic tests that run offline.**

### Test types

| Type            | What it covers                                   | Runner     | DB                                             | External APIs                                                                          |
| --------------- | ------------------------------------------------ | ---------- | ---------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Unit**        | `packages/core` services, pure logic, validation | Vitest     | none                                           | mocked (`MockEmailService`, mock providers)                                            |
| **Integration** | DB interactions, Prisma queries, transactions    | Vitest     | **local Postgres**                             | mocked                                                                                 |
| **E2E**         | Critical user flows end-to-end                   | Playwright | **`brunchsters_e2e`** (own DB, local Postgres) | Places intercepted in the browser; Google sign-in bypassed with minted session cookies |

### Running tests

```bash
pnpm test                                          # unit tests across all packages (no DB needed)
pnpm test:watch                                    # watch mode during a milestone (add script when needed)
pnpm --filter @brunchsters/core test:integration   # integration tests — needs local Postgres (supabase start)
pnpm test:e2e                                      # Playwright — recreates the brunchsters_e2e database, then runs the suite (needs supabase start)
pnpm e2e:db:reset                                  # recreate + migrate + seed the e2e database only
```

### Local test database

Integration tests run against your **local Supabase Postgres** — the same instance `supabase start` gives you, not a separate database. `packages/core/test/setup-db-env.ts` reads `DATABASE_URL`/`DIRECT_URL` from `packages/database/.env` automatically, so you don't need to export them by hand locally. Each integration test file generates run-unique fixture data (a `RUN_ID = Date.now()` suffix on emails/titles) and deletes it in `afterAll`, so repeated local runs don't collide or accumulate cruft.

In CI, integration tests run against a throwaway `postgres:17` service container instead (the `test-integration` job in `.github/workflows/ci.yml`) — migrated and seeded fresh on every run, then discarded. No cleanup needed there since the whole container goes away.

Conventions:

- Each integration test file creates its own uniquely-named fixture data and cleans it up in `afterAll` — see any `*.integration.test.ts` for the pattern.
- External boundaries (Resend, Google Places) are **always** mocked in tests via the interface + mock-implementation pattern from `CLAUDE.md`. Tests never hit a real third-party API.
- Email addresses in test data go through `normalizeEmail` (from `@brunchsters/shared`). The database has `CHECK` constraints that refuse a mixed-case or padded address on `User`, `UserAuthProvider`, `BrunchInvite` and `BrunchInviteSuggestion` (ADR 0008), so a fixture that inserts `Mixed@Example.com` directly fails with `violates check constraint "…_normalized"` — which is the point. After pulling a branch with a new migration, apply it with `pnpm --filter @brunchsters/database exec prisma migrate deploy` (the e2e database is rebuilt by `pnpm test:e2e`).
- Tests are co-located: `createBrunch.test.ts` next to `createBrunch.ts`.

### End-to-end tests (Playwright)

Browser-driven journeys live in `apps/web/e2e/` (decisions: [ADR 0007](adrs/0007-e2e-testing-stack.md); inventory: `specs/0006-e2e-testing-infra/spec.md`).

**One-time setup:** local Supabase running (`supabase start`), then install the browser:

```bash
pnpm --filter @brunchsters/web exec playwright install chromium
```

**Running:**

```bash
pnpm test:e2e                                                      # recreate the e2e database, then run the whole suite
pnpm e2e:db:reset                                                  # recreate + migrate + seed the e2e database only
pnpm --filter @brunchsters/web exec playwright test                # iterate against the existing database (skips the ~10s reset)
pnpm --filter @brunchsters/web exec playwright test -g "A2"        # one test by name
pnpm --filter @brunchsters/web exec playwright test --headed       # watch the browser
pnpm --filter @brunchsters/web exec playwright test --ui           # interactive runner with time-travel
pnpm --filter @brunchsters/web exec playwright show-report         # HTML report from the last run
pnpm --filter @brunchsters/web exec playwright show-trace <trace.zip>   # open a failure trace (in apps/web/test-results/)
```

**How it is isolated from your dev environment:**

- It uses its own database, `brunchsters_e2e`, on the same local Postgres as `supabase start`. `pnpm test:e2e` drops and recreates it every run, so it never touches your dev data. Override the connection with `E2E_DATABASE_URL`; the suite reads that variable and deliberately ignores `DATABASE_URL`.
- A guard refuses to run unless the database host is local and its name is `e2e` or ends in `_e2e`.
- Playwright starts its own Next server on **port 3100** (`next dev` locally, `next build` + `next start` in CI) with the e2e database set explicitly. It never attaches to a server it did not start. **Stop your own `pnpm dev` (and `inngest-cli dev`) before running the suite in dev mode:** with both running, dev-mode runs failed unrelated tests (404s where a 409 was expected, missing elements, timeouts) and passed 75/75 as soon as they were stopped. Two `next dev` processes in the same `apps/web` folder likely share one `.next` build directory, and the queue's dev server polls your app constantly; which of the two matters was not separated. CI mode (`CI=true pnpm build && CI=true pnpm test:e2e`) does not have this problem.
- Sign-in is not driven through Google: tests mint a session cookie for fixture users (see `e2e/support/session.ts`). The real Google flow stays a manual check.
- Google Places requests are answered inside the browser from fixtures, and the e2e server's Places key is empty, so nothing can reach Google.
- **Email and the queue are real, up to the last hop.** Playwright also starts the Inngest dev server (the pinned `inngest-cli`, fetched with `npx` the first time, on ports 8298/8299/50152/50153 so your own `inngest-cli dev` on 8288 can keep running). The app's emails go through the real queue and handlers and land as files in `$TMPDIR/brunchsters-e2e-mail` instead of being sent; `e2e/support/mailbox.ts` (`waitForEmails`, `linkIn`) reads them. The Resend and Inngest Cloud keys in your `.env.local` are blanked for this server. Setup done with the e2e factories uses a no-op event bus, so only actions made through the UI queue emails.
- **Dev mode is slower than CI.** `next dev` serves the app and the queue's callbacks from one process, so outside CI assertions wait up to 15 s (`expect.timeout`); CI serves a production build and keeps Playwright's strict 5 s, and is the gate. If you see `net::ERR_NETWORK_IO_SUSPENDED`, the computer slept during the run; run it again.

**In CI** the `e2e` job (`.github/workflows/ci.yml`) runs on every pull request to `main` against a `postgres:17` service container, and uploads the HTML report and traces as the `playwright-report` artifact when it fails.

**Protecting `main` (GitHub settings, applied by the repo owner; code cannot enable them).** `main` is governed by **rulesets** (Settings → Rules → Rulesets), not classic branch protection: the classic `branches/main/protection` API returns 404 even though the rules exist, so read them with `gh api repos/eknapp44/brunchsters-v2/rules/branches/main`. As of 2026-10-18: `main-1` blocks deleting `main` and force-pushing; `main-2` requires a pull request (**0** required approvals, because a solo author cannot approve their own PR) and requires the seven checks, `Lint`, `Typecheck`, `Test`, `Integration Tests`, `E2E Tests`, `Prisma Validate` and `Build` (the `name:` values in `ci.yml`), to pass with the branch up to date. The repository Admin role can bypass `main-2`. Do not add `Release` as a required check: it runs only after a merge. A check only appears in the required-checks picker once it has run at least once on a pull request.

**Optional hardening:** narrow the Admin bypass from "Always" to "For pull requests only" so the checks bind the owner too (the merge screen still allows a deliberate override).

**The release job needs no allowance on `main`:** it creates a version tag and a GitHub Release and never commits to `main` (ADR 0004), which is why releases v1.5.0, v1.6.0 and v1.7.0 were cut without any bypass for GitHub Actions.

**Releases are gated on CI.** The `Release` job in `.github/workflows/ci.yml` (semantic-release) `needs` every other job and runs only on a push to `main`, so a release is only ever cut from a commit where lint, typecheck, unit, integration, E2E, Prisma validation and the build all passed. CI therefore also runs on every push to `main` (re-checking the merge result). Pull requests skip the `Release` job, so **do not add `Release` as a required status check** — it would never report on a PR and would block every merge. The job commits nothing to `main`: a release is a **version tag plus a GitHub Release with generated notes** (the Releases page is the changelog; `CHANGELOG.md` is frozen at 1.4.0 — ADR 0004 amendment). That is what lets it run under the pull-request-only rulesets. Preview what a release would contain without publishing anything: `GITHUB_TOKEN="$(gh auth token)" pnpm exec semantic-release --dry-run --no-ci --branches <your-branch>`.

**`@smoke` (reserved).** Once deployed environments (INT/QA) exist, a small subset of tests tagged `@smoke` in their titles will be run against the deployed URL after each deploy (`--grep @smoke`, with `BASE_URL` set); the full suite stays on the ephemeral e2e database. Nothing is tagged yet — don't point the suite at a real environment by loosening the database guard; smoke runs need their own non-mutating approach, decided when those environments exist (ADR 0007).

**Adding E2E coverage for a new feature.** Every new feature spec has an `## E2E Journeys` section, and any change to what a user sees or does needs a new or updated journey in the same PR (the bar is defined in `CLAUDE.md` — "User-facing changes keep the E2E suite honest"; the pull request template asks for it). Follow the existing pattern: create state through `e2e/support/factories.ts` / `voting.ts` (real core services), drive only the step under test through the UI, use `makeActor` for each person, and prove a new test can fail (temporarily break the behavior it guards) before trusting it.

### Review screenshots and looking at the UI (spec 0009)

The look is judged by eye, so there is a command that photographs every screen:

```bash
pnpm --filter @brunchsters/web screenshots   # recreates the e2e database, then writes apps/web/.screenshots/
```

It uses the same isolated e2e server, database and queue as `pnpm test:e2e` (stop your own `pnpm dev` first), logs in as fixture users, and saves one PNG per screen: `<screen>-<light|dark>-<desktop|tablet|phone>.png` (desktop is 1280px wide, the tablet 820px, below the width where two columns start, and the phone an emulated Pixel 7). The folder is git-ignored and nothing compares against it; it exists so you and Claude can look at the same pictures. Re-run it after a change; it overwrites the files.

**Boards: the prototype next to the app (spec 0011).** Each design-fidelity milestone is reviewed with a board per screen, light and dark, desktop and phone:

```bash
pnpm --filter @brunchsters/web screenshots   # the app side (above)
pnpm --filter @brunchsters/web boards        # photographs the prototype and writes apps/web/.screenshots/board-<screen>-<light|dark>-<desktop|phone>.png
```

`boards` needs the network (the prototype loads React and Babel from unpkg) and the screenshots from the first command; it says so if they are missing. It serves a **scratch copy** of `prototype/` (with the Design v3 canvas files placed next to its HTML, and `ios-frame.jsx` for the prototype's phone scenes; a plain stand-in box is used if that file is missing) and removes it, and its server, when it ends: `prototype/` and `design-docs/` are never written. A board shows "Nothing to show at this size" where the prototype has no scene for that size (it draws most screens at desktop width only). The approved target for spec 0011 is also reproducible as static pages with `node specs/0011-design-fidelity/mockups/build.mjs` (needs the network for the fonts).

For poking around yourself, `pnpm dev` plus your browser's device mode (Chrome: DevTools, then the phone icon) shows the phone layout, and DevTools → Rendering → "Emulate CSS media feature prefers-color-scheme" shows dark mode. A **real phone** is a harder case, because signed-in screens need Google sign-in, and Google rejects a redirect URI that is a bare IP address (so `http://192.168.x.x:3000` cannot sign in). Until the app is deployed (PLANNING §17 pre-launch checklist), a real phone can see the signed-out pages over your network (`pnpm --filter @brunchsters/web exec next dev --turbopack -H 0.0.0.0`, then open your computer's address on port 3000; Windows Firewall may ask to allow it). Seeing the signed-in screens on a phone needs a deployed preview, or a tunnel with a real hostname that is added to the OAuth client's redirect URIs and set as `AUTH_URL`.

### Accessibility, phone and keyboard checks (spec 0009)

Four things check the look beyond "it renders", all part of `pnpm test:e2e` and CI except the first:

- **Token contrast** (`apps/web/src/styles/tokenContrast.test.ts`, run by `pnpm test`): reads `tokens.css` and checks the contrast of the color pairs the app draws, in the light and the dark palette, against WCAG AA. Edit a color and run `pnpm --filter @brunchsters/web test` to see whether it still passes. The style guard (`styleGuard.test.ts`) in the same folder fails on any color or font written outside `tokens.css`.
- **Axe** (`e2e/journeys/accessibility.spec.ts`, journeys D1/D2): scans every screen and state for WCAG 2.0/2.1 A and AA problems, in light and dark (it emulates the operating system setting). A failure prints one line per element: the rule, the element and why.
- **The `mobile` Playwright project** (`playwright.config.ts`): an emulated Pixel 7 (Chromium, touch) that runs `responsive-layout.spec.ts` plus the core journeys (`auth`, `access-and-dashboard`, `create-brunch`, `invitations-invitee`, `voting`, `confirm`) at phone width. To run only it: `pnpm --filter @brunchsters/web exec playwright test --project=mobile`. A journey that is purely about rules and data (permissions, emails, option management) is not repeated there: a screen size does not change it.
- **Layout, keyboard and motion** (`responsive-layout.spec.ts`, `keyboard-and-motion.spec.ts`, journeys D3/D4): no screen scrolls sideways at phone, tablet or desktop widths, controls are at least 44px tall on a phone, the brunch and manage pages use two columns from 60rem up, the main paths work with the keyboard alone with a visible focus indicator at every stop, and nothing animates under "reduce motion".

### Testing notes

Per the workflow in `CLAUDE.md`, every milestone records a short testing note (what was tested, how, what's deferred, how to run). These live in the spec's `tasks.md` or a `TESTING-NOTES.md`. This doc describes _how to run_ tests; the per-feature notes describe _what is covered_.

---

## 9. Troubleshooting

| Symptom                                                                                         | Likely cause                                                                                                                                                                       | Fix                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `supabase start` fails with pipe error                                                          | Docker Desktop not running (Windows)                                                                                                                                               | Open Docker Desktop, wait for whale icon to be steady, retry                                                                                                                   |
| `supabase start` fails with port conflict                                                       | Stale containers or another process on :54322                                                                                                                                      | `supabase stop`, check for other processes, retry                                                                                                                              |
| Prisma can't connect                                                                            | `DATABASE_URL` / `DIRECT_URL` not matching `supabase start` output                                                                                                                 | Re-copy `DB_URL` from the CLI output into `apps/web/.env.local` and `packages/database/.env`                                                                                   |
| Auth.js `MissingSecret` error at runtime                                                        | `AUTH_SECRET` not found — Next.js reads `.env.local` from the app directory, not the monorepo root                                                                                 | Ensure `apps/web/.env.local` exists and contains `AUTH_SECRET`                                                                                                                 |
| Turbopack `@prisma/client can't be external`                                                    | `@prisma/client` not installed as a direct dep of `apps/web`                                                                                                                       | `pnpm add --filter @brunchsters/web @prisma/client`                                                                                                                            |
| Google OAuth `invalid_client` / "OAuth client was not found"                                    | App sends `client_id=undefined` — a bare Auth.js v5 provider reads `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`, but we use `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`                     | Credentials are wired explicitly in `auth.ts`; ensure both vars are set in `apps/web/.env.local`                                                                               |
| `pnpm install` blocked by build scripts                                                         | pnpm 11 requires explicit allowBuilds approval                                                                                                                                     | Run `pnpm approve-builds` and set new entries to `true` in `pnpm-workspace.yaml`                                                                                               |
| Migration drift errors                                                                          | Schema changed without a migration                                                                                                                                                 | `pnpm db:migrate` to generate a migration; never edit the DB by hand                                                                                                           |
| App boots then crashes on a missing key                                                         | Required env var unset                                                                                                                                                             | Check `.env.local` against `.env.example`; the start-up message names the missing variable                                                                                     |
| `pnpm test:e2e` fails with "http://localhost:3100 is already used"                              | Something is already listening on the e2e port (a stuck earlier run)                                                                                                               | Find and stop it: `netstat -ano \| findstr :3100`, then `taskkill /F /PID <pid>`; Playwright deliberately will not attach to it                                                |
| `pnpm test:e2e` fails with "Refusing to run e2e against…"                                       | `E2E_DATABASE_URL` points at a non-local host or a database not named `e2e`/`*_e2e`                                                                                                | Unset `E2E_DATABASE_URL` to use the default, or point it at a local `*_e2e` database                                                                                           |
| Integration tests pass locally, fail in CI                                                      | CI's Postgres container starts empty — migrations/seed run fresh each time in `test-integration`                                                                                   | Check the migration is committed (`pnpm db:migrate` generates it); keep `packages/database/src/seed.ts` deterministic                                                          |
| `pnpm test:e2e` fails in setup with `The Inngest dev server never listed the app's functions`   | The app could not register with the Inngest dev server: `/api/inngest` is blocked (check `middleware.ts`), the app failed to start, or one of ports 8298/8299/50152/50153 is taken | Read the `[WebServer]` lines above the error; free the port or fix the route, then rerun                                                                                       |
| Invite sent but no email file appears in `.mail-outbox/`                                        | `INNGEST_DEV` is not set (the no-op bus drops events), the Inngest dev server is not running, or it has not synced with the app                                                    | Set `INNGEST_DEV=1`, restart `pnpm dev`, run the `inngest-cli dev -u http://localhost:3000/api/inngest` command, and check the app shows under Apps in <http://localhost:8288> |
| Locally, emails are really sent or events never arrive                                          | `.env.local` has a real `RESEND_API_KEY` or `INNGEST_EVENT_KEY`                                                                                                                    | Blank them for local work (see 'Email and the job queue'); the e2e suite blanks them for you                                                                                   |
| Server refuses to start: `Missing required environment variable(s) for a production deployment` | `VERCEL_ENV=production` without the email and queue settings                                                                                                                       | Set the variables the message names in Vercel and redeploy                                                                                                                     |
| Resend returns an error for a friend's address                                                  | The sandbox sender only delivers to your own account address                                                                                                                       | Verify a sending domain (see above) and set `EMAIL_FROM`                                                                                                                       |
