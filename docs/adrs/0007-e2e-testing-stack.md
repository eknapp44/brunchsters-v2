# 0007 — End-to-end testing stack

**Date:** 2026-10-10  
**Status:** Accepted  
**Deciders:** Evan Knapp

## Context

Unit and integration tests cover `packages/core` and the route handlers, but nothing exercises the app in a browser or with more than one signed-in identity at once. That gap has already cost us:

- Two real bugs in spec 0004 (a self-invite batch rejection and an already-member collision) were found only by manual testing with two real Google accounts. Both needed two identities touching the same data.
- Specs 0004 and 0005 both hit the same wall: the M7/M8 UI had no automated browser coverage, so verification fell back to minting session JWTs and driving the HTTP surface. That proved server-rendered data and routes, not checkbox clicks, debounced search, or `router.refresh()`.

Google OAuth cannot be driven headlessly, so any browser test needs a way to obtain a signed-in session without it.

## Decision

Use **Playwright** to drive full multi-actor user journeys against a real app server and a real Postgres, authenticated by **minted session cookies**.

1. **Playwright, Chromium only (for now), in `apps/web/e2e/`.** Tests, fixtures and config live beside the app they drive and import from `@brunchsters/core` and `@brunchsters/database`; a separate workspace was rejected as extra config for a single consumer. Each actor (host, invitee) is a fixture with its own `storageState`; multi-actor tests use separate browser contexts. Selectors are role/label first, `data-testid` as a fallback; assertions are web-first; traces are captured on first retry.
2. **Authentication: mint NextAuth session JWTs; no test-only auth provider.** A test helper encodes a session cookie with `next-auth/jwt`'s `encode()` using the same `AUTH_SECRET` and cookie salt the app uses (the technique proven in the spec 0005 M7/M8 smoke tests). The cookie name, and therefore the salt, differs between `http://localhost` and `https`, so the helper derives it from `AUTH_URL`. Minting skips `signInWithProvider`, so fixture users are created by calling that core function (same shape as real users) and the JWT's `userId` is that row's id. `apps/web/src/auth.ts` is **not modified**, so production has no bypass code path whose safety depends on a flag staying off. This supersedes the earlier proposal of an env-gated `Credentials` provider.
3. **Database: ephemeral per environment, injected through `DATABASE_URL`.** Locally, a dedicated `brunchsters_e2e` database on the existing local Supabase Postgres. In CI, the existing Postgres 17 service container. **Testcontainers is deferred**, not rejected (see Alternatives).
4. **Environment-agnostic by construction.** The suite reads only `E2E_DATABASE_URL` and `BASE_URL`, with no hardcoded hosts, so the same tests can later run against INT/QA. (`E2E_DATABASE_URL`, not `DATABASE_URL`: that name is what dev shells and `.env` files use, so reading it could silently aim the suite at the dev database.) A setup guard refuses to run unless the database host is local and its name is `e2e` or ends in `_e2e`. The E2E server runs on its own port with `DATABASE_URL` set explicitly from `E2E_DATABASE_URL` in Playwright's `webServer.env`, and `reuseExistingServer` is `false`, so Playwright fails rather than attach to a server it did not start. `apps/web/.env.local` points at the dev database, so silently attaching to an already-running dev server must be impossible. Verified in spec 0006 M1: process env set through `webServer.env` overrides `.env.local`, and the server reports the e2e database.
5. **Data: reference seed once, fixtures per test.** Lookup tables (FK targets) are seeded once by `db:seed`. Every test creates its own users and brunch through fixture helpers (core services or Prisma directly, not the UI) with unique emails, so tests are order-independent and parallel-safe. There is no shared pre-made dataset and no reset between tests. The UI is used only for the step under test. Demo data stays dev-only and is never part of E2E.
6. **Server: `next dev` locally** (`reuseExistingServer`), **`next build && next start` in CI.**
7. **External boundaries mocked at the network edge, with no production change.** The Places route handlers construct `GooglePlacesProvider` inline, so there is no injection seam, and the only caller of `/api/v1/places/**` is the browser. Playwright intercepts those requests with `page.route` and returns fixtures, so no server code changes and no Google key is needed. The route-to-Google mapping is not exercised end to end; `GooglePlacesProvider.test.ts` already covers it. Resend and Inngest are not yet wired (`NoopEventBus`), so there is nothing to mock there yet; invite links are built from tokens fixtures read from the database. `auth.ts` still requires `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` at boot, so the E2E server gets placeholder values, as the CI build job already does.
8. **Scope discipline.** E2E covers a small number of user journeys, especially multi-identity ones. Permutations of rules and rejection cases stay in unit and integration tests.

### CI

- E2E runs as its own job on every PR to `main`, and must be configured as a **required status check**. Traces upload as artifacts on failure.
- **Merge skew:** CI now runs on every push to `main` as well as on pull requests, so the merge result is re-checked; "require branches to be up to date" is still recommended in the branch-protection rule.
- **Release gating (implemented in spec 0006 M8):** `release.yml` used to run on every push to `main` with no dependency on CI, so a merge could cut a release even if tests failed on that commit. The release job now lives in `ci.yml` and `needs` every other job (lint, typecheck, test, integration, e2e, validate, build), running only on pushes to `main`; `release.yml` was removed. A job dependency inside one workflow run is exact — the release is of the very commit the checks passed on. `workflow_run` was rejected: it triggers from the latest `main` rather than the tested commit, and semantic-release insists on releasing the current branch tip. The release commit carries `[skip ci]`, so it does not loop; a `concurrency` group stops two quick merges releasing at once. Pull requests skip the release job, so it must not be added as a required status check.
- A small `@smoke` subset is reserved for post-deploy runs against deployed environments once INT/QA exist. The full suite stays on ephemeral databases.

### Browsers — planned, with triggers

Playwright browsers are `projects` entries, so adding one is a few lines. Start with Chromium only. Add when a user-reported browser-specific bug appears, or before going public, in this order: **WebKit** (Safari) and a **mobile-viewport** project (the app will mostly be opened on phones; Apple sign-in is planned), then **Firefox**. Edge is Chromium-based and adds little. Extra browsers run nightly or on a label, not on every PR.

## Consequences

- Automated regression coverage for multi-actor flows and client-side interactivity, with no manual two-account testing.
- No production auth code is added for testing; the cost is that the real Google sign-in flow itself stays untested by E2E.
- E2E adds CI time (browser install, app build) and a flakiness risk; mitigated by web-first assertions, per-test isolation, and keeping the suite to journeys.
- Cookie minting couples the helper to Auth.js internals (cookie name/salt, JWT shape). An Auth.js upgrade can break it, and the failure will be loud (every test unauthenticated).
- Per-test fixtures with unique data mean the E2E database accumulates rows; acceptable for an ephemeral database, recreated per CI run and re-creatable locally.
- Places fixtures must stay honest to the real adapter's response shape; a change to the Places routes' output needs the fixtures updated in the same PR.
- Out of scope: the real Google sign-in flow, Apple sign-in, and visual-regression snapshots.

## Alternatives considered

- **Env-gated `Credentials` provider in `auth.ts`** (the original proposal). Rejected: ships a bypass in the production bundle whose safety depends on configuration. It would only be preferable if we wanted to E2E the real sign-in flow, which still requires Google.
- **Testcontainers for Postgres.** Deferred. CI already provides an ephemeral Postgres service container, and locally it would add a third database path plus Docker friction on Windows (the Hyper-V/WSL port-exclusion trouble logged in spec 0005 M1). Its remaining benefit, not needing `supabase start`, is minor today. Because the setup consumes only `E2E_DATABASE_URL`, it can be added later without changing any test. Revisit if local setup friction continues. A fresh container would still need migrations plus the reference seed, so it is not a zero-data option.
- **A large shared pre-made dataset.** Rejected: couples tests, makes ordering matter, and collides under parallel workers.
- **Drive every flow through the UI, including setup.** Rejected: slow and brittle for setup steps that are not under test.
- **Cypress or other runners.** Not evaluated in depth; Playwright is already named in CLAUDE.md and `docs/SETUP.md`, and has first-class multi-context support for the multi-actor case.
