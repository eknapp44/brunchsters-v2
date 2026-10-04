# Tasks 0005 — Voting and Confirmation

Testing notes are filled in as each milestone completes (CLAUDE.md — Testing notes required per milestone).

---

## M1 — ADR 0006 + derive decision type

- [ ] Write `docs/adrs/0006-derive-decision-type.md` (drafted — commit with this milestone)
- [ ] Remove `decisionTypeId` and the `decisionType` relation from `BrunchLocation` and `BrunchTime`; remove the back-relations from `BrunchDecisionType`; add a model comment explaining the table is retained for labels only
- [ ] Generate and commit the migration dropping both columns and their FK constraints
- [ ] Update `createBrunch.ts`: delete both `brunchDecisionType.findFirst` lookups and the `decisionTypeId` assignments; the array-length branch disappears entirely
- [ ] Update `createBrunch.test.ts` / `createBrunch.integration.test.ts` — drop `BrunchDecisionType` fixtures and the two `LookupNotFoundError` cases for it
- [ ] Add `deriveDecisionMode(optionCount): 'host_decides' | 'group_vote'` to `packages/core/src/brunch/optionKind.ts` with unit tests for 0, 1, and 2+ options
- [ ] Amend PLANNING §8 (Location & Time schema) to describe the derivation and reference ADR 0006
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass
- [ ] Commit: `refactor: derive brunch decision type instead of storing it (M1)`

**Testing notes:** _(fill on completion)_

---

## M2 — Ballot management: `addBrunchOption`, `removeBrunchOption`

- [ ] Add `optionKind.ts`: the `OptionKind` discriminated union, payload types per kind, and the Prisma delegate/vote-table selection helper
- [ ] Implement `addBrunchOption.ts` — host-only (`not_host`); rejects a brunch that is not `active` (`brunch_not_active`, covers confirmed and cancelled); location payload reuses `locationInputSchema` from `createBrunch.ts`; time payload validates a future ISO datetime
- [ ] Implement `removeBrunchOption.ts` — host-only; soft delete (`deletedAt`/`deletedBy`); rejects removing a confirmed option (`option_confirmed`) or the last remaining option of a kind (`last_option`); rejects an option id belonging to another brunch (`unknown_option`)
- [ ] Export both from `packages/core/src/index.ts`
- [ ] Routes: `POST /api/v1/brunches/:id/locations`, `POST .../times`, `DELETE .../locations/:optionId`, `DELETE .../times/:optionId`
- [ ] Unit tests: both kinds, non-host rejected, confirmed brunch rejected, cross-brunch option id rejected, last-option removal rejected, db-error mapping
- [ ] Integration test: brunch created with one time gains a second (mode derivation flips to `group_vote` with no column to update), then one is removed and it flips back
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass
- [ ] Commit: `feat: host can add and remove brunch locations and times (M2)`

**Testing notes:** _(fill on completion)_

---

## M3 — Voting: `castBallot`, `getBrunchVoting`

- [ ] Schema: add `RsvpStatus.canVote Boolean @default(false)`; seed it true for `yes` and `maybe`, false for `invited` and `no`; generate and commit the migration with the seed update in the same commit
- [ ] Implement `castBallot.ts`:
  - Input `{ brunchId, voterId, kind, optionIds }`; Zod-validated, `optionIds` non-empty (`empty_ballot`)
  - One transaction: re-read brunch + attendee + options, evaluate every guard, then delete the voter's vote rows not in the set and insert the ones missing
  - Guards: `brunch_not_found`, `brunch_not_active`, `not_an_attendee`, `cannot_vote` (via `RsvpStatus.canVote`), `voting_closed` (derived predicate, evaluated inside the transaction), `not_a_vote` (kind has ≤ 1 non-deleted option), `unknown_option` (any id not in this brunch's non-deleted options)
  - Emits `vote/cast` when the voter had no prior rows for this kind, `vote/changed` otherwise — best-effort, never fails the write
- [ ] Implement `getBrunchVoting.ts` — per kind: options with vote counts (filtered on the option's `deletedAt`), the viewer's own selections, derived mode, derived closed state, `canVote` for the viewer, and voter names **only when the viewer is the host**
- [ ] Export both from `packages/core/src/index.ts`
- [ ] Routes: `PUT /api/v1/brunches/:id/votes/locations`, `PUT .../votes/times` — body `{ optionIds: string[] }`
- [ ] Unit tests: replace semantics (adds and removes in one call), idempotent re-send, every guard above, non-host viewer gets counts without names, host viewer gets names
- [ ] Integration test: two eligible voters cast overlapping ballots and counts are correct; a voter revises their ballot; an option is soft-deleted and its votes vanish from counts; a `maybe` attendee votes successfully while a `no` attendee is rejected; an option id from another brunch is rejected
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass
- [ ] Commit: `feat: approval voting on brunch locations and times (M3)`

**Testing notes:** _(fill on completion)_

---

## M4 — Closing: `closeVoting`, `updateVotingDeadline`, 66% prompt

- [ ] Schema: add `Brunch.votingClosedAt`, `Brunch.locationVotePromptedAt`, `Brunch.timeVotePromptedAt`; generate and commit the migration
- [ ] Implement `closeVoting.ts` — host-only; sets `votingClosedAt = now`; rejects when already closed (`already_closed`)
- [ ] Implement `updateVotingDeadline.ts` — host-only; accepts a future datetime or `undefined` to clear; rejects once voting is closed
- [ ] Add participation math to `castBallot`'s transaction: eligible = non-deleted attendees with `RsvpStatus.canVote` true (host included, `maybe` included); participated = eligible users with ≥ 1 vote row on a non-deleted option of that kind
- [ ] Fire the prompt via a **conditional update** (`WHERE id = ? AND <kind>VotePromptedAt IS NULL`), emitting `vote/autoclose.prompted` only when one row is affected; gated on eligible ≥ 3 and ratio ≥ 0.66
- [ ] Surface `participationRatio` and the prompt state from `getBrunchVoting`
- [ ] Export both services from `packages/core/src/index.ts`
- [ ] Routes: `POST /api/v1/brunches/:id/voting/close`, `PATCH /api/v1/brunches/:id/voting/deadline`
- [ ] Unit tests: close is host-only and rejects double-close; deadline must be future; ballots rejected once closed by deadline and by manual close; threshold does not fire below 3 eligible; fires exactly once at the boundary; does not re-fire when participation drops and re-crosses
- [ ] Integration test: three eligible attendees, two vote, prompt fires once, third votes, no second prompt; ballot after `votingClosedAt` rejected; ballot after a past `votingDeadline` rejected with no `votingClosedAt` set
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass
- [ ] Commit: `feat: close voting, deadline management, and the 66% participation prompt (M4)`

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
  - Emits `brunch/confirmed` with whether each pick was the vote leader
- [ ] Export from `packages/core/src/index.ts`
- [ ] Route: `POST /api/v1/brunches/:id/confirm` — body `{ locationId, timeId }`
- [ ] Unit tests: host-only, every rejection above, confirming a non-leading option succeeds (host prerogative), `votingClosedAt` preserved when already set
- [ ] Integration test: full confirm writes all five changes atomically; a second confirm is rejected; the partial unique index rejects a directly-inserted second confirmed location; invite token expiry recomputed and verified against the confirmed `scheduledAt`
- [ ] Update spec 0004's `tasks.md` note that the token-expiry hook is now implemented
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass
- [ ] Commit: `feat: host confirms a brunch, locking location and time (M5)`

**Testing notes:** _(fill on completion)_

---

## M6 — Voting, closing, and confirm UI

- [ ] Voting panel on `/brunch/[id]`: per-kind checklists with counts, saving the whole ballot on change, optimistic then refetched
- [ ] Read-only ballot for ineligible viewers, with an explanation, and for everyone once voting is closed
- [ ] Unchecking the last option warns that it withdraws the vote; empty ballots are not submitted
- [ ] Host-only: add/remove option controls (Places autocomplete reused from the wizard), close-voting button, deadline editor, the 66% nudge, and voter names on each option
- [ ] Host-only confirm control: options with counts, leader preselected, ties preselecting nothing, one action confirming both kinds
- [ ] Confirmed state: location, time, and ballot read-only; times rendered in the confirmed location's timezone with the PLANNING §9.3 subline when the viewer's zone differs
- [ ] `pnpm typecheck && pnpm lint` pass
- [ ] Two-account browser test per spec.md's UI acceptance criteria
- [ ] Commit: `feat: voting and confirmation UI on the brunch detail page (M6)`

**Testing notes:** _(fill on completion)_

---

## M7 — Option suggestions: services

- [ ] Schema: `BrunchOptionSuggestionStatus` lookup (`pending`, `approved`, `declined`), `BrunchLocationSuggestion`, `BrunchTimeSuggestion`, and `Brunch.requireHostApprovalForOptions` (default true); migration + seed entries in the same commit
- [ ] Implement `reviewBrunchOptionSuggestion.ts` first (auto-approve calls into it): host-only; rejects a non-`pending` suggestion (`already_reviewed`); approve creates the real option via `addBrunchOption` and sets `approved` + review fields; decline sets `declined` + review fields
- [ ] Implement `suggestBrunchOption.ts`: rejects when the kind's `allow...Suggestions` is false (`suggestions_disabled`), the suggester is not an attendee (`not_attendee`), or the brunch is not `active`; auto-approves by calling `reviewBrunchOptionSuggestion` when `requireHostApprovalForOptions` is false, falling back to reporting `pending` if that internal call fails
- [ ] Add pending suggestions to `getBrunchVoting` (host sees all pending; attendees see their own)
- [ ] Export both from `packages/core/src/index.ts`
- [ ] Routes: `POST /api/v1/brunches/:id/option-suggestions`, `POST /api/v1/option-suggestions/:id/review`
- [ ] Unit tests: both kinds, suggestions disabled, non-attendee rejected, confirmed brunch rejected, host-only review, double-review rejected, auto-approve path creates a real option, auto-approve failure still reports pending
- [ ] Integration test: attendee suggests a second time → host approves → it appears on the ballot and the kind's derived mode flips to `group_vote` → an eligible voter votes for it; a declined suggestion never becomes an option; a pending suggestion does **not** affect the derived mode
- [ ] Amend PLANNING §6 with `requireHostApprovalForOptions`
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass
- [ ] Commit: `feat: invitees can suggest locations and times, subject to host approval (M7)`

**Testing notes:** _(fill on completion)_

---

## M8 — Suggestion UI

- [ ] "Suggest a place" / "Suggest a time" controls for attendees when the matching permission is on and the brunch is not confirmed
- [ ] Host-only pending-suggestions list with approve/decline, alongside the existing invite-suggestions list
- [ ] Suggester sees their own pending suggestion with its status
- [ ] `pnpm typecheck && pnpm lint` pass
- [ ] Two-account browser test: second account suggests a time, host approves, it becomes votable, both accounts vote on it
- [ ] Amend PLANNING §10 with this spec's events and mark §16 item 6 complete
- [ ] Commit: `feat: option suggestion UI on the brunch detail page (M8)`

**Testing notes:** _(fill on completion)_
