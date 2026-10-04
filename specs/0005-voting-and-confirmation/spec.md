# Spec 0005 — Voting and Confirmation

**Status:** Draft  
**Branch:** `feat/0005-voting-and-confirmation`  
**PLANNING.md ref:** §5 Host Journey / Confirmation Lock Rules / Edge Cases / Minimum Brunch Size, §6 Permissions Model, §7 Notifications, §8 Location & Time / Votes schema, §9.3 Timezone display, §9.7 Voting Close Rule, §10 Async Event Architecture, §16 Build Order item 6  
**ADRs:** [0006 — Derive decision type instead of storing it](../../docs/adrs/0006-derive-decision-type.md)

---

## What

Close out the core brunch flow (PLANNING §16 item 6) by building its last two stages: **vote** and **confirm**. Today a brunch can be created with several candidate locations and times and people can be invited to it, but nobody can express a preference and the host has no way to lock anything in. A brunch created with two times is permanently stuck showing two times.

This spec delivers:

- **Managing the ballot** — the host can add and remove locations and times after creation. Today options can only be set in the create wizard, which means a brunch created without a time can never be confirmed at all.
- **Voting** — attendees who are actually coming pick the options that work for them, approval-style (check every option you can make, not a single choice). Votes are changeable until voting closes.
- **Closing** — voting ends at `Brunch.votingDeadline`, or when the host closes it early. When enough people have voted, the host gets nudged that they can close early.
- **Confirming** — the host locks exactly one location and one time, the brunch moves to `confirmed`, and the confirmation lock rules in PLANNING §5 take effect.
- **Suggesting options** — invitees can propose a location or time, subject to host approval, mirroring the invite-suggestion flow built in spec 0004.

Two pieces of infrastructure this depends on do not exist yet and are explicitly not built here. **Notifications** (`vote.cast`, `vote.autoclose.prompted`, `brunch.confirmed`, `location.suggested`, `time.suggested`) fire into the same no-op `EventBus` as every event since spec 0003; they start delivering when the Inngest spec ships a real implementation. **Supabase Realtime** is unbuilt, so vote counts do not live-update — the UI refetches after each action. Neither swap requires touching this spec's code.

Because there is no scheduler, "voting is closed" is a **derived predicate evaluated on every read and every write**, not a flag some job flips at the deadline:

```
closed = votingClosedAt != null
      || (votingDeadline != null && now > votingDeadline)
      || status == confirmed
```

### Decisions carried into this spec

- **Approval voting, not single choice.** The existing `@@unique([brunchLocationId, userId])` is per-option, so the schema already allows a user to endorse several options. That is the better fit for scheduling ("I can do Saturday or Sunday") and needs no schema change.
- **A ballot is saved whole, not per option.** Voting is one `PUT` of the complete set of option ids for that resource kind, not a `POST`/`DELETE` per checkbox. This makes the write atomic, makes "I unchecked everything" expressible, and keeps the empty-ballot rule enforceable in one server-side place instead of racing between checkboxes.
- **Eligibility comes from a new `RsvpStatus.canVote`, not from `countsAsAttendee`.** The existing column answers "is this person coming" — it drives the dashboard's going count — which is a different question from "does this person get a say." Reusing it would have meant either excluding `maybe` attendees from the ballot or wrongly inflating the headcount. `canVote` is true for `yes` **and** `maybe`: a `maybe` deciding between two candidate times is the most informative voter on the ballot, and the schema already anticipates them being in a holding pattern via `BrunchAttendee.decideBy`. Both flags are lookup-table columns, so either can be retuned by a seed change rather than a code change.
- **An empty ballot is not participation.** A user who selects nothing is indistinguishable from a user who never voted — both have zero rows. Accepted: the UI refuses to save an empty ballot and warns that unchecking your last option withdraws your vote.
- **The host confirms; the system never auto-confirms.** Closing voting freezes the ballot and surfaces the winner. Locking the brunch stays a deliberate host action.
- **The host may confirm any option, not just the winner.** Ties are the normal outcome under approval voting, so there is no separate tie-break state — vote counts are advice on the confirm control. A pick that is not the leader is recorded via `brunch/confirmed`.
- **Decision type is derived, not stored** — see ADR 0006.

---

## User Flows

### Host manages the ballot

1. On `/brunch/[id]`, the host sees the current locations and times with an "Add" control on each
2. Adding a location reuses the wizard's Google Places autocomplete; adding a time reuses its datetime input
3. Adding a second option to a kind that had one silently turns that kind into a vote (PLANNING §5 — mode emerges from behavior, now derived rather than stored)
4. Removing an option soft-deletes it; any votes cast for it stop counting
5. Both controls disappear once the brunch is confirmed (PLANNING §5 Confirmation Lock Rules)

### Attendee votes

1. An attendee whose RSVP status has `canVote` — `yes` or `maybe` — opens `/brunch/[id]` and sees, for each kind with more than one option, a checklist of options with current vote counts
2. They check every option that works for them and the ballot saves; counts refresh
3. They can revise until voting closes. Unchecking the last remaining box warns that it withdraws their vote entirely
4. Attendees who are `invited` or `no` see the ballot and the counts read-only, with an explanation that voting is for people who are coming or might come
5. Once voting is closed, everyone sees final counts read-only

### Host closes voting early

1. When at least three attendees are eligible and at least 66% of them have voted on a kind, the host is prompted — once per kind — that they can close voting now (PLANNING §7 `vote.autoclose.prompted`)
2. The prompt is a nudge, never an automatic close (PLANNING §9.7)
3. The host can close voting at any time, prompted or not, or adjust the voting deadline

### Host confirms the brunch

1. With voting closed — or at any time, since confirming implies closing — the host opens the confirm control
2. It shows each kind's options with vote counts, preselecting the leader; ties preselect nothing and the host picks
3. The host confirms one location and one time. In one transaction: both options are marked confirmed, `votingClosedAt` is set if it was not already, the brunch moves to `confirmed`, and every active invite token's expiry is recomputed to `scheduledAt + 7 days` (the hook spec 0004 documented and deferred)
4. The page becomes read-only for location, time, and the ballot. Title, description, and the invitee list stay editable (PLANNING §5)
5. Times now render in the confirmed location's timezone rather than the viewer's (PLANNING §9.3)

### Invitee suggests a location or time

1. When `allowLocationSuggestions` / `allowTimeSuggestions` is on and the brunch is not confirmed, any attendee sees a "Suggest a place" / "Suggest a time" control
2. Submitting creates a pending suggestion — it is **not** on the ballot yet
3. If `requireHostApprovalForOptions` is false, it is auto-approved immediately and becomes a real option
4. Otherwise the host sees it in a pending list and approves (creating the real `BrunchLocation` / `BrunchTime`) or declines

---

## Acceptance Criteria

### Schema

- [ ] `decisionTypeId` dropped from `BrunchLocation` and `BrunchTime` (ADR 0006); `BrunchDecisionType` table and seed retained, with a model comment explaining why it has no FKs
- [ ] `Brunch.votingClosedAt DateTime?` added — records an early manual close without destroying the host's original `votingDeadline`
- [ ] `Brunch.locationVotePromptedAt DateTime?` and `Brunch.timeVotePromptedAt DateTime?` added — fire-once guards for the 66% prompt, per resource kind
- [ ] `Brunch.requireHostApprovalForOptions Boolean @default(true)` added, mirroring `requireHostApprovalToInvite` (PLANNING §6 gained `allowLocationSuggestions`/`allowTimeSuggestions` without a matching approval flag)
- [ ] `RsvpStatus.canVote Boolean @default(false)` added and seeded true for `yes` and `maybe`, false for `invited` and `no` — separates "gets a say" from `countsAsAttendee`'s "is coming" (see Decisions above). Seed update ships in the same commit as the column, per CLAUDE.md
- [ ] Partial unique indexes so the database — not just the service — enforces at most one confirmed location and one confirmed time per brunch: `CREATE UNIQUE INDEX ... ON "BrunchLocation"("brunchId") WHERE "isConfirmed" AND "deletedAt" IS NULL`, and the equivalent for `BrunchTime`
- [ ] `BrunchOptionSuggestionStatus` lookup table (`pending`, `approved`, `declined`) + seed entries, mirroring `BrunchInviteSuggestionStatus`
- [ ] `BrunchLocationSuggestion` and `BrunchTimeSuggestion` tables, mirroring `BrunchInviteSuggestion` (`suggestedById`, `statusId`, `reviewedById`, `reviewedAt`, plus the kind's own payload columns)
- [ ] Migrations generated and committed alongside each schema change

### Services (`packages/core`)

- [ ] `addBrunchOption({ brunchId, requestedById, kind, option }, ctx)` — host-only; `kind` discriminates location vs time; rejects when the brunch is confirmed or cancelled
- [ ] `removeBrunchOption({ brunchId, requestedById, kind, optionId }, ctx)` — host-only; soft delete; rejects removing a confirmed option or the last remaining option of a kind
- [ ] `castBallot({ brunchId, voterId, kind, optionIds }, ctx)` — replaces the voter's entire set of votes for that kind in one transaction. Rejects: brunch not `active`, voter not an attendee, voter's `RsvpStatus.canVote` false, voting closed, empty `optionIds`, any option id not belonging to this brunch or soft-deleted, or a kind with only one option (nothing to vote on). Idempotent — re-sending the same set is a no-op. Emits `vote/cast` on first ballot for that kind, `vote/changed` after
- [ ] Participation check runs inside `castBallot`'s transaction: eligible = non-deleted attendees whose `RsvpStatus.canVote` is true (the host included); participated = eligible users with at least one vote row on a non-deleted option of that kind. When eligible ≥ 3 and participated / eligible ≥ 0.66, set the kind's `...VotePromptedAt` via a **conditional update guarded on `IS NULL`** and emit `vote/autoclose.prompted`. Never re-fires, including when participation later drops and re-crosses
- [ ] `closeVoting({ brunchId, requestedById }, ctx)` — host-only; sets `votingClosedAt = now`; rejects if already closed
- [ ] `updateVotingDeadline({ brunchId, requestedById, votingDeadline }, ctx)` — host-only; future-dated or `undefined` to clear; rejects once voting is closed. Without this there is no way to set a deadline after creation
- [ ] `confirmBrunch({ brunchId, requestedById, locationId, timeId }, ctx)` — host-only, one transaction: validates both ids belong to this brunch and are not soft-deleted, sets `isConfirmed`/`confirmedAt` on both, sets `votingClosedAt` if null, moves status to `confirmed`, and recomputes `tokenExpiresAt = scheduledAt + 7 days` on every active invite (spec 0004's deferred hook). Rejects: not host, brunch not `active`, no locations or no times, unknown option ids. Emits `brunch/confirmed`
- [ ] `getBrunchVoting({ brunchId, viewerId }, ctx)` — read model for the voting UI: per kind, the options with vote counts, the viewer's own selections, derived mode, derived closed state, participation ratio, and whether the viewer may vote. Voter **names** are included only when the viewer is the host, mirroring the RSVP visibility rule (PLANNING §17); everyone else gets counts only
- [ ] `suggestBrunchOption({ brunchId, suggestedById, kind, option }, ctx)` — rejects when the kind's `allow...Suggestions` is false, the suggester is not an attendee, or the brunch is confirmed; auto-approves via `reviewBrunchOptionSuggestion` when `requireHostApprovalForOptions` is false, following the `suggestInvitee` precedent exactly
- [ ] `reviewBrunchOptionSuggestion({ suggestionId, reviewedById, kind, decision }, ctx)` — host-only; approve creates the real option via `addBrunchOption` and marks `approved`; decline marks `declined`; rejects an already-reviewed suggestion
- [ ] All option-id inputs are validated as belonging to the brunch in the path before use — an id from another brunch must never resolve
- [ ] Every count and participation query filters the parent option's `deletedAt` — votes on a removed option must not count anywhere
- [ ] Unit tests per service: happy path, host-only enforcement, eligibility rejection, closed-voting rejection, cross-brunch id rejection, soft-deleted-option handling, lookup-not-found and db-error mapping, event-emit-failure-still-Ok
- [ ] Integration tests against local Postgres: full add-options → vote → change vote → close → confirm lifecycle; the 66% guard firing exactly once across repeated ballots; votes on a soft-deleted option excluded from counts; the partial unique index rejecting a second confirmed location; token expiry recomputed on confirm

### API routes

- [ ] `POST /api/v1/brunches/:id/locations` and `.../times` — host-only; 201
- [ ] `DELETE /api/v1/brunches/:id/locations/:optionId` and `.../times/:optionId` — host-only; 204
- [ ] `PUT /api/v1/brunches/:id/votes/locations` and `.../times` — body `{ optionIds: string[] }`; whole-ballot replace; 200 with updated counts; 403 when the viewer may not vote; 409 when voting is closed
- [ ] `POST /api/v1/brunches/:id/voting/close` — host-only; 200
- [ ] `PATCH /api/v1/brunches/:id/voting/deadline` — host-only; body `{ votingDeadline: string | null }`; 200
- [ ] `POST /api/v1/brunches/:id/confirm` — host-only; body `{ locationId, timeId }`; 200; 409 if already confirmed
- [ ] `POST /api/v1/brunches/:id/option-suggestions` — any attendee; body discriminated on `kind`; 201; 403 when suggestions are disabled
- [ ] `POST /api/v1/option-suggestions/:id/review` — host-only; body `{ kind, decision }`; 200
- [ ] Route handler unit tests cover auth, ownership, and validation for every route
- [ ] `pnpm typecheck` and `pnpm lint` pass

### UI

- [ ] `/brunch/[id]` grows a voting panel: per-kind option checklists with counts, save-on-change, read-only for non-voters and after close, and the host-only voter names
- [ ] Host-only ballot management: add/remove location and time, with Places autocomplete reused from the wizard
- [ ] Host-only voting controls: close-voting button, deadline editor, and the 66% nudge when `...VotePromptedAt` is set
- [ ] Host-only confirm control: options with counts, leader preselected, ties preselecting nothing, one confirm action for both kinds
- [ ] Confirmed state: location/time/ballot read-only, times rendered in the confirmed location's timezone with the PLANNING §9.3 subline when the viewer's zone differs
- [ ] Suggestion controls for attendees and the host-only pending-suggestions review list
- [ ] `pnpm typecheck` and `pnpm lint` pass
- [ ] Full browser test with two Google accounts: host creates a brunch with two times, invites, second account RSVPs yes and votes, host sees the count, second account changes its ballot, host closes voting and confirms, both sessions show the locked brunch

### Docs

- [ ] `tasks.md` testing notes per milestone
- [ ] PLANNING §8 amended for the derived decision type and the new `Brunch` columns; §6 amended for `requireHostApprovalForOptions`; §10 amended with the events this spec introduces; §16 item 6 marked complete
- [ ] ADR 0006 committed with the M1 migration

---

## Open Questions

### Resolved during planning (2026-10-04)

- **RSVP does not lock at confirmation.** PLANNING §5 Edge Cases said both "brunch already confirmed: still allow late RSVPs" and "declined invitee: allow them to change mind until confirmed," which conflict. Resolved in favour of staying open: only location, time, and the ballot lock. A friend whose plans free up the night before can still join, and spec 0004's `respondToInvite` needs no change. PLANNING §5 amended to drop the "until confirmed" clause. A distinct "joined after you confirmed" notification would be a nice touch once Inngest exists.
- **The two-person minimum needs no confirm-time gate — it is already enforced structurally.** `confirmBrunch` rejects any brunch that is not `active`, and `sendInvites` is the only thing that moves a brunch out of `draft`. A brunch with zero invitees therefore cannot reach confirm, which satisfies PLANNING §5 for free. The remaining case — invitees exist but nobody has accepted — stays a UI warning rather than a service error, because the host usually knows their friend is coming before the app does.
- **`maybe` attendees can vote**, via the new `RsvpStatus.canVote` rather than by changing `countsAsAttendee`. See the Decisions section above for why those are two different questions.

### Still open

- **Do votes survive a mode round-trip?** Removing options down to one flips a kind to `host_decides` and the surviving option's votes stop being displayed. Adding a second option later flips it back to `group_vote` and those old votes reappear and count, even though the ballot they were cast against no longer exists. This spec keeps them — they are still a truthful record of "this person endorsed this option" — but the alternative (clearing a kind's votes whenever it leaves `group_vote`) is defensible. M2's integration test covers the round-trip so the behavior is at least pinned down.

---

## What This Spec Does Not Cover

- **Real notification delivery** — every event fires into the no-op `EventBus`; Resend and Inngest arrive with the notifications spec (PLANNING §16 item 8)
- **Realtime vote counts** — Supabase Realtime is unbuilt; the UI refetches after each action
- **Deadline-driven jobs** — `vote/deadline.approaching` and `deadline.reached` need a scheduler that does not exist. Closure is derived at read/write time instead
- **AuditLog persistence** — `brunch/confirmed` carries whether the host overrode the vote leader; writing audit rows lands with Inngest
- **Cancel, undo-cancel, host transfer, running late, the Google Calendar chip** — all v1 scope, all later specs
- **`brunching` / `paying` / `completed` statuses** — `isActive: false` for v1; `confirmed` is terminal here
- **Rich RSVP fields** — still untouched from spec 0004
- **Playwright E2E** — same rationale as specs 0003 and 0004; the two-account browser test above covers this spec manually. This spec's multi-actor flows are exactly the case the E2E proposal in PLANNING §17 exists to automate
