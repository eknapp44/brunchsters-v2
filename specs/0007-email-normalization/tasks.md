# Tasks 0007 — Email Normalization

Four small milestones, each green on its own. Testing notes are filled in as each completes (CLAUDE.md — Testing notes required per milestone). Branch: `feat/0007-email-normalization`, stacked on `feat/0006-e2e-testing-infra` (this work needs its e2e suite and fixes). Close each milestone with `/milestone-done`.

---

## M1 — `normalizeEmail` and the boundaries

- [ ] Commit ADR 0008 and this spec (docs-only commit, before any code)
- [ ] `packages/shared/src/email.ts`: `normalizeEmail(raw): Email` (trim + lowercase); exported from `@brunchsters/shared`; unit tests (case, whitespace, idempotent)
- [ ] `sendInvitesRequestSchema` and `suggestInviteeRequestSchema` transform to `Email`; `SendInvitesInput` / `SuggestInviteeInput` carry `Email`
- [ ] `signInWithProvider` normalizes the provider's address before lookup/create
- [ ] Fix every caller and test the type change breaks (they pass `normalizeEmail(…)` or an `Email`)
- [ ] Unit tests per boundary with mixed-case input
- [ ] Integration tests (real Postgres): same address in two cases → one invite row; lowercase invite finds an account created from a capitalized provider address
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm --filter @brunchsters/core test:integration && pnpm test:e2e` pass
- [ ] Commit: `feat: normalize email addresses at the boundary (M1)`

**Testing notes:** _(fill on completion)_

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
