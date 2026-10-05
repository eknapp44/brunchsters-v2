# Tasks 0005 — Voting and Confirmation

Service and schema work (M1–M6) lands before any UI (M7–M8), so the screens are built once against a complete API. Testing notes are filled in as each milestone completes (CLAUDE.md — Testing notes required per milestone).

---

## M1 — ADR 0006 + derive decision type

Pure refactor, no user-facing change. Merges on its own once green rather than riding along in the full feature PR.

- [x] Commit `docs/adrs/0006-derive-decision-type.md` (already drafted)
- [x] Remove `decisionTypeId` and the `decisionType` relation from `BrunchLocation` and `BrunchTime`; remove the back-relations from `BrunchDecisionType`; add a model comment explaining the table is retained for labels only
- [x] Generate and commit the migration dropping both columns and their FK constraints
- [x] Update `createBrunch.ts`: delete both `brunchDecisionType.findFirst` lookups and the `decisionTypeId` assignments; the array-length branch disappears entirely
- [x] Update `createBrunch.test.ts` / `createBrunch.integration.test.ts` — drop `BrunchDecisionType` fixtures
- [x] Implement `guards/deriveDecisionMode.ts` — the single place allowed to count options, always filtering `deletedAt: null` (ADR 0006's named footgun); unit tests for 0, 1, and 2+ options, plus one asserting the `deletedAt: null` filter is always sent
- [x] Amend PLANNING §8 to describe the derivation and reference ADR 0006
- [x] `pnpm typecheck && pnpm lint && pnpm test` pass
- [x] Commit: `refactor: derive brunch decision type instead of storing it (M1)`

**Testing notes:**

- **What was tested:** `deriveDecisionMode` for 0/1/2+ option counts and that it always sends `deletedAt: null` in its `count()` query (unit, mocked `db.brunchLocation.count`/`db.brunchTime.count` — see note below on why this matters). `createBrunch` continues to create location/time rows correctly with no `decisionTypeId` field at all, locations and times independently, both in isolation (unit) and against real Postgres (integration, post-migration).
- **How:** Unit (`deriveDecisionMode.test.ts`, 5 tests; rewritten `createBrunch.test.ts`, 16 tests) + integration against local Supabase Postgres (`createBrunch.integration.test.ts`, 7 tests, run after applying the migration and reseeding). No mocks needed for the integration pass — real transaction, real constraints.
- **Correction to this milestone's original task list:** the "drop its two `LookupNotFoundError` cases for it" bullet assumed tests existed asserting `lookup_not_found` when `BrunchDecisionType` rows were missing. Checking the actual pre-M1 test file, no such cases existed — only `BrunchStatus:draft` was tested that way. Nothing was removed on that front because there was nothing to remove; noting this so the task list doesn't misrepresent what changed.
- **What's deferred:** `deriveDecisionMode`'s soft-delete exclusion is only verified at the unit level (asserting the `where` clause shape sent to `count()`), not by seeding a real soft-deleted option against Postgres and confirming it's excluded from the count. That real-data case is covered by M2's integration test instead ("a brunch created with one time gains a second... then one is removed and [the mode] flips back"), since M1 has no service yet that creates more than one option after the fact — `createBrunch` only ever inserts, never soft-deletes.
- **How to run it:** `pnpm typecheck && pnpm lint && pnpm test` from repo root (unit only); `pnpm --filter @brunchsters/core test:integration` for the integration suite (requires local Supabase running — `npx supabase start` from `packages/database`, port 54322).
- **Infra note for future milestones:** local Supabase was down for a month between sessions. Docker Desktop restart alone didn't free port 54322 — it was stuck in a Windows Hyper-V/WSL TCP port-exclusion range (visible via `netsh interface ipv4 show excludedportrange protocol=tcp`). Fixed by restarting the `winnat` service as admin (`net stop winnat && net start winnat`). Also: this environment's non-interactive shell can't run `prisma migrate dev` at all (Prisma refuses outright on a non-interactive TTY, even with `--create-only`). The workaround used here and worth reusing for M3–M6's migrations: `prisma migrate diff --from-url <DATABASE_URL> --to-schema-datamodel prisma/schema.prisma --script` to generate the SQL, hand-create the timestamped migration folder, then `prisma migrate deploy` to apply (that command is explicitly built for non-interactive use).

---

## M2 — Shared guards + add/remove options

- [x] Implement `guards/assertHostOf.ts` → `Result<Brunch, 'brunch_not_found' | 'not_host'>`
- [x] Implement `guards/assertBrunchActive.ts` → `Result<void, 'brunch_not_active'>` (covers confirmed and cancelled)
- [x] Unit tests for both guards in isolation
- [x] Implement `addLocation.ts` — host-only; brunch must be `active`; payload reuses `locationInputSchema` from `createBrunch.ts`
- [x] Implement `addTime.ts` — same guards; validates a future ISO datetime
- [x] Implement `removeLocation.ts` / `removeTime.ts` — host-only; soft delete (`deletedAt`/`deletedBy`); reject a confirmed option (`option_confirmed`), the last remaining option of a kind (`last_option`), or an option id belonging to another brunch (`unknown_option`)
- [x] Export all four + the guards from `packages/core/src/index.ts`
- [x] Routes: `POST /api/v1/brunches/:id/locations`, `POST .../times`, `DELETE .../locations/:optionId`, `DELETE .../times/:optionId`
- [x] Unit tests: both kinds, non-host rejected, confirmed brunch rejected, cross-brunch option id rejected, last-option removal rejected, db-error mapping
- [x] Integration test: a brunch created with one time gains a second (derived mode flips to `group_vote` with no column to update), then one is removed and it flips back
- [x] `pnpm typecheck && pnpm lint && pnpm test` pass
- [x] Commit: `feat: host can add and remove brunch locations and times (M2)`

**Testing notes:**

- **What was tested:** Both guards in isolation (`assertHostOf`: found/not-found/wrong-host; `assertBrunchActive`: active/draft/confirmed/cancelled). All four services' happy paths, host-only enforcement, every non-active status (draft, confirmed, cancelled covered across the four files), db-error mapping on the write call. `removeLocation`/`removeTime` additionally: unknown option id, cross-brunch option id (scoped query returns null either way — same `unknown_option` outcome, confirmed explicitly), confirmed-option rejection, last-option rejection, and that the sibling `count()` always sends `deletedAt: null` (ADR 0006's footgun, same pattern as `deriveDecisionMode`'s own test). All four route handlers: auth, malformed id, body validation (locations: bad timezone; times: past datetime), every service error mapped to its HTTP status, success shape.
- **How:** Unit — 4 new service files + 2 guards + their routes, all mocked at the `db` call boundary (not module-mocking the guards themselves, consistent with the rest of the codebase). 70 new unit tests across core and web. Integration (`optionManagement.integration.test.ts`, 6 tests) against real Postgres: the mode flip for both kinds independently, last-option rejection, confirmed-option rejection (confirmed set via a direct `db.update`, since no confirm service exists until M5), cross-brunch rejection, and that a soft-deleted option actually disappears from `deriveDecisionMode`'s count (not just that the query was shaped right — this is the one case M1's testing notes deferred to M2).
- **Bug caught by the integration suite that the unit tests couldn't catch:** `createBrunch` leaves a brunch in `draft` — it only moves to `active` when `sendInvites` runs (spec 0004). Every unit test mocks `db.brunch.findFirst` to return `status: { code: 'active' }` directly, so this never surfaces there. The first integration run failed all 6 tests with `brunch_not_active` because the test brunches were still `draft`. Fixed by having the integration test's `createTestBrunch` helper activate the brunch via a direct `db.brunch.update` after creation — a deliberate test-only shortcut around the real activation path (sending a real invite), since what's under test here is option management, not invitations.
- **What's deferred:** No test exercises `addLocation`/`addTime` against a `draft` brunch through the real activation path (i.e., via `sendInvites`) — only via the shortcut above. That full chain (create → invite → add option) is exactly the kind of multi-step flow the browser test in M7/M8 and the E2E proposal in PLANNING's Still Open section are meant to cover, not a unit or isolated integration test.
- **How to run it:** `pnpm typecheck && pnpm lint && pnpm test` from repo root (unit only); `pnpm --filter @brunchsters/core test:integration` for the integration suite (local Supabase must be running).
- **No migration this milestone** — M2 adds no schema, only services/routes. The next migration is M3's `RsvpStatus.canVote`.

**Testing notes:** _(fill on completion)_

---

## M3 — Voting: `canVote`, cast ballot, read model

- [x] Schema: add `RsvpStatus.canVote Boolean @default(false)`; seed true for `yes` and `maybe`, false for `invited` and `no`; migration + seed update in the same commit
- [x] Implement `guards/assertCanVote.ts` → `Result<BrunchAttendee, 'not_an_attendee' | 'cannot_vote'>`, reading `RsvpStatus.canVote`; unit tests covering all four statuses
- [x] Implement `castLocationBallot.ts`:
  - Input `{ brunchId, voterId, optionIds }`; Zod-validated, `optionIds` non-empty (`empty_ballot`)
  - One transaction: run the guards, then delete the voter's vote rows not in the set and insert the ones missing
  - Rejects `brunch_not_found`, `brunch_not_active`, `not_an_attendee`, `cannot_vote`, `voting_closed`, `not_a_vote` (≤ 1 non-deleted option of that kind), `unknown_option` (any id not among this brunch's non-deleted options)
  - Emits `vote/cast` when the voter had no prior rows for this kind, `vote/changed` otherwise — best-effort, never fails the write
- [x] Implement `castTimeBallot.ts` mirroring it
- [x] Implement `getBrunchVoting.ts` — one shape for every viewer: per kind, options with vote counts (filtered on each option's `deletedAt`), the viewer's selections, derived mode, derived closed state, `canVote`, `participationRatio`, `eligibleCount`. Per-option `voters?: readonly string[]` populated only when the viewer is the host (PLANNING §17 RSVP visibility rule)
- [x] Export all three from `packages/core/src/index.ts`
- [x] Routes: `PUT /api/v1/brunches/:id/votes/locations`, `PUT .../votes/times` — body `{ optionIds: string[] }`
- [x] Unit tests: replace semantics (adds and removes in one call), idempotent re-send, every rejection above, non-host viewer gets counts without names, host viewer gets names
- [x] Integration test: two eligible voters cast overlapping ballots and counts are correct; a voter revises their ballot; an option is soft-deleted and its votes vanish from counts; a `maybe` attendee votes successfully while a `no` attendee is rejected; an option id from another brunch is rejected
- [x] `pnpm typecheck && pnpm lint && pnpm test` pass
- [x] Commit: `feat: approval voting on brunch locations and times (M3)`

**Testing notes:**

- **Real bug found and fixed before any of this milestone's own code could run:** `packages/database/src/middleware.ts`'s soft-delete extension listed `BrunchLocationVote` and `BrunchTimeVote` in `SOFT_DELETE_MODELS`, but neither table has a `deletedAt` column — it was never added, because votes are replaced via hard delete + insert (there's nothing to soft-delete). Any `findMany`/`findFirst` against either table threw `PrismaClientValidationError: Unknown argument deletedAt`. Nothing had ever queried these tables directly before this milestone (spec 0001 only created them), so the bug was latent since the original scaffold. Verified by direct reproduction against the live DB, then fixed by removing both models from the set, with a comment explaining why they don't belong there. No test suite caught this because nothing exercised the tables — the fix is covered going forward by every integration test in this milestone, since `castLocationBallot`/`castTimeBallot`/`getBrunchVoting` all query them now.
- **What was tested:** `assertCanVote` for all four RSVP statuses. Both cast-ballot services: insert-only (first vote), replace semantics (add and remove in one call), idempotent re-send, every rejection kind (`brunch_not_found`, `brunch_not_active`, `empty_ballot`, `not_an_attendee`, `cannot_vote`, `voting_closed` via both a past deadline and a confirmed brunch, `not_a_vote`, `unknown_option`), db-error mapping, event-emit-failure-still-Ok, and `vote/cast` vs `vote/changed` naming. `getBrunchVoting`: access scoping (host-or-attendee only, mirroring `getBrunchById`), `canVote` derivation, per-option `voteCount`/`viewerVoted`, voter names visible only to the host, derived mode and closed state, and `participationRatio`/`eligibleCount` including the case where a vote exists from a user no longer in the eligible set. Both routes: auth, malformed id, empty-array validation, every error-to-status mapping, success shape.
- **How:** Unit — 3 new service/guard files + 2 routes, 91 new unit tests (`castLocationBallot.test.ts` 18, `castTimeBallot.test.ts` 17, `getBrunchVoting.test.ts` 12, `assertCanVote.test.ts` 5, plus the two route test files), all mocked at the `db` call boundary. Integration (`voting.integration.test.ts`, 5 tests) against real Postgres, using the real activation path this time — `sendInvites` + `respondToInvite`, not the M2 test-only status shortcut — since a believable yes/maybe/no attendee mix needs the real RSVP flow anyway. Each test builds its own brunch via a `createVotableBrunch` helper rather than sharing mutated state across tests in declaration order, matching the existing `createTestBrunch` convention in the other integration files.
- **A design choice this milestone had to make that the spec didn't fully pin down:** the order of guard checks inside both cast-ballot services. Settled on brunch existence → brunch active → empty ballot → attendee/eligibility → voting closed → vote-exists (mode) → option validity. Not specified anywhere, and only observable when a request fails more than one check at once; recorded here so M4 (which inserts `assertVotingOpen` into this sequence) doesn't have to rediscover it.
- **What's deferred:** The `voting_closed` check (inline `isVotingClosed` in both services, explicitly commented as an M4 placeholder) runs **before** the transaction opens, not inside it. The spec's stated goal — "a ballot submitted a millisecond after the host closes voting must lose" — isn't met yet; a close racing a vote could still let the vote through. This is intentional and expected: M4 formally wires `guards/assertVotingOpen.ts` into both services' transactions, which is the point where this gets fixed, not before. No test asserts the race is closed, since M3 doesn't claim to close it.
- **How to run it:** `pnpm typecheck && pnpm lint && pnpm test` from repo root (unit only); `pnpm --filter @brunchsters/core test:integration` for the integration suite (local Supabase must be running, same port-exclusion caveat logged in M1's notes if it's been a while since the DB last ran).

---

## M4 — Closing voting

No `...VotePromptedAt` columns and no fire-once guard — the 66% nudge is derived, since v1 cannot deliver the notification it would have guarded (see plan.md). The notifications spec owns that work.

- [x] Schema: add `Brunch.votingClosedAt DateTime?`; generate and commit the migration
- [x] Implement `guards/assertVotingOpen.ts` — the derived predicate (`votingClosedAt`, past `votingDeadline`, or `status == confirmed`), callable inside a transaction; unit tests for all three closure paths plus the open case
- [x] Wire `assertVotingOpen` into both cast-ballot services, evaluated **inside** the transaction
- [x] Implement `closeVoting.ts` — host-only; sets `votingClosedAt = now`; rejects when already closed (`already_closed`)
- [x] Implement `updateVotingDeadline.ts` — host-only; accepts a future datetime or `undefined` to clear; rejects once voting is closed. Without this there is no way to set a deadline after creation, since only the wizard sets one today
- [x] Extend `getBrunchVoting` with `shouldSuggestClosing` = `!closed && eligibleCount >= 3 && participationRatio >= 0.66`, computed per kind
- [x] Export both services from `packages/core/src/index.ts`
- [x] Routes: `POST /api/v1/brunches/:id/voting/close`, `PATCH /api/v1/brunches/:id/voting/deadline`
- [x] Unit tests: close is host-only and rejects double-close; deadline must be future; ballots rejected once closed by manual close and by past deadline; `shouldSuggestClosing` false below 3 eligible, true at the 66% boundary, false once closed
- [x] Integration test: three eligible attendees, two vote, ratio and nudge correct; ballot after `votingClosedAt` rejected; ballot after a past `votingDeadline` rejected with no `votingClosedAt` set
- [x] `pnpm typecheck && pnpm lint && pnpm test` pass
- [x] Commit: `feat: close voting, manage the deadline, and derive the close nudge (M4)`

**Testing notes:**

- **What was tested:** `assertVotingOpen`/`isVotingClosed` for all three closure paths (`votingClosedAt`, past `votingDeadline`, confirmed status) plus the open case. `closeVoting`: host-only, double-close rejected, and — reusing the full derived predicate rather than just the raw column — closing a brunch already closed by a past deadline or by confirmation is also rejected as `already_closed`, not treated as a fresh close. `updateVotingDeadline`: host-only, future-only validated at the Zod boundary (not in the service itself), clearing via `undefined`, rejected once closed. Both cast-ballot services: the manual-close and past-deadline paths now resolve via a **fresh re-fetch inside the transaction**, not the pre-transaction brunch object. `getBrunchVoting`'s `shouldSuggestClosing`: fires at exactly 2/3 with 3+ eligible, never below 3 eligible regardless of participation, never below the 66% threshold, and never once already closed.
- **The actual race-closing test** — the one this milestone exists for: `castLocationBallot`/`castTimeBallot` unit tests now include "closes the race: a close that lands between the pre-transaction check and the write still loses the vote," where the pre-transaction mock returns an open brunch and only the transaction-scoped re-fetch (`tx.brunch.findFirst`) returns a closed one. Before this milestone's restructuring, that scenario couldn't be expressed at all — the old inline check ran once, before the transaction, with no second look. Integration-level, the same shape is covered by `closingVoting.integration.test.ts`'s manual-close and past-deadline cases against real Postgres, though a true concurrent race (two overlapping transactions) isn't simulated — that would need two real concurrent connections mid-transaction, which is a meaningfully different and more expensive test to write; the single-fetch-vs-fresh-fetch unit test is what actually proves the fix.
- **A test-fidelity bug caught and fixed along the way, not a production bug:** `getBrunchVoting.test.ts`'s mock brunch objects omitted `votingClosedAt` entirely (`undefined`, not `null`). `isVotingClosed` checks `votingClosedAt !== null`, and `undefined !== null` is `true` in JS — so every mock brunch was silently evaluating as "closed," and no existing assertion caught it because nothing asserted `closed === false` for the default open case. Fixed by giving every mock brunch an explicit `votingClosedAt: null` (matching what a real Prisma row always returns — never `undefined`) and adding an explicit "is open by default" test. This was a gap in test fidelity, not in the shipped code; the real Prisma client never returns `undefined` for a nullable column.
- **How:** Unit — `assertVotingOpen.test.ts` (5), `closeVoting.test.ts` (7), `updateVotingDeadline.test.ts` (10), plus restructured tests in `castLocationBallot.test.ts` and `castTimeBallot.test.ts` (both mock `tx` now includes `brunch.findFirst`, separately overridable from the pre-transaction `db.brunch.findFirst`) and new `shouldSuggestClosing` coverage in `getBrunchVoting.test.ts`, plus the two new route test files. Integration (`closingVoting.integration.test.ts`, 5 tests) against real Postgres, following the same `createThreeEligibleBrunch` real-activation-path convention as M3's `voting.integration.test.ts` (host + 2 yes-voters = 3 eligible, since the host counts toward eligibility per plan.md).
- **What's deferred:** No test simulates two genuinely concurrent transactions racing against the same brunch (one closing, one voting, overlapping in time) — see above. `confirmBrunch` (M5) is the other path that sets `votingClosedAt`; this milestone's tests only exercise `closeVoting` setting it directly.
- **How to run it:** `pnpm typecheck && pnpm lint && pnpm test` from repo root (unit only); `pnpm --filter @brunchsters/core test:integration` for the integration suite (local Supabase must be running).

---

## M5 — `confirmBrunch`

- [x] Schema: partial unique indexes for one confirmed location and one confirmed time per brunch (raw SQL in the migration — Prisma cannot express partial uniques in the schema DSL); document them with a schema comment
- [x] Implement `confirmBrunch.ts` — host-only, one transaction:
  - Validates `locationId` and `timeId` both belong to this brunch and are not soft-deleted (`unknown_option`)
  - Rejects a brunch that is not `active` (`brunch_not_active` — covers already-confirmed)
  - Rejects a brunch with no locations or no times (`no_locations` / `no_times`)
  - Sets `isConfirmed`/`confirmedAt` on both options, `votingClosedAt` if still null, `status = confirmed`
  - Recomputes `tokenExpiresAt = scheduledAt + 7 days` on every active invite for the brunch (spec 0004's deferred hook)
  - Emits `brunch/confirmed` carrying whether each pick was the vote leader
- [x] Export from `packages/core/src/index.ts`
- [x] Route: `POST /api/v1/brunches/:id/confirm` — body `{ locationId, timeId }`
- [x] Unit tests: host-only, every rejection above, confirming a non-leading option succeeds (host prerogative), `votingClosedAt` preserved when already set
- [x] Integration test: a full confirm writes all five changes atomically; a second confirm is rejected; the partial unique index rejects a directly-inserted second confirmed location; invite token expiry recomputed and verified against the confirmed `scheduledAt`
- [x] Update spec 0004's `tasks.md` note that the token-expiry hook is now implemented
- [x] `pnpm typecheck && pnpm lint && pnpm test` pass
- [x] Commit: `feat: host confirms a brunch, locking location and time (M5)`

**Testing notes:**

- **What was tested:** Host-only enforcement; every rejection path (`brunch_not_found`, `brunch_not_active` including already-confirmed, `no_locations`, `no_times`, `unknown_option` for both ids independently); confirming a non-leading option succeeds and reports `locationWasVoteLeader: false` on the emitted event rather than being blocked (host prerogative, not an error); `votingClosedAt` set when null and preserved untouched when already set by an earlier `closeVoting` call; `tokenExpiresAt` recomputed on every invite except the host's own synthetic one (identified the same way `getInvitesForBrunch` already does — matching `invitedEmail` against the host's, case-insensitive); db-error and `lookup_not_found` mapping; event-emit-failure-still-Ok.
- **The one test that actually proves the schema constraint, not just the service's promise:** `confirmBrunch.integration.test.ts`'s partial-index test bypasses `confirmBrunch` entirely and does two raw `db.brunchLocation.update({ data: { isConfirmed: true } })` calls directly against the same brunch, asserting the second one throws. `confirmBrunch` itself can never produce two confirmed options (it only ever sets one per call, on an `active` brunch it immediately moves to `confirmed`), so a test that only called the service would never exercise the index at all — it would pass whether or not the index existed. This is the belt-and-braces the plan called for, verified by actually trying to defeat the belt.
- **How:** Unit (`confirmBrunch.test.ts`, 15 tests) mocked at the `db`/`tx` boundary, following the same mock-tx-separately-from-mock-db shape established in M3/M4. Integration (`confirmBrunch.integration.test.ts`, 4 tests) against real Postgres: a full confirm's five writes verified individually (location, time, brunch status, `votingClosedAt`, invite `tokenExpiresAt`), a rejected double-confirm, the partial-index bypass test above, and confirming while an unrelated option still holds a vote (proving a vote on the non-chosen option doesn't block confirming the other).
- **What's deferred:** No test exercises two `confirmBrunch` calls racing concurrently. Worked through on paper rather than left unexamined: unlike M4's vote/close race, this one is already closed by the partial unique index itself, not by anything application-level. `assertBrunchActive`'s pre-transaction check isn't re-fetched inside the transaction the way M4 made the cast-ballot services do for `assertVotingOpen` — so two concurrent calls could both pass that check before either commits — but the index is keyed on `brunchId` alone (not `brunchId + locationId`), so a second transaction setting `isConfirmed` on _any_ location row for the same brunch, even a different one than the first call chose, collides with the same constraint and fails at the database. Data integrity holds either way; the only real gap is that the loser gets a generic `db_error` instead of a clean `brunch_not_active`. That's a minor error-message quality issue, not a correctness one, and not worth the cost of a re-fetch-inside-transaction restructure for an action only the host ever takes, alone, once.
- **How to run it:** `pnpm typecheck && pnpm lint && pnpm test` from repo root (unit only); `pnpm --filter @brunchsters/core test:integration` for the integration suite (local Supabase must be running).

### Post-M5 sanity check (2026-10-05)

With M1–M5 all green, did a pass against `spec.md`'s own Acceptance Criteria (which hadn't been checked off at all up to this point — only this file's per-milestone boxes had). Found one real gap: `spec.md`'s Services section explicitly calls for an integration test covering "full add-options → vote → change vote → close → confirm lifecycle," and no existing file did that — `optionManagement`, `voting`, `closingVoting`, and `confirmBrunch`'s integration tests each cover their own milestone's slice against their own fixtures, never chained together. Added `fullVotingLifecycle.integration.test.ts`: one brunch, carried through add-a-second-time (mode flips to `group_vote`), two votes, a revised vote, a manual close (and a ballot rejected after), and a confirm of the tied, non-first option (host prerogative) — with a final rejected re-confirm. 1 test, passes against real Postgres. `spec.md`'s checklist is now checked off for everything M1–M5 actually shipped; items still belonging to M6 are left unchecked there with an `**M6**` note rather than silently appearing done.

---

## M6 — Option suggestions: services

Lands before the UI so M7 can offer "suggest instead" as the answer to an empty ballot, rather than warning with no alternative.

- [x] Schema: `BrunchOptionSuggestionStatus` lookup (`pending`, `approved`, `declined`), `BrunchLocationSuggestion`, `BrunchTimeSuggestion`, and `Brunch.requireHostApprovalForOptions` (default true); migration + seed entries in the same commit
- [x] Implement `reviewLocationSuggestion.ts` first (auto-approve calls into it): host-only; rejects a non-`pending` suggestion (`already_reviewed`); approve creates the real option via `addLocation` and sets `approved` + review fields; decline sets `declined` + review fields
- [x] Implement `suggestLocation.ts`: rejects when `allowLocationSuggestions` is false (`suggestions_disabled`), the suggester is not an attendee (`not_attendee`), or the brunch is not `active`; auto-approves by calling the review service when `requireHostApprovalForOptions` is false, falling back to reporting `pending` if that internal call fails
- [x] Implement `suggestTime.ts` / `reviewTimeSuggestion.ts` mirroring both
- [x] Extend `getBrunchVoting` with pending suggestions — the host sees all; an attendee sees only their own
- [x] Export all four from `packages/core/src/index.ts`
- [x] Routes: `POST /api/v1/brunches/:id/location-suggestions`, `.../time-suggestions`, `POST /api/v1/location-suggestions/:id/review`, `/time-suggestions/:id/review`
- [x] Unit tests: both kinds, suggestions disabled, non-attendee rejected, confirmed brunch rejected, host-only review, double-review rejected, auto-approve creates a real option, auto-approve failure still reports pending
- [x] Integration test: attendee suggests a second time → host approves → it appears on the ballot, the derived mode flips to `group_vote`, and an eligible voter votes for it; a declined suggestion never becomes an option; **a pending suggestion does not affect the derived mode** (the invariant ADR 0006 depends on)
- [x] Amend PLANNING §6 with `requireHostApprovalForOptions`
- [x] `pnpm typecheck && pnpm lint && pnpm test` pass
- [x] Commit: `feat: invitees can suggest locations and times, subject to host approval (M6)`

**Testing notes:**

- **What was tested:** Both kinds, symmetrically. `suggestLocation`/`suggestTime`: pending-by-default, auto-approve when host approval isn't required (and the pending-fallback when that internal auto-approve call fails), host-can-suggest-without-an-attendee-row, every rejection (`brunch_not_found`, `suggestions_disabled`, `brunch_not_active`, `not_attendee`, `already_suggested`, `lookup_not_found`, `db_error`). `reviewLocationSuggestion`/`reviewTimeSuggestion`: approve creates the real option and marks approved, decline creates nothing and marks declined, `not_host`, `already_reviewed`, `suggestion_not_found`, and — the one that actually matters — approve failing mid-transaction leaves the suggestion untouched at `pending` (not left in a half-approved state). `getBrunchVoting`'s pending-suggestions extension: host sees every pending suggestion, a non-host sees only their own (verified via the exact `where` clause sent, not just the returned shape), and `suggestedByViewer` is set correctly.
- **A real design question resolved while writing this milestone, not foreseen by the task list:** who does an approved suggestion get attributed to — the suggester, or the host who approved it? Checked the actual precedent instead of guessing: `reviewInviteSuggestion.ts` sets the resulting invite's `invitedById` to the **host**, not the suggester, because sending an invite is a host action even when the idea came from someone else. Followed the same rule here — an approved location/time's `proposedById` is the host's, matching `addLocation`'s own host-only guard. Confirmed explicitly in `optionSuggestions.integration.test.ts`.
- **A real bug caught by the first test run, not by typecheck:** `reviewLocationSuggestion`/`reviewTimeSuggestion` originally looked up the target status row (`approved`/`declined`) **inside** the transaction via `tx`, copying the shape of M4's `assertVotingOpen` re-fetch pattern on reflex. But `reviewInviteSuggestion.ts` — the actual precedent for _this_ operation — fetches that lookup via `db`, before the transaction opens, with a plain early return rather than a thrown `LookupNotFoundError`. The mismatch only surfaced at runtime (`tx.brunchOptionSuggestionStatus` is `undefined` in a transaction mock that doesn't declare it) — `tsc` can't catch a missing property on a mock that's force-cast to `DbClient`. Fixed by moving the lookup back out to `db`, matching `reviewInviteSuggestion.ts` exactly, which also deleted the now-unneeded `LookupNotFoundError` import and the pattern-match catch clause in both files.
- **How:** Unit — 4 new services + `getBrunchVoting`'s extension, 49 new unit tests (`suggestLocation.test.ts` 11, `suggestTime.test.ts` 13, `reviewLocationSuggestion.test.ts` 7, `reviewTimeSuggestion.test.ts` 7, `getBrunchVoting.test.ts` gained 3), plus 4 route files with their tests. Mocking followed the two _specific_ precedents this exact shape already has in the codebase rather than this spec's usual "mock at the db boundary" convention: `suggestLocation.test.ts`/`suggestTime.test.ts` module-mock `reviewLocationSuggestion`/`reviewTimeSuggestion` (matching `suggestInvitee.test.ts`'s mock of `reviewInviteSuggestion`), and `reviewLocationSuggestion.test.ts`/`reviewTimeSuggestion.test.ts` module-mock `addLocationInTransaction`/`addTimeInTransaction` (matching `reviewInviteSuggestion.test.ts`'s mock of `sendInvitesInTransaction`). Integration (`optionSuggestions.integration.test.ts`, 3 tests) against real Postgres: pending-does-not-flip-mode, approve-flips-mode-and-becomes-votable-and-accepts-a-real-vote, decline-never-creates-a-row.
- **A refactor this milestone required, done the same way M1 did it for `deriveDecisionMode`:** `addLocation.ts`/`addTime.ts` each gained an exported `addLocationInTransaction`/`addTimeInTransaction` — the raw create with no guards, callable with either a plain `DbClient` (the existing `addLocation`/`addTime`, which need no transaction for a single insert) or a transaction client (the review services, which need the create and the suggestion's status update to commit atomically). Same `Parameters<Parameters<DbClient['$transaction']>[0]>[0]` derivation `sendInvitesInTransaction` already uses. Existing `addLocation.test.ts`/`addTime.test.ts` needed no changes — the underlying `db.brunchLocation.create`/`db.brunchTime.create` call shape is unchanged, only its caller moved one level deeper.
- **What's deferred:** No test exercises suggesting while the brunch has zero existing options of that kind (suggesting a location on a times-only brunch) — not explicitly called for by the spec, and the suggest services don't special-case it; an approved suggestion there would just become the brunch's first option of that kind, which is the same as `addLocation`'s own first-option behavior.
- **How to run it:** `pnpm typecheck && pnpm lint && pnpm test` from repo root (unit only); `pnpm --filter @brunchsters/core test:integration` for the integration suite (local Supabase must be running).

---

## M7 — `/brunch/[id]` — the shared view

Components colocated beside the page, following the established `InvitePanel` / `RsvpControl` / `SuggestionsPanel` pattern; `page.tsx` stays a thin server component that composes them.

- [ ] `BallotChecklist.tsx` — per-kind checklist with vote counts; saves the whole ballot on change, then refetches
- [ ] Read-only ballot with an explanation for `invited`/`no` viewers, and for everyone once voting is closed
- [ ] Unchecking the last option explains that it withdraws the vote and points at the suggestion control; an empty ballot is never submitted
- [ ] `OptionSuggestionControl.tsx` — suggest a place or time when permitted; shows the suggester their own pending suggestions and statuses
- [ ] Times carry the location-zone subline whenever any candidate location's zone differs from the viewer's — during voting, not just after confirmation, so confirmation does not silently rewrite every displayed time (PLANNING §9.3)
- [ ] Host sees per-option voter names; everyone else sees counts only
- [ ] Confirmed state: location, time, and ballot read-only; the RSVP control stays live (RSVP does not lock — PLANNING §5 as amended)
- [ ] Link to `/brunch/[id]/manage`, host-only
- [ ] `pnpm typecheck && pnpm lint` pass
- [ ] Browser test with two accounts: host creates a brunch with two times and invites; second account RSVPs `maybe`, votes, revises, then empties its ballot and is steered to suggest a time
- [ ] Commit: `feat: ballot and suggestion UI on the brunch detail page (M7)`

**Testing notes:** _(fill on completion)_

---

## M8 — `/brunch/[id]/manage` — the host's workbench

- [ ] Extract `PlaceSearchInput.tsx` from `brunch/new/page.tsx`'s `StepTwo` and repoint the wizard at it — **its own commit**, since it edits already-shipped wizard code; wizard behavior must be unchanged
- [ ] New host-only route at `manage/page.tsx`; non-hosts get `notFound()`
- [ ] `OptionManager.tsx` — add/remove locations and times with vote counts, using the extracted `PlaceSearchInput`
- [ ] `VotingControls.tsx` — deadline editor, close-voting button, and the derived 66% nudge from `shouldSuggestClosing`
- [ ] `ConfirmControl.tsx` — options with counts, leader preselected, ties preselecting nothing, one action confirming both kinds; warns (does not block) when nobody but the host has accepted
- [ ] `OptionSuggestionReview.tsx` — pending location and time suggestions with approve/decline
- [ ] Read-only summary once the brunch is confirmed; management controls gone
- [ ] `pnpm typecheck && pnpm lint` pass
- [ ] Full two-account browser test per spec.md: host creates a brunch with two times, invites, second account RSVPs `maybe` and votes, host sees the count on manage, second account suggests a third time, host approves, both vote on it, host closes voting and confirms, both sessions show the locked brunch with consistent times
- [ ] Amend PLANNING §7 (`vote.autoclose.prompted` derived in v1), §10 (this spec's events), and mark §16 item 6 complete
- [ ] Commit: `feat: host manage route with option, voting, and confirm controls (M8)`

**Testing notes:** _(fill on completion)_
