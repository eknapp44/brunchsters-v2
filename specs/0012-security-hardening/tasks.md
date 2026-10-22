# Tasks 0012 — Security Hardening

Six milestones, each green on its own and ending in a commit. Branch: `feat/0012-security-hardening`, cut from `main` (no stacking). Close each milestone with `/milestone-done`, then **stop for the owner's review** before the next. Every milestone runs `pnpm typecheck && pnpm lint && pnpm test`, and `pnpm test:e2e` whenever it touches anything a user sees or does. Re-verify each milestone's "journeys that change" list with a grep at its start; the grep wins over the list.

The order proves the risky parts early: the dependency patch first (it is the largest known exposure and changes every route's auth), the limiter's concurrency next (the part that can be wrong), then the callers, then CSP.

---

## M1 — Patch dependencies, gate CI, prove sessions fail closed

- [x] Commit this spec folder, ADRs 0013 and 0014 (with README index rows), the `PLANNING.md` edits and the spec 0009/0010 numbering fixes as one docs-only commit, before any code
- [ ] **Journey S2 first**, against the current versions: a corrupt and an expired session cookie get 401 from every API route sampled (one per family) and a redirect to sign-in from a page; never 200, never 500
- [ ] Bump `next` to the newest 15.5.x (15.5.28 at the time of writing); full suite in dev and CI mode (`CI=true pnpm build && CI=true pnpm test:e2e`); own commit
- [ ] Bump `next-auth` to `5.0.0-beta.32` (`@auth/core` 0.41.3); re-run `pnpm audit --prod`; S2 still green; real Google sign-in checked by hand on the dev server
- [ ] Clear what remains: `pnpm.overrides` for patched transitive ranges; `pnpm.auditConfig.ignoreGhsas` only for advisories with no fix, each listed with reason and date in `docs/SETUP.md` ("Dependency audit")
- [ ] CI: `pnpm audit --prod --audit-level=high` as a step; `docs/SETUP.md` explains it and **proposes** Dependabot (repository setting: not written)
- [ ] **Prove the tests can fail:** S2 with the session check in one handler changed to treat an error object as signed in → S2 fails; the audit step against a deliberately old pinned version in a scratch branch → CI step fails
- [ ] Commit: `fix(deps): patch next and next-auth advisories and gate CI on a production audit (M1)`

**Journeys that change:** none edited; S2 added. **Names that change:** none. **Deployable:** yes.

**Testing notes:** _(fill on completion)_

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
- [ ] `InvitePanel` shows the limited line for send and resend, labels unchanged
- [ ] Journeys **L1** (cap) and **L2** (resend cooldown, a different invite still works)
- [ ] **Prove the tests can fail:** consume before the host check → the outsider case in the service test fails; remove the cooldown → L2 fails; charge the raw instead of the de-duplicated count → the count test fails
- [ ] Commit: `feat: limit invite emails per host, per brunch and per resend (M3)`

**Journeys that change:** the invitations-host journeys that click Resend (grep at start) must not trip the cooldown: each uses its own invite. **Names that change:** none (new text inside the existing alert).

**Testing notes:** _(fill on completion)_

---

## M4 — Places, writes, tokens

- [ ] Both Places handlers call `auth()` and consume 30 and 20 per person per minute before Google; their tests gain a session mock
- [ ] `enforceWriteLimit` in every mutating `v1` handler right after `auth()`; the scanning test with its allowlist (the two invite routes limited in core, the token routes); handler tests per family
- [ ] Token routes count 404 answers per IP; `PlaceSearchInput` shows its limited line
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
