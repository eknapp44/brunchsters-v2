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

- [ ] Implement `guards/assertHostOf.ts` → `Result<Brunch, 'brunch_not_found' | 'not_host'>`
- [ ] Implement `guards/assertBrunchActive.ts` → `Result<void, 'brunch_not_active'>` (covers confirmed and cancelled)
- [ ] Unit tests for both guards in isolation
- [ ] Implement `addLocation.ts` — host-only; brunch must be `active`; payload reuses `locationInputSchema` from `createBrunch.ts`
- [ ] Implement `addTime.ts` — same guards; validates a future ISO datetime
- [ ] Implement `removeLocation.ts` / `removeTime.ts` — host-only; soft delete (`deletedAt`/`deletedBy`); reject a confirmed option (`option_confirmed`), the last remaining option of a kind (`last_option`), or an option id belonging to another brunch (`unknown_option`)
- [ ] Export all four + the guards from `packages/core/src/index.ts`
- [ ] Routes: `POST /api/v1/brunches/:id/locations`, `POST .../times`, `DELETE .../locations/:optionId`, `DELETE .../times/:optionId`
- [ ] Unit tests: both kinds, non-host rejected, confirmed brunch rejected, cross-brunch option id rejected, last-option removal rejected, db-error mapping
- [ ] Integration test: a brunch created with one time gains a second (derived mode flips to `group_vote` with no column to update), then one is removed and it flips back
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass
- [ ] Commit: `feat: host can add and remove brunch locations and times (M2)`

**Testing notes:** _(fill on completion)_

---

## M3 — Voting: `canVote`, cast ballot, read model

- [ ] Schema: add `RsvpStatus.canVote Boolean @default(false)`; seed true for `yes` and `maybe`, false for `invited` and `no`; migration + seed update in the same commit
- [ ] Implement `guards/assertCanVote.ts` → `Result<BrunchAttendee, 'not_an_attendee' | 'cannot_vote'>`, reading `RsvpStatus.canVote`; unit tests covering all four statuses
- [ ] Implement `castLocationBallot.ts`:
  - Input `{ brunchId, voterId, optionIds }`; Zod-validated, `optionIds` non-empty (`empty_ballot`)
  - One transaction: run the guards, then delete the voter's vote rows not in the set and insert the ones missing
  - Rejects `brunch_not_found`, `brunch_not_active`, `not_an_attendee`, `cannot_vote`, `voting_closed`, `not_a_vote` (≤ 1 non-deleted option of that kind), `unknown_option` (any id not among this brunch's non-deleted options)
  - Emits `vote/cast` when the voter had no prior rows for this kind, `vote/changed` otherwise — best-effort, never fails the write
- [ ] Implement `castTimeBallot.ts` mirroring it
- [ ] Implement `getBrunchVoting.ts` — one shape for every viewer: per kind, options with vote counts (filtered on each option's `deletedAt`), the viewer's selections, derived mode, derived closed state, `canVote`, `participationRatio`, `eligibleCount`. Per-option `voters?: readonly string[]` populated only when the viewer is the host (PLANNING §17 RSVP visibility rule)
- [ ] Export all three from `packages/core/src/index.ts`
- [ ] Routes: `PUT /api/v1/brunches/:id/votes/locations`, `PUT .../votes/times` — body `{ optionIds: string[] }`
- [ ] Unit tests: replace semantics (adds and removes in one call), idempotent re-send, every rejection above, non-host viewer gets counts without names, host viewer gets names
- [ ] Integration test: two eligible voters cast overlapping ballots and counts are correct; a voter revises their ballot; an option is soft-deleted and its votes vanish from counts; a `maybe` attendee votes successfully while a `no` attendee is rejected; an option id from another brunch is rejected
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass
- [ ] Commit: `feat: approval voting on brunch locations and times (M3)`

**Testing notes:** _(fill on completion)_

---

## M4 — Closing voting

No `...VotePromptedAt` columns and no fire-once guard — the 66% nudge is derived, since v1 cannot deliver the notification it would have guarded (see plan.md). The notifications spec owns that work.

- [ ] Schema: add `Brunch.votingClosedAt DateTime?`; generate and commit the migration
- [ ] Implement `guards/assertVotingOpen.ts` — the derived predicate (`votingClosedAt`, past `votingDeadline`, or `status == confirmed`), callable inside a transaction; unit tests for all three closure paths plus the open case
- [ ] Wire `assertVotingOpen` into both cast-ballot services, evaluated **inside** the transaction
- [ ] Implement `closeVoting.ts` — host-only; sets `votingClosedAt = now`; rejects when already closed (`already_closed`)
- [ ] Implement `updateVotingDeadline.ts` — host-only; accepts a future datetime or `undefined` to clear; rejects once voting is closed. Without this there is no way to set a deadline after creation, since only the wizard sets one today
- [ ] Extend `getBrunchVoting` with `shouldSuggestClosing` = `!closed && eligibleCount >= 3 && participationRatio >= 0.66`, computed per kind
- [ ] Export both services from `packages/core/src/index.ts`
- [ ] Routes: `POST /api/v1/brunches/:id/voting/close`, `PATCH /api/v1/brunches/:id/voting/deadline`
- [ ] Unit tests: close is host-only and rejects double-close; deadline must be future; ballots rejected once closed by manual close and by past deadline; `shouldSuggestClosing` false below 3 eligible, true at the 66% boundary, false once closed
- [ ] Integration test: three eligible attendees, two vote, ratio and nudge correct; ballot after `votingClosedAt` rejected; ballot after a past `votingDeadline` rejected with no `votingClosedAt` set
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass
- [ ] Commit: `feat: close voting, manage the deadline, and derive the close nudge (M4)`

**Testing notes:** _(fill on completion)_

---

## M5 — `confirmBrunch`

- [ ] Schema: partial unique indexes for one confirmed location and one confirmed time per brunch (raw SQL in the migration — Prisma cannot express partial uniques in the schema DSL); document them with a schema comment
- [ ] Implement `confirmBrunch.ts` — host-only, one transaction:
  - Validates `locationId` and `timeId` both belong to this brunch and are not soft-deleted (`unknown_option`)
  - Rejects a brunch that is not `active` (`brunch_not_active` — covers already-confirmed)
  - Rejects a brunch with no locations or no times (`no_locations` / `no_times`)
  - Sets `isConfirmed`/`confirmedAt` on both options, `votingClosedAt` if still null, `status = confirmed`
  - Recomputes `tokenExpiresAt = scheduledAt + 7 days` on every active invite for the brunch (spec 0004's deferred hook)
  - Emits `brunch/confirmed` carrying whether each pick was the vote leader
- [ ] Export from `packages/core/src/index.ts`
- [ ] Route: `POST /api/v1/brunches/:id/confirm` — body `{ locationId, timeId }`
- [ ] Unit tests: host-only, every rejection above, confirming a non-leading option succeeds (host prerogative), `votingClosedAt` preserved when already set
- [ ] Integration test: a full confirm writes all five changes atomically; a second confirm is rejected; the partial unique index rejects a directly-inserted second confirmed location; invite token expiry recomputed and verified against the confirmed `scheduledAt`
- [ ] Update spec 0004's `tasks.md` note that the token-expiry hook is now implemented
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass
- [ ] Commit: `feat: host confirms a brunch, locking location and time (M5)`

**Testing notes:** _(fill on completion)_

---

## M6 — Option suggestions: services

Lands before the UI so M7 can offer "suggest instead" as the answer to an empty ballot, rather than warning with no alternative.

- [ ] Schema: `BrunchOptionSuggestionStatus` lookup (`pending`, `approved`, `declined`), `BrunchLocationSuggestion`, `BrunchTimeSuggestion`, and `Brunch.requireHostApprovalForOptions` (default true); migration + seed entries in the same commit
- [ ] Implement `reviewLocationSuggestion.ts` first (auto-approve calls into it): host-only; rejects a non-`pending` suggestion (`already_reviewed`); approve creates the real option via `addLocation` and sets `approved` + review fields; decline sets `declined` + review fields
- [ ] Implement `suggestLocation.ts`: rejects when `allowLocationSuggestions` is false (`suggestions_disabled`), the suggester is not an attendee (`not_attendee`), or the brunch is not `active`; auto-approves by calling the review service when `requireHostApprovalForOptions` is false, falling back to reporting `pending` if that internal call fails
- [ ] Implement `suggestTime.ts` / `reviewTimeSuggestion.ts` mirroring both
- [ ] Extend `getBrunchVoting` with pending suggestions — the host sees all; an attendee sees only their own
- [ ] Export all four from `packages/core/src/index.ts`
- [ ] Routes: `POST /api/v1/brunches/:id/location-suggestions`, `.../time-suggestions`, `POST /api/v1/location-suggestions/:id/review`, `/time-suggestions/:id/review`
- [ ] Unit tests: both kinds, suggestions disabled, non-attendee rejected, confirmed brunch rejected, host-only review, double-review rejected, auto-approve creates a real option, auto-approve failure still reports pending
- [ ] Integration test: attendee suggests a second time → host approves → it appears on the ballot, the derived mode flips to `group_vote`, and an eligible voter votes for it; a declined suggestion never becomes an option; **a pending suggestion does not affect the derived mode** (the invariant ADR 0006 depends on)
- [ ] Amend PLANNING §6 with `requireHostApprovalForOptions`
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass
- [ ] Commit: `feat: invitees can suggest locations and times, subject to host approval (M6)`

**Testing notes:** _(fill on completion)_

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
