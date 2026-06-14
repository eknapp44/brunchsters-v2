# SETUP.md — Local Environment & Testing Guide

**Status:** v0 — forward-looking. Some commands assume the monorepo scaffold exists. Refine this doc against reality as each piece is built (per the documentation cadence in `CLAUDE.md`). Anything not yet true should be marked `[pending scaffold]`.

This guide gets a developer (today, that's you; later, future-you) from a fresh machine to a running local Brunchsters with tests passing. It is **local-first**: the default loop runs entirely on your machine, with cloud services only where they can't be replicated locally.

---

## 1. Philosophy

- **Dev-first.** Production is documented but not active yet. Everything here targets local development.
- **Local-centric testing.** Unit and integration tests run against a local Postgres — no cloud dependency, no network flakiness, fast feedback. External APIs (email, maps) are mocked locally.
- **Minimal required accounts to start.** You can build and test most of v1 with only a local stack plus a couple of free accounts. Paid/harder integrations (Apple Sign-In, live Maps) are deferred until you actually need them.

---

## 2. Required Local Tools

Install these before anything else.

| Tool | Version | Why | Install |
|------|---------|-----|---------|
| **Node.js** | 20 LTS or newer (22 LTS recommended) | Runtime for Next.js + tooling | [nodejs.org](https://nodejs.org) or `nvm install 22` |
| **pnpm** | latest (9+) | Monorepo package manager (workspaces) | `npm install -g pnpm` or `corepack enable pnpm` |
| **Git** | latest | Source control | [git-scm.com](https://git-scm.com) |
| **Docker Desktop** | latest | Runs local Postgres + the local Supabase stack | [docker.com](https://www.docker.com/products/docker-desktop) |
| **Supabase CLI** | latest | Spins up Postgres + Realtime + Auth locally in Docker | `brew install supabase/tap/supabase` or see Supabase docs |
| **A code editor** | — | VS Code recommended (good TS + Prisma extensions) | [code.visualstudio.com](https://code.visualstudio.com) |

**Recommended editor extensions:** Prisma, ESLint, Prettier, Vitest.

**Why Docker if we're not containerizing the app?** We decided against containerizing the *application* (Vercel handles deploys). Docker here is only for **local infrastructure** — Postgres and the Supabase stack — so local dev mirrors production behavior (especially Supabase Realtime) without touching the cloud.

---

## 3. Third-Party Accounts

You don't need all of these on day one. The "When" column tells you when each becomes necessary.

| Service | Purpose | Free tier? | When you need it |
|---------|---------|-----------|------------------|
| **GitHub** | Source control + CI/CD (Actions) | Yes | Now — already done |
| **Supabase** | Postgres + Realtime (prod/shared) | Yes, generous | When you want a shared/cloud DB. **Local dev needs none of this** — the CLI runs it locally. Create a cloud project when you deploy. |
| **Vercel** | App hosting + preview deploys | Yes (hobby) | When you first deploy. Not needed for local dev. |
| **Resend** | Transactional email | Yes (limited sends) | When building/testing email flows for real. Locally, use the mock email service. |
| **Google Cloud Platform** | Maps **Places API** + **Google OAuth** credentials | Places API needs billing enabled (has free monthly credit); OAuth is free | OAuth: when wiring Google sign-in. Places: when wiring the location picker. Until then, mock both. |
| **Apple Developer** | Sign in with Apple | **No — $99/year** | Deferred. Build with Google sign-in first; add Apple closer to launch. |
| **Inngest** | Async job queue (running-late, undo-cancel, vote auto-close) | Yes | When building queued side effects. Has a **local dev server** — no cloud account needed for local work. |

### Recommended account order

1. **Now:** GitHub (done).
2. **Nothing else** until the scaffold runs locally — local Supabase + mocks cover early work.
3. **Google OAuth** when you reach the auth spec.
4. **Resend** when you reach the email/notifications spec.
5. **Google Places** when you reach the location-picker spec.
6. **Vercel + cloud Supabase** when you're ready for the first deploy.
7. **Apple Developer** last, near launch.

---

## 4. First-Time Setup

> Assumes the monorepo scaffold exists. Steps marked `[pending scaffold]` will be real once the scaffold and Prisma schema are in.

```bash
# 1. Clone
git clone git@github.com:<you>/brunchsters.git
cd brunchsters

# 2. Install all workspace dependencies
pnpm install

# 3. Copy the environment template and fill it in
cp .env.example .env.local          # [pending scaffold]
#    -> see Section 5 for what each var means

# 4. Start local infrastructure (Postgres + Realtime + Auth) in Docker
supabase start
#    -> prints local URLs + keys; copy the DB URL and anon key into .env.local

# 5. Apply the database schema and generate the Prisma client
pnpm --filter @brunchsters/database prisma migrate dev     # [pending scaffold]
pnpm --filter @brunchsters/database prisma generate        # [pending scaffold]

# 6. Seed lookup tables (statuses, RSVP states, decision types, etc.)
pnpm --filter @brunchsters/database seed                   # [pending scaffold]

# 7. (Optional) Start the Inngest local dev server in a second terminal
npx inngest-cli dev                                        # [pending scaffold]

# 8. Run the app
pnpm dev                                                    # [pending scaffold]
#    -> http://localhost:3000
```

When everything's up you should have: the Next.js app on `:3000`, local Supabase (Postgres + Realtime) on its CLI-reported ports, and optionally the Inngest dev server.

---

## 5. Environment Variables

Maintain a committed `.env.example` (no secrets) as the canonical list; keep real values in `.env.local` (git-ignored). Update `.env.example` whenever a new var is introduced.

| Variable | Purpose | Where to get it (local) |
|----------|---------|------------------------|
| `DATABASE_URL` | Pooled Postgres connection (app runtime) | From `supabase start` output |
| `DIRECT_URL` | Direct Postgres connection (Prisma migrations) | From `supabase start` output |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL for the Realtime client | From `supabase start` output |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key for client-side Realtime | From `supabase start` output |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side privileged key | From `supabase start` output |
| `AUTH_SECRET` | NextAuth/Auth.js session encryption | `openssl rand -base64 32` |
| `AUTH_URL` | Base URL for auth callbacks | `http://localhost:3000` locally |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth | Google Cloud Console → Credentials (when you reach auth) |
| `APPLE_CLIENT_ID` / `APPLE_CLIENT_SECRET` | Apple Sign-In | Deferred — leave unset until Apple work begins |
| `RESEND_API_KEY` | Email sending | Resend dashboard (mock locally until then) |
| `GOOGLE_PLACES_API_KEY` | Location search | Google Cloud Console (mock locally until then) |
| `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` | Job queue auth | Inngest dashboard; local dev server runs without them |
| `TOKEN_ENCRYPTION_KEY` | AES-256-GCM key for OAuth token encryption (application-level, per ADR) | `openssl rand -base64 32` — 32 bytes. **Never commit. Rotating it invalidates stored tokens.** |

**Rule:** every var above must exist in `.env.example` with a placeholder/empty value and a one-line comment. The app should fail fast on startup with a clear message if a required var is missing (validate env with Zod at boot).

---

## 6. Daily Development Loop

```bash
supabase start            # if not already running
pnpm dev                  # app on :3000
npx inngest-cli dev       # second terminal, only if working on queued jobs

# ... make changes on a feature branch ...

pnpm typecheck            # must pass
pnpm lint                 # must pass
pnpm test                 # must pass
git commit -m "feat(...): ..."   # commit at each green milestone

supabase stop             # when done for the day (frees Docker resources)
```

---

## 7. Local Testing

The whole point: **fast, deterministic tests that run offline.**

### Test types

| Type | What it covers | Runner | DB | External APIs |
|------|----------------|--------|----|--------------| 
| **Unit** | `packages/core` services, pure logic, validation | Vitest | none | mocked (`MockEmailService`, mock providers) |
| **Integration** | DB interactions, Prisma queries, transactions | Vitest | **local Postgres (test DB)** | mocked |
| **E2E** | Critical user flows end-to-end | Playwright | local stack | mocked or sandbox |

### Local test database

Integration tests run against a **dedicated local test database**, separate from your dev DB, so tests can wipe and reseed freely.

```bash
# Recommended: a separate test database on the local Supabase Postgres,
# or a lightweight throwaway Postgres via docker-compose. [pending scaffold]
pnpm test:setup     # creates/migrates/seeds the test DB
pnpm test           # unit + integration
pnpm test:watch     # watch mode during a milestone
pnpm test:e2e       # Playwright
```

Conventions:
- Each integration test starts from a known seeded state and cleans up after itself (transaction rollback per test, or truncate-and-reseed).
- External boundaries (Resend, Google Places) are **always** mocked in tests via the interface + mock-implementation pattern from `CLAUDE.md`. Tests never hit a real third-party API.
- Tests are co-located: `createBrunch.test.ts` next to `createBrunch.ts`.

### Testing notes

Per the workflow in `CLAUDE.md`, every milestone records a short testing note (what was tested, how, what's deferred, how to run). These live in the spec's `tasks.md` or a `TESTING-NOTES.md`. This doc describes *how to run* tests; the per-feature notes describe *what is covered*.

---

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `supabase start` fails | Docker Desktop not running | Start Docker Desktop, retry |
| Port already in use | Stale containers or a previous `pnpm dev` | `supabase stop`, kill the process on the port, retry |
| Prisma can't connect | `DATABASE_URL` / `DIRECT_URL` not matching `supabase start` output | Re-copy the URLs from the CLI output into `.env.local` |
| Migration drift errors | Schema changed without a migration | `prisma migrate dev` to generate a migration; never edit the DB by hand |
| App boots then crashes on a missing key | Required env var unset | Check `.env.local` against `.env.example`; the boot-time Zod validation message names the missing var |
| Tests pass locally, fail in CI | CI test DB not seeded the same way | Ensure `test:setup` runs in CI before `test`; keep seed deterministic |

---

## 9. What This Doc Should Become

Once the scaffold exists, remove every `[pending scaffold]` marker by verifying the real command works, and add:
- Exact `pnpm` script names from the root `package.json`
- The real `docker-compose.yml` path (if used for the test DB)
- Any per-package setup quirks
- A "30-second smoke test" — the shortest command sequence that proves the local stack is healthy

Keep it runnable. If a step here ever fails for you, it will fail for the next person — fix the doc in the same commit that changes the behavior.
