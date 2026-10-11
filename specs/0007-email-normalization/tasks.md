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

- [x] Migration `20261011120000_normalize_emails`: collision check (readable error), `UPDATE … lower(btrim(…))` on the four columns, `CHECK (col = lower(btrim(col)))` on each (**diverged slightly from the plan:** the check also rejects surrounding whitespace, matching what `normalizeEmail` produces)
- [x] Verify against a scratch database with mixed-case rows: (a) clean backfill, (b) a deliberate collision stops with the readable message and changes nothing — checked for all three unique keys, (c) the constraint rejects a direct mixed-case insert afterwards; script and results in the notes
- [x] Apply to the local dev database and the e2e database (`pnpm e2e:db:reset`); seeds still run
- [x] Update any test or script that inserts a mixed-case address directly — none were left after M1's constant fixes; nothing failed against the constraints
- [x] An integration test that a direct mixed-case insert fails the constraint (5 tests, one per column plus "a canonical address is still accepted")
- [x] `pnpm typecheck && pnpm lint && pnpm test && pnpm --filter @brunchsters/core test:integration && pnpm test:e2e` pass
- [x] Commit: `feat: lowercase existing emails and enforce it in the database (M2)`

**Testing notes:**

- **What was tested:** The migration was run against a throwaway database (`brunchsters_migtest`, created from every earlier migration plus the seeded lookup tables, then dropped) holding deliberately awkward data. **(a) Clean backfill:** with `Host@Example.COM`, `Guest@Example.com` (user and provider), invites `Guest@Example.com`, `already-lower@example.com` and ` Padded@Example.com` (note the whitespace), and a suggestion `Friend@Example.com`, the row counts were identical before and after (2 users, 1 provider, 3 invites, 1 suggestion) and the number of non-canonical rows went from 2 / 1 / 2 / 1 to 0 / 0 / 0 / 0; the padded invite became `padded@example.com`. **(c) Constraints:** afterwards a direct insert of `Mixed@Example.com` and of ` padded@example.com` each failed with `violates check constraint "User_email_normalized"`, and a canonical address was still accepted. **(b) Collisions:** with `Dup@Example.com` and `dup@example.com` as two users the migration stopped with `Cannot normalize "User"."email": these addresses appear more than once when case and surrounding whitespace are ignored: dup@example.com. Merge or remove the duplicate users by hand, then re-run the migration.`; with two invites for one brunch differing only by case it named the `brunchId / address` pair, and likewise for suggestions; in each case the data afterwards was byte-for-byte what it was before (no row changed, **no constraint added**). The collision check runs first inside one `DO` block, so it cannot half-apply. Then against real databases: the migration applied cleanly to the local dev database (0 mixed-case rows there beforehand, confirmed first) and to a freshly created e2e database (`pnpm test:e2e` resets and migrates it every run); `prisma migrate diff` reports **no drift** (Prisma ignores check constraints, as with the partial unique indexes from spec 0005).
- **How:** the scratch-database verification is a script (kept out of the repo: it only exists to prove this one migration; its exact steps are described above and reproducible with `docker exec … psql`). Committed tests: `emailConstraints.integration.test.ts` (5 tests, real Postgres) asserts each of the four columns rejects a mixed-case address with the constraint's name and that a canonical address still goes in. Suites: unit unchanged (shared 7, core 359, web 216); core integration 88 (+5); e2e 65/65 in dev mode against the freshly migrated e2e database.
- **Design choices the spec left open:** the constraint uses `lower(btrim(col))`, not just `lower(col)`, so a padded address is refused as well. The error text for a collision names the offending values so an operator can act without reading SQL. Rolling back means dropping the four `*_normalized` constraints; the lowercased data stays (the original casing is not recoverable and not worth keeping — ADR 0008).
- **What's deferred:** There is no production data and the dev database had no mixed-case rows, so the backfill's real-world path has only been exercised on the scratch data above. CI's `Integration Tests` job applies the migration to a fresh Postgres 17 for the first time when this branch is pushed. The journey that shows the behavior to a user (I7) is M3.
- **How to run it:** `pnpm --filter @brunchsters/database exec prisma migrate deploy` (applies it to a database), `pnpm --filter @brunchsters/core test:integration` (constraint tests), `pnpm test:e2e` (resets and migrates the e2e database).

---

## M3 — E2E journey I7

- [x] `factories.ts` / `fixtures.ts`: `createUser` takes the address as the provider reports it (capitals allowed) and stores it normalized; `makeActor(label, { providerEmail })` exposes it (the first half was done in M1)
- [x] **I7** — four tests in `same-person.spec.ts`: the same address in two cases through the invite panel is one invite and one working link; both spellings in one wizard submission are one invite; an existing account created from a capitalized provider address is recognized (the brunch is on their dashboard immediately); a repeat suggestion in another case is refused and approving a suggestion for an already-invited address leaves one invite
- [x] Confirm I7 fails without the fix — **3 of the 4 do** (see notes)
- [x] The 34 earlier journeys and the API-authorization tests pass unchanged
- [x] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` pass; stress run; CI-mode run
- [x] Commit: `test: e2e journey for one address, one person (M3)`

**Testing notes:**

- **What was tested:** **Same address, two cases (invite panel):** the host invites `Guest-<s>@Example.COM`, then `guest-<s>@example.com`; afterwards the host's list shows **one** row, Postgres holds **one** invite for that address stored in the canonical lowercase form, the second request rotated the invite's token (the existing "re-invite refreshes it" behavior), the **old link now reads "Invite not found"** and the **current link shows the brunch preview**. **Wizard:** both spellings entered in step 4 of one submission still produce one invite row. **Existing account:** an account created from a Google address reported as `Capital-<s>@Example.COM` (stored lowercase) is invited by the host typing `CAPITAL-<s>@example.com`; the host's list shows it `pending`, the invitee's **dashboard lists the brunch immediately** (the known-user path, with no link opened), the invite carries the account's id, and there is exactly one invite for that address. **Suggestions:** an attendee suggests `Friend-<s>@Example.com` for someone the host already invited in lowercase; suggesting the same person again as `FRIEND-<s>@EXAMPLE.COM` is refused ("Failed to suggest invitee") leaving one suggestion row in Postgres; the host approves the one suggestion and there is still exactly **one invite** for that address.
- **How:** Playwright against real Postgres and a real server, through the UI (the invite panel, the wizard, the suggestion box, the host's Approve button); nothing mocked beyond the Places interception used elsewhere. Suite totals: **69 tests** in dev mode, **207/207** with 4 workers × 3 repeats, **69/69** in CI mode (production build). Unit (shared 7, core 359, web 216) and core integration (88) unchanged. **Proven to fail without the fix:** with normalization removed from the two request schemas and from sign-in **and** the database constraints dropped on the throwaway e2e database (to reproduce the original behavior, not just a different error), 3 of the 4 tests fail — the two-case panel invite, the existing-account recognition, and the suggestion test; the wizard test still passes, honestly, because `sendInvites` already de-duplicated case-insensitively _within one batch_, so that path was never broken and the test is a guard for it rather than evidence for the fix. The code was restored from copies and the e2e database rebuilt (4 constraints present) before anything else ran.
- **Spec correction found while writing this:** the spec said a suggestion for an address "already invited" in another case is treated as the same. The actual (and unchanged) behavior is that suggesting an already-_invited_ address is allowed, and it is approving it that refreshes the existing invite; only a repeat _suggestion_ is refused. The spec text and acceptance criterion now say that, and the e2e test asserts exactly that.
- **What's deferred:** nothing for this spec's scope. Not covered by design (spec "does not cover"): provider-specific aliasing such as Gmail's dots and `+tags`.
- **How to run it:** `pnpm test:e2e`, or `pnpm --filter @brunchsters/web exec playwright test same-person`.

---

## M4 — Docs and wrap-up

- [x] PLANNING §17 entry resolved (marked RESOLVED with links to the spec and ADR; the original finding is kept for the record)
- [x] `CLAUDE.md`: emails are `Email` values made by `normalizeEmail`; never compare raw strings; the database constraints and what they mean for test data
- [x] `docs/SETUP.md`: test data goes through `normalizeEmail`; what a constraint violation looks like; applying a new migration locally
- [x] Mark `spec.md` status Complete (pending merge) and tick its acceptance criteria; update the memory note
- [x] Commit: `docs: close out spec 0007 (M4)`

**Testing notes:**

- **What was verified:** docs only. The whole suite was re-run at the end of M3 and nothing changed since: typecheck and lint clean; unit shared 7, core 359, web 216; core integration 88; e2e 69 in dev mode, 207/207 under stress and 69 in CI mode. Every acceptance criterion in `spec.md` maps to a committed test (see M1–M3) or to the recorded scratch-database verification (M2).
- **Not verified until the branch has a pull request:** CI has not run this branch. `ci.yml` triggers on pull requests to `main` (and on pushes to `main`), so a pushed branch alone does not start it. The risk worth watching is the `Integration Tests` job applying the new migration to a fresh Postgres, and the `E2E Tests` job rebuilding its database with it; both were exercised locally on Supabase's Postgres 17, the same major version CI uses.
- **Stacked on spec 0006:** this branch is built on `feat/0006-e2e-testing-infra` (PR #9) because it needs that branch's e2e suite and fixes. Merge #9 first; then this branch's pull request will contain only spec 0007's commits.
- **What's deferred:** nothing in scope. Out of scope by design: provider-specific aliasing (Gmail dots and `+tags`), internationalized addresses, remembering the casing the user typed.
