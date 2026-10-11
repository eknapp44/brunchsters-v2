# Tasks 0007 — Email Normalization

Four small milestones, each green on its own. Testing notes are filled in as each completes (CLAUDE.md — Testing notes required per milestone). Branch: `feat/0007-email-normalization`, stacked on `feat/0006-e2e-testing-infra` (this work needs its e2e suite and fixes). Close each milestone with `/milestone-done`.

---

## M1 — `normalizeEmail` and the boundaries

- [x] Commit ADR 0008 and this spec (docs-only commit, before any code) — `ea3ae18`
- [x] `packages/shared/src/email.ts`: `normalizeEmail(raw): Email` (trim + lowercase); exported from `@brunchsters/shared`; unit tests (case, whitespace, idempotent, same-address-two-cases, leaves dots and plus-tags alone)
- [x] `sendInvitesRequestSchema` and `suggestInviteeRequestSchema` transform to `Email`; `SendInvitesInput` / `SuggestInviteeInput` carry `Email` (the inferred schema output type)
- [x] `signInWithProvider` normalizes the provider's address before lookup/create
- [x] Fix every caller and test the type change breaks — **no production code in `packages/core` or `apps/web` needed changing beyond the three boundaries** (the routes pass the parsed, already-normalized value straight through); 64 type errors were all in tests and the e2e factory, fixed at the constants' definitions
- [x] Unit tests per boundary with mixed-case input (both request schemas)
- [x] Integration tests (real Postgres): same address in two cases → one invite row; lowercase invite finds an account created from a capitalized provider address; sign-in with a capitalized address stores it lowercase and the same person via another provider links to one account
- [x] `pnpm typecheck && pnpm lint && pnpm test && pnpm --filter @brunchsters/core test:integration && pnpm test:e2e` pass
- [x] Commit: `feat: normalize email addresses at the boundary (M1)`

**Testing notes:**

- **What was tested:** `normalizeEmail` (5 tests in `packages/shared`): lowercases, trims, idempotent, two spellings of one address compare equal, and plus-tags/dots are untouched (provider aliasing is out of scope, ADR 0008). Boundaries (unit): `sendInvitesRequestSchema` turns `Alice@Example.COM, BOB@example.com` into lowercase and gives identical output for `Case-X@Example.com` and `case-x@example.com`; `suggestInviteeRequestSchema` normalizes `Friend@Example.COM`. Real Postgres: **inviting one address typed in two cases produces one invite row** (the second request refreshes it — same id, no second row, and the stored address is the lowercase form); **an invite finds an existing account however the address is capitalized** (Google reported `Capital-…@Example.com`, the account is stored lowercase, the host types `CAPITAL-…@example.COM`, and the invite takes the known-user path: `invitedUserId` set and the attendee row created immediately); and **`signInWithProvider` stores the provider's address normalized and links a later sign-in in another case to the same account** (still one user).
- **How:** unit (shared 7, core 359 — +3 over before) and integration against real local Postgres (83 — +3). The e2e suite is unchanged and passes: 65/65 in dev mode, 195/195 with 4 workers × 3 repeats, 65/65 in CI mode (production build). **Mutation check:** replacing the schema transform with a bare cast and the sign-in normalization with a cast made exactly the 5 new tests fail (2 unit, 3 integration) and nothing else.
- **The type system did the finding:** making the services take the branded `Email` turned every un-normalized call site into a compile error — 64 of them, **all in tests and the e2e factory, none in production code**. That is the design working: there was no boundary left that bypassed normalization. The services keep their own defensive case-insensitive comparisons (the host's address, in-batch duplicates), so a few unit tests deliberately pass a mixed-case `Email` through an explicit cast to keep exercising that defence.
- **A slip of mine, caught and repaired:** undoing a mutation with `git checkout` also discarded the real uncommitted edits to the same two files. I noticed because the typecheck diff was empty, reapplied them, and re-ran everything (the numbers above are from after the repair). For mutation checks on uncommitted work, copy the file first instead of using `git checkout`.
- **What's deferred:** The database still accepts mixed-case rows until M2 (the backfill and check constraints); until then the guarantee is the type system plus these tests, not the schema. The e2e journey for this (I7) is M3. The `createUser` factory now takes the address "as the provider reports it" (it may have capitals) and stores it normalized, ready for I7.
- **How to run it:** `pnpm test` (unit, includes `packages/shared`), `pnpm --filter @brunchsters/core test:integration`, `pnpm test:e2e`.

---

## M2 — Migration: backfill and check constraints

- [ ] Migration `<ts>_normalize_emails`: collision check (readable error), `UPDATE … lower(btrim(…))` on the four columns, `CHECK (col = lower(col))` on each
- [ ] Verify against a scratch database with mixed-case rows: (a) clean backfill, (b) a deliberate collision stops with the readable message and changes nothing, (c) the constraint rejects a direct mixed-case insert afterwards; record the script and results
- [ ] Apply to the local dev database and the e2e database (`pnpm e2e:db:reset`); seeds still run
- [ ] Update any test or script that inserts a mixed-case address directly
- [ ] An integration test that a direct mixed-case insert fails the constraint
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm --filter @brunchsters/core test:integration && pnpm test:e2e` pass
- [ ] Commit: `feat: lowercase existing emails and enforce it in the database (M2)`

**Testing notes:** _(fill on completion)_

---

## M3 — E2E journey I7

- [ ] `factories.ts`: `createUser` can take a capitalized provider address; `inviteToBrunch` / panel inputs exercised in mixed case
- [ ] **I7** — the host invites an address in two cases (through the invite panel): one invite, one link; an existing user created from a capitalized provider address is recognized when invited in lowercase (appears on their dashboard immediately)
- [ ] Confirm I7 fails without the fix (temporarily remove the normalization)
- [ ] The 33 other journeys and the API-authorization tests pass unchanged
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` pass; stress run; CI-mode run
- [ ] Commit: `test: e2e journey for one address, one person (M3)`

**Testing notes:** _(fill on completion)_

---

## M4 — Docs and wrap-up

- [ ] PLANNING §17 entry resolved; §16 notes updated
- [ ] `CLAUDE.md`: emails are `Email` values made by `normalizeEmail`; never compare raw strings
- [ ] `docs/SETUP.md` if any command or setup step changed
- [ ] Mark `spec.md` status Complete and tick its acceptance criteria; update the memory note
- [ ] Commit: `docs: close out spec 0007 (M4)`

**Testing notes:** _(fill on completion)_
