# Tasks 0012 — Security Hardening

Six milestones, each green on its own and ending in a commit. Branch: `feat/0012-security-hardening`, cut from `main` (no stacking). Close each milestone with `/milestone-done`, then **stop for the owner's review** before the next. Every milestone runs `pnpm typecheck && pnpm lint && pnpm test`, and `pnpm test:e2e` whenever it touches anything a user sees or does. Re-verify each milestone's "journeys that change" list with a grep at its start; the grep wins over the list.

The order proves the risky parts early: the dependency patch first (it is the largest known exposure and changes every route's auth), the limiter's concurrency next (the part that can be wrong), then the callers, then CSP.

---

## M1 — Patch dependencies, gate CI, prove sessions fail closed

- [x] Commit this spec folder, ADRs 0013 and 0014 (with README index rows), the `PLANNING.md` edits and the spec 0009/0010 numbering fixes as one docs-only commit, before any code
- [x] **Journey S2 first**, against the current versions: a corrupt and an expired session cookie get 401 from every API route sampled (one per family) and a redirect to sign-in from a page; never 200, never 500
- [x] Bump `next` to the newest 15.5.x (15.5.28 at the time of writing); full suite in dev and CI mode (`CI=true pnpm build && CI=true pnpm test:e2e`); own commit
- [x] Bump `next-auth` to `5.0.0-beta.32` (`@auth/core` 0.41.3); re-run `pnpm audit --prod`; S2 still green; real Google sign-in checked by hand on the dev server
- [x] Clear what remains: `pnpm.overrides` for patched transitive ranges; `pnpm.auditConfig.ignoreGhsas` only for advisories with no fix, each listed with reason and date in `docs/SETUP.md` ("Dependency audit")
- [x] CI: `pnpm audit --prod --audit-level=high` as a step; `docs/SETUP.md` explains it and **proposes** Dependabot (repository setting: not written)
- [x] **Prove the tests can fail:** S2 with the session check in one handler changed to treat an error object as signed in → S2 fails; the audit step against a deliberately old pinned version in a scratch branch → CI step fails
- [x] Commits (three, not one: the `next` bump was meant to be its own commit): `test: S2 a broken session is never signed in`, `fix(deps): patch next to 15.5.28`, `fix(deps): patch next-auth and transitive advisories, gate CI on a production audit`, and this close-out `docs: record M1 testing notes (M1)`

**Journeys that change:** none edited; S2 added. **Names that change:** none. **Deployable:** yes.

**Testing notes:**

- **What was tested:** journey **S2**: for six kinds of broken credential (a cookie that is not a token, a real token with its signature altered, an expired token, a token signed with another secret, a bare `Bearer` header, a `Bearer` header with junk) a route from each family answers **401** (`GET places/search`, `POST brunches`, `POST brunches/[id]/rsvp`, `POST brunches/[id]/invites`, `POST invites/[id]/resend`, and the public-prefixed `POST invites/token/[token]/respond`, whose own `auth()` check is the only gate), never 200 and never a 5xx; and for the cookie variants a page request (`/dashboard`) is sent to `/sign-in?callbackUrl=…` with no Sign out button. This is the outside view of the Auth.js advisory "configuration errors can cause existence-based auth checks to fail open", since every handler gates on `session === null` and the middleware on `req.auth`. Dependencies: `pnpm audit --prod` went from 32 advisories (6 critical, 15 high, 11 moderate) to none.
- **How:** E2E (Playwright, chromium only, a throwaway user per credential), run **before** the bump (6 of 6 green on `next` 15.5.19 / `next-auth` beta.31) and again after each bump. Unit and integration suites run unchanged. No mocks. After the final lockfile: `pnpm typecheck` and `pnpm lint` clean; `pnpm test` shared 40, core 485, web 418, database 1; `pnpm --filter @brunchsters/core test:integration` 18 files; `CI=true pnpm build`; `pnpm test:e2e` 195 passed and 2 skipped in dev mode and again in CI mode (production build); the stress run (`--workers=4 --repeat-each=3`) 585 passed, 6 skipped, 0 failed; nothing left listening on port 3100. (Typecheck, lint and unit were rerun at close-out; dev mode, CI mode, integration and the build ran earlier in the session on the identical dependency tree.) **Mutation checks:** (1) in `invites/token/[token]/respond/route.ts` the check `session === null` replaced by `false` → S2 failed on every credential variant (`POST …/respond` answered 422, expected 401), file restored with `git checkout` (it was committed code) and `git status` confirmed clean; (2) the audit gate: with the pre-bump `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `apps/web/package.json` restored from `HEAD`, `pnpm audit --prod --audit-level=high` reported 18 advisories and **exited 1**; with the real files it exits 0.
- **E2E journeys:** S2 added (`apps/web/e2e/journeys/session-integrity.spec.ts`). No journey edited: the bump changes no screen, name or rule.
- **What's deferred:** (1) the CI step itself has not run on GitHub yet (it runs on the PR; locally the same command was checked both ways); (2) the **three overrides that cross a major or 0.x boundary** (`sharp` 0.34 → 0.35, `deepmerge-ts` 7 → 8, `postcss` 8.4 → 8.5) are exercised by the build, Prisma generate/validate, the integration tests and the whole e2e suite, but not by a deployed build; `sharp` is only reachable through Next's built-in `/_next/image` endpoint, which no page of ours uses (no `next/image`, no `images` config); if one of them misbehaves later, remove that one override and add a dated `ignoreGhsas` entry instead; (3) S2 runs on the chromium project only (a session cookie is the same on a phone); (4) the real Google sign-in is manual by nature (ADR 0007): **checked by the owner on the dev server after the bump, sign-in and sign-out both worked**; (5) CSP and the limiter are later milestones.
- **Answers to the spec's Open Question 2:** `next-auth@5.0.0-beta.32` (with `@auth/core` 0.41.3) clears every Auth.js advisory, although the advisories name a `5.0.0` that is not published. Nothing is on the ignore list; `docs/SETUP.md` ("Dependency audit") says so and to recheck when Auth.js v5 goes stable.
- **Correction to this milestone's original task list:** the overrides live in `overrides:` in `pnpm-workspace.yaml` (pnpm 11 reads them there), not under `pnpm` in `package.json`; no `ignoreGhsas` entry was needed; the work landed as three commits instead of one, which the plan already wanted for the `next` bump. The mutation check named "an error object treated as signed in" was done by removing the check outright, because the other handlers sit behind the middleware (which answers 401 first) and only the token-respond route depends on its own check, a fact worth remembering for M4's write limiter: a route in `PUBLIC_PREFIXES` gets no session gate from the middleware.
- **Found along the way:** the pre-commit hook runs Prettier on YAML, so a `pnpm add` rewrites the lockfile in pnpm's own style (5,000-line diff) until `pnpm exec prettier --write pnpm-lock.yaml`; after that the real diff was 48 lines (known trap, confirmed). The e2e server log now shows several `JWTSessionError` lines (one per broken credential) by design.
- **No new runtime dependency** (versions of existing ones), so no first-load JS comparison.
- **How to run it:** `pnpm test:e2e session-integrity` (a file filter works after the script); `pnpm audit --prod --audit-level=high`; full: `pnpm typecheck && pnpm lint && pnpm test && pnpm --filter @brunchsters/core test:integration && CI=true pnpm build && CI=true pnpm test:e2e`.

---

## M2 — The limiter (schema, core, prune job)

- [ ] `RateLimitBucket` in the schema + migration; apply on the dev and e2e databases; `docs/PLANNING.md` §8 data model note (operational table, not a domain entity, no soft delete)
- [ ] `packages/shared/src/rateLimits.ts` (the policy constants)
- [ ] `RateLimiter`, `PostgresRateLimiter` (injected `now`), `InMemoryRateLimiter`, `retryAfter.ts`, exported from `packages/core`
- [ ] `pruneRateLimitBuckets` and the daily Inngest cron function, registered in `functions.ts`
- [ ] Unit tests (window math, in-memory limiter) and integration tests (concurrency: 50 parallel calls at limit 10 allow exactly 10; denial does not increment; rollover with the injected clock; cost above the limit; prune)
- [ ] **Prove the tests can fail:** replace the conditional upsert with read-then-write → the concurrency test fails; increment on denial → the "denial does not increment" test fails
- [ ] Commit: `feat: add the Postgres rate limiter behind a RateLimiter interface (M2)`

**Journeys that change:** none (no caller yet). **Deployable:** yes (a table and an unused service).

**Testing notes:** _(fill on completion)_

---

## M3 — Invite and resend limits

- [ ] Use the `ui-screen` skill; finalize the three strings against `design-docs/Brand Voice.html`; `limitedCopy.ts` + test
- [ ] `getRateLimiter()` in `lib/services.ts`; `rateLimitedResponse` and `clientIp` in `lib/rateLimit.ts` + tests
- [ ] `sendInvites` and `resendInvite`: `rateLimiter` in `ctx`, `rate_limited` error, consumed after the host check (order table in the plan); unit tests with the in-memory limiter, integration test with the real one; a denied send creates nothing and emits nothing
- [ ] The two routes map `rate_limited` to 429; handler tests
- [ ] `useLimitedUntil` (absolute timestamp in `localStorage`, `try/catch`, in-memory fallback) + unit tests; `InvitePanel` disables send and the one invite's Resend after a 429 (`aria-disabled`, focusable, labels unchanged) with the limited line beside it
- [ ] Journeys **L1** (cap) and **L2** (resend cooldown, a different invite still works), each also asserting disabled, still disabled after a reload, and re-enabled once the browser clock (Playwright `page.clock`) passes the wait
- [ ] **Prove the tests can fail:** consume before the host check → the outsider case in the service test fails; remove the cooldown → L2 fails; stop persisting the timestamp → the after-reload assertion in L1 fails; charge the raw instead of the de-duplicated count → the count test fails
- [ ] Commit: `feat: limit invite emails per host, per brunch and per resend (M3)`

**Journeys that change:** the invitations-host journeys that click Resend (grep at start) must not trip the cooldown: each uses its own invite. **Names that change:** none (new text inside the existing alert).

**Testing notes:** _(fill on completion)_

---

## M4 — Places, writes, tokens

- [ ] Both Places handlers call `auth()` and consume 30 and 20 per person per minute before Google; their tests gain a session mock
- [ ] `enforceWriteLimit` in every mutating `v1` handler right after `auth()`; the scanning test with its allowlist (the two invite routes limited in core, the token routes); handler tests per family
- [ ] Token routes count 404 answers per IP; `PlaceSearchInput` shows its limited line, stays usable, and clears the line when the wait passes
- [ ] Journeys **L3** (places), **L4** (writes, per person), **L5** (outsider equals made-up id under and over budget; edits `api-authorization`), **L6** (tokens, own `x-forwarded-for`)
- [ ] **Prove the tests can fail:** drop `enforceWriteLimit` from one route → the scanning test fails; key the write limit by brunch id → L5 (real vs made-up) fails; key it globally → L4's second member fails; skip the Places limit → L3 fails
- [ ] Commit: `feat: limit place search, writes and invalid invite tokens (M4)`

**Journeys that change:** `api-authorization.spec.ts` (L5 cases), and any journey that fires many writes from one user in a minute (grep for loops over `request.post`; none expected). **Names that change:** none.

**Testing notes:** _(fill on completion)_

---

## M5 — CSP, report-only

- [ ] `buildContentSecurityPolicy` + unit tests; middleware nonce, request and response headers, early returns covered
- [ ] Report-Only header on every response; S1 asserts the header name and key directives
- [ ] Journey **S3**: main paths raise no `securitypolicyviolation` (light and dark, desktop and phone project where the path is in it)
- [ ] Fix whatever S3 finds (expected: `style-src-attr`, `form-action`, a dev-only `unsafe-eval`); record each finding in the testing notes
- [ ] **Prove the tests can fail:** remove the nonce from the policy → S3 fails; add an inline script to a test page in a scratch branch → S3 reports the violation
- [ ] Commit: `feat: send a nonce-based Content-Security-Policy in report-only mode (M5)`

**Journeys that change:** S1 (header assertions). **Names that change:** none.

**Testing notes:** _(fill on completion)_

---

## M6 — Enforce CSP and close out

- [ ] Manual real Google sign-in and sign-out on the dev server with the policy in report-only: console clean; answers Open Question 3
- [ ] Flip to enforcing (the header name); full suite in dev and CI mode; S1 asserts the enforcing header
- [ ] `PLANNING.md` §16 and §17 updated item by item; deployment pre-launch checklist gains HSTS, the `x-forwarded-for` check, the CSP console pass and where limit-hit logs go
- [ ] `docs/SETUP.md` (audit, running the limit journeys), `apps/web/CLAUDE.md` ("Limited state"), root `CLAUDE.md` (one rule line), the `spec-grill` skill prompt
- [ ] Spec status → Complete with an "Outcome" section (numbers actually used, what the audit found, what CSP changed)
- [ ] Run `/pre-merge-review` before the PR
- [ ] Commit: `feat: enforce the Content-Security-Policy and close out spec 0012 (M6)`

**Journeys that change:** S1 (enforcing header). **Names that change:** none.

**Testing notes:** _(fill on completion)_
