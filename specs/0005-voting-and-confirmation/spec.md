# Spec 0005 — Voting and Confirmation

**Status:** Complete  
**Branch:** `feat/0005-voting-and-confirmation`  
**PLANNING.md ref:** §1 Design principles, §5 Host Journey / Confirmation Lock Rules / Edge Cases / Minimum Brunch Size, §6 Permissions Model, §7 Notifications, §8 Location & Time / Votes schema, §9.3 Timezone display, §9.7 Voting Close Rule, §10 Async Event Architecture, §16 Build Order item 6  
**ADRs:** [0006 — Derive decision type instead of storing it](../../docs/adrs/0006-derive-decision-type.md)

---

## What

Close out the core brunch flow (PLANNING §16 item 6) by building its last two stages: **vote** and **confirm**. Today a brunch can be created with several candidate locations and times and people can be invited to it, but nobody can express a preference and the host has no way to lock anything in. A brunch created with two times is permanently stuck showing two times.

This spec delivers:

- **Managing the ballot** — the host can add and remove locations and times after creation. Today options can only be set in the create wizard, which means a brunch created without a time can never be confirmed at all.
- **Voting** — attendees who are coming, or might come, pick the options that work for them, approval-style (check every option you can make, not a single choice). Votes are changeable until voting closes.
- **Closing** — voting ends at `Brunch.votingDeadline`, or when the host closes it early. Once enough people have voted, the host's manage screen suggests closing.
- **Confirming** — the host locks exactly one location and one time, the brunch moves to `confirmed`, and the confirmation lock rules in PLANNING §5 take effect.
- **Suggesting options** — invitees can propose a location or time, subject to host approval, mirroring the invite-suggestion flow from spec 0004. This is not an optional tail: it is the only answer a voter has when _none_ of the offered options work.

Two pieces of infrastructure this depends on do not exist yet and are explicitly not built here. **Notifications** fire into the same no-op `EventBus` as every event since spec 0003; they start delivering when the Inngest spec ships a real implementation. **Supabase Realtime** is unbuilt, so vote counts do not live-update — the UI refetches after each action. Neither swap requires touching this spec's code.

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
- **An empty ballot is not participation, and it routes to the suggestion flow.** A user who selects nothing is indistinguishable from a user who never voted — both have zero rows. Rather than add a "ballot submitted" table to disambiguate, the UI refuses to save an empty ballot and offers the suggestion control instead: "none of these work" becomes a concrete proposal rather than a silent absence. There is no chat in v1 (`Message` is `[v1 schema only]`), so without this the signal would have nowhere to go at all.
- **The host confirms; the system never auto-confirms.** Closing voting freezes the ballot and surfaces the winner. Locking the brunch stays a deliberate host action.
- **The host may confirm any option, not just the winner.** Ties are the normal outcome under approval voting, so there is no separate tie-break state — vote counts are advice on the confirm control. A pick that is not the leader is recorded via `brunch/confirmed`.
- **The 66% nudge is derived, not stored.** PLANNING §7 lists `vote.autoclose.prompted`, but notifications cannot be delivered in this spec and realtime does not exist, so a stored fire-once timestamp would record an event no one could ever receive. The nudge is instead computed on the host's manage screen from the live ratio. The fire-once guard, and the columns backing it, belong to the notifications spec — where spam is actually possible.
- **Decision type is derived, not stored** — see ADR 0006.

### Where the screens live

PLANNING §5 lists "Manage Brunch" as its own step in the Host Journey, and §1 asks for minimal chrome and one primary action per screen. The brunch detail page already carries six regions from spec 0004; piling this spec's host controls on top would take it past fourteen, with visibility keyed on both role and lifecycle state. So the surface splits:

- **`/brunch/[id]`** — the shared view everyone sees. Brunch summary, RSVP control, the ballot (votable or read-only depending on the viewer), vote counts, and the suggest-an-option control.
- **`/brunch/[id]/manage`** — host-only. Add and remove options, edit the voting deadline, close voting, the 66% nudge, the confirm control, and the pending option-suggestion review. Spec 0004's invite panel and invite-suggestion review are left where they are; moving them is out of scope here, but this route is where they eventually belong.

---

## User Flows

### Attendee votes

1. An attendee whose RSVP status has `canVote` — `yes` or `maybe` — opens `/brunch/[id]` and sees, for each kind with more than one option, a checklist of options with current vote counts
2. They check every option that works for them and the ballot saves; counts refresh
3. They can revise until voting closes. Unchecking the last remaining box explains that it withdraws their vote, and offers the suggestion control as the alternative
4. Attendees who are `invited` or `no` see the ballot and the counts read-only, with an explanation that voting is for people who are coming or might come
5. Once voting is closed, everyone sees final counts read-only

### Attendee suggests a location or time

1. When the kind's `allow...Suggestions` permission is on and the brunch is not confirmed, any attendee sees a "Suggest a place" / "Suggest a time" control on `/brunch/[id]`
2. The same control is what an empty ballot points to — the flow a voter takes when nothing offered works
3. Submitting creates a pending suggestion — it is **not** on the ballot yet, and does not affect the derived decision mode
4. If `requireHostApprovalForOptions` is false, it is auto-approved immediately and becomes a real option
5. The suggester sees their own pending suggestion and its status

### Host manages the ballot

1. The host opens `/brunch/[id]/manage` and sees the current locations and times, each with vote counts and an "Add" control
2. Adding a location uses the shared `PlaceSearchInput` extracted from the create wizard; adding a time uses the same datetime input
3. Adding a second option to a kind that had one silently turns that kind into a vote (PLANNING §5 — mode emerges from behavior, now derived rather than stored)
4. Removing an option soft-deletes it; votes cast for it stop counting
5. The route is unavailable once the brunch is confirmed, apart from a read-only summary (PLANNING §5 Confirmation Lock Rules)
6. While the brunch is still a **draft** (nobody invited yet) the screen shows a "Send an invite first" notice with a link to the brunch page, and the controls that need an active brunch — adding or removing places and times, and confirming — are disabled instead of failing; setting a deadline is unaffected. _(Added after spec 0006's E2E suite found the controls were offered but always failed; journey H8.)_

### Host closes voting

1. When at least three attendees are eligible and at least 66% of them have voted on a kind, the manage screen shows a nudge that voting can be closed now — computed from the live ratio, not from a stored flag
2. The nudge is advice, never an automatic close (PLANNING §9.7)
3. The host can close voting at any time, nudged or not, or adjust the voting deadline

### Host confirms the brunch

1. With voting closed — or at any time, since confirming implies closing — the host opens the confirm control on `/brunch/[id]/manage`
2. It shows each kind's options with vote counts, preselecting the leader; ties preselect nothing and the host picks
3. The host confirms one location and one time. In one transaction: both options are marked confirmed, `votingClosedAt` is set if it was not already, the brunch moves to `confirmed`, and every active invite token's expiry is recomputed to `scheduledAt + 7 days` (the hook spec 0004 documented and deferred)
4. Location, time, and the ballot become read-only everywhere. Title, description, and the invitee list stay editable, and RSVP stays open (PLANNING §5)

### Timezone display during voting

Times render in the viewer's local zone before a location is confirmed and in the location's zone afterwards (PLANNING §9.3). Taken literally that means confirmation silently rewrites every time on the page — someone who voted for "11am" could reload and see "9am." So the location-zone subline is shown **during voting too**, whenever any candidate location's timezone differs from the viewer's. Nothing shifts at the moment of confirmation; the subline just stops being conditional.

---

## Acceptance Criteria

### Schema

- [x] `decisionTypeId` dropped from `BrunchLocation` and `BrunchTime` (ADR 0006); `BrunchDecisionType` table and seed retained, with a model comment explaining why it has no FKs
- [x] `RsvpStatus.canVote Boolean @default(false)` added and seeded true for `yes` and `maybe`, false for `invited` and `no` — separates "gets a say" from `countsAsAttendee`'s "is coming". Seed update ships in the same commit as the column, per CLAUDE.md
- [x] `Brunch.votingClosedAt DateTime?` added — records an early manual close without destroying the host's original `votingDeadline`
- [x] `Brunch.requireHostApprovalForOptions Boolean @default(true)` added, mirroring `requireHostApprovalToInvite` (PLANNING §6 gained `allowLocationSuggestions`/`allowTimeSuggestions` without a matching approval flag)
- [x] Partial unique indexes so the database — not just the service — enforces at most one confirmed location and one confirmed time per brunch: `CREATE UNIQUE INDEX ... ON "BrunchLocation"("brunchId") WHERE "isConfirmed" AND "deletedAt" IS NULL`, and the equivalent for `BrunchTime`
- [x] `BrunchOptionSuggestionStatus` lookup table (`pending`, `approved`, `declined`) + seed entries, mirroring `BrunchInviteSuggestionStatus`
- [x] `BrunchLocationSuggestion` and `BrunchTimeSuggestion` tables, mirroring `BrunchInviteSuggestion` (`suggestedById`, `statusId`, `reviewedById`, `reviewedAt`, plus the kind's own payload columns)
- [x] **No** `...VotePromptedAt` columns — the 66% nudge is derived (see Decisions)
- [x] Migrations generated and committed alongside each schema change

### Shared guards (`packages/core/src/brunch/guards/`)

Location and time operations are structurally parallel but not type-identical — Prisma generates distinct delegates per model, and the vote FK differs (`brunchLocationId` vs `brunchTimeId`). Rather than one service taking a `kind` discriminant and casting its way across delegates, the _shared_ logic is extracted and the per-kind services stay thin and fully typed.

- [x] `assertHostOf({ brunchId, userId }, ctx)` → `Result<Brunch, 'brunch_not_found' | 'not_host'>`
- [x] `assertBrunchActive(brunch)` → `Result<void, 'brunch_not_active'>`
- [x] `assertVotingOpen(brunch)` → `Result<void, 'voting_closed'>` — the derived predicate, callable inside a transaction
- [x] `assertCanVote({ brunchId, userId }, ctx)` → `Result<BrunchAttendee, 'not_an_attendee' | 'cannot_vote'>` — reads `RsvpStatus.canVote`
- [x] `deriveDecisionMode(optionCount)` → `'host_decides' | 'group_vote'`, and the one place allowed to run the option count, which always filters `deletedAt: null` (ADR 0006)
- [x] Unit tests for each guard in isolation

### Services (`packages/core`)

Per-kind pairs, each built on the guards above. Only `castBallot` and the read model are listed in detail; the time variants mirror the location ones exactly.

- [x] `addLocation` / `addTime` — host-only; reject a brunch that is not `active` (covers confirmed and cancelled); location payload reuses `locationInputSchema` from `createBrunch.ts`; time payload validates a future ISO datetime
- [x] `removeLocation` / `removeTime` — host-only; soft delete; reject removing a confirmed option (`option_confirmed`) or the last remaining option of a kind (`last_option`), or an option id belonging to another brunch (`unknown_option`)
- [x] `castLocationBallot` / `castTimeBallot` — replace the voter's entire set of votes for that kind in one transaction. Reject: brunch not `active`, voter not an attendee, `canVote` false, voting closed, empty `optionIds`, any option id not belonging to this brunch or soft-deleted, or a kind with only one option (nothing to vote on). Idempotent — re-sending the same set is a no-op. Emit `vote/cast` on the voter's first ballot for that kind, `vote/changed` after
- [x] `closeVoting` — host-only; sets `votingClosedAt = now`; rejects if already closed
- [x] `updateVotingDeadline` — host-only; future-dated or `undefined` to clear; rejects once voting is closed. Without this there is no way to set a deadline after creation
- [x] `confirmBrunch({ brunchId, requestedById, locationId, timeId }, ctx)` — host-only, one transaction: validates both ids belong to this brunch and are not soft-deleted, sets `isConfirmed`/`confirmedAt` on both, sets `votingClosedAt` if null, moves status to `confirmed`, and recomputes `tokenExpiresAt = scheduledAt + 7 days` on every active invite (spec 0004's deferred hook). Rejects: not host, brunch not `active`, no locations or no times, unknown option ids. Emits `brunch/confirmed` carrying whether each pick was the vote leader
- [x] `getBrunchVoting({ brunchId, viewerId }, ctx)` — one read model for both screens, returning **a single shape regardless of viewer**: per kind, the options with vote counts, the viewer's own selections, derived mode, derived closed state, `canVote`, `participationRatio`, `eligibleCount`, and `shouldSuggestClosing` (the derived nudge). Per-option `voters` is `readonly string[] | undefined` — populated only for the host, mirroring the RSVP visibility rule (PLANNING §17). A return type that varies by caller identity would be awkward to consume, so the field is optional rather than the type conditional
- [x] `suggestLocation` / `suggestTime` — reject when the kind's `allow...Suggestions` is false, the suggester is not an attendee, or the brunch is not `active`; auto-approve via the review service when `requireHostApprovalForOptions` is false, following the `suggestInvitee` precedent exactly
- [x] `reviewLocationSuggestion` / `reviewTimeSuggestion` — host-only; approve creates the real option via the matching add service and marks `approved`; decline marks `declined`; reject an already-reviewed suggestion
- [x] All option-id inputs are validated as belonging to the brunch in the path before use — an id from another brunch must never resolve
- [x] Every count and participation query filters the parent option's `deletedAt` — votes on a removed option must not count anywhere
- [x] Unit tests per service: happy path, host-only enforcement, eligibility rejection, closed-voting rejection, cross-brunch id rejection, soft-deleted-option handling, lookup-not-found and db-error mapping, event-emit-failure-still-Ok
- [x] Integration tests against local Postgres: full add-options → vote → change vote → close → confirm lifecycle (`fullVotingLifecycle.integration.test.ts`); votes on a soft-deleted option excluded from counts; the partial unique index rejecting a second confirmed location; token expiry recomputed on confirm; a pending suggestion not affecting the derived mode (`optionSuggestions.integration.test.ts`)

### API routes

- [x] `POST /api/v1/brunches/:id/locations` and `.../times` — host-only; 201
- [x] `DELETE /api/v1/brunches/:id/locations/:optionId` and `.../times/:optionId` — host-only; 204
- [x] `PUT /api/v1/brunches/:id/votes/locations` and `.../times` — body `{ optionIds: string[] }`; whole-ballot replace; 200 echoing the saved `optionIds` (not counts — the client calls `router.refresh()` to get updated counts from the server-rendered page, so the route never needed to shape a read model of its own; corrected during the senior-architect review, which caught this AC overstating the actual response); 403 when the viewer may not vote; 409 when voting is closed
- [x] `POST /api/v1/brunches/:id/voting/close` — host-only; 200
- [x] `PATCH /api/v1/brunches/:id/voting/deadline` — host-only; body `{ votingDeadline: string | null }`; 200
- [x] `POST /api/v1/brunches/:id/confirm` — host-only; body `{ locationId, timeId }`; 200; 409 if already confirmed
- [x] `POST /api/v1/brunches/:id/location-suggestions` and `.../time-suggestions` — any attendee; 201; 403 when suggestions are disabled
- [x] `POST /api/v1/location-suggestions/:id/review` and `/time-suggestions/:id/review` — host-only; body `{ decision }`; 200
- [x] Route handler unit tests cover auth, ownership, and validation for every route
- [x] `pnpm typecheck` and `pnpm lint` pass

### UI — `/brunch/[id]` (shared view)

Components colocated beside the page, following the `InvitePanel` / `RsvpControl` / `SuggestionsPanel` pattern already established. The page stays a thin server component that composes them.

- [x] `BallotChecklist.tsx` — per-kind option checklist with counts, whole-ballot save on change, refetch after save
- [x] Read-only ballot for ineligible viewers with an explanation, and for everyone once voting is closed
- [x] Unchecking the last option explains that it withdraws the vote and points at the suggestion control; empty ballots are never submitted
- [x] `OptionSuggestionControl.tsx` — suggest a place or a time when permitted; shows the suggester their own pending suggestions
- [x] Times show the location-zone subline whenever any candidate location's zone differs from the viewer's, during voting and after confirmation alike
- [x] Confirmed state: location, time, and ballot read-only; RSVP control still live

### UI — `/brunch/[id]/manage` (host only)

- [x] New host-only route; non-hosts get `notFound()`
- [x] `PlaceSearchInput.tsx` extracted from `brunch/new/page.tsx`'s `StepTwo` into a shared component and reused by both the wizard and this route — its own commit, since it edits already-shipped wizard code
- [x] `OptionManager.tsx` — add/remove locations and times with vote counts
- [x] `VotingControls.tsx` — deadline editor, close-voting button, and the derived 66% nudge
- [x] `ConfirmControl.tsx` — options with counts, leader preselected, ties preselecting nothing, one action confirming both kinds, and a warning (not a block) when no one but the host has accepted
- [x] `OptionSuggestionReview.tsx` — pending location/time suggestions with approve/decline
- [x] Read-only summary once confirmed
- [x] `pnpm typecheck` and `pnpm lint` pass
- [x] Full browser test with two Google accounts — **substituted** (tasks.md M7/M8 testing notes): no test-auth-bypass or Playwright exists yet, so this ran as a live-server smoke test against real Postgres with minted session JWTs instead of two real Google-account browser sessions; a real manual two-account pass is still open

### Docs

- [x] `tasks.md` testing notes per milestone
- [x] PLANNING §8 amended for the derived decision type, `canVote`, and `votingClosedAt`; §6 amended for `requireHostApprovalForOptions`; §7 amended to note `vote.autoclose.prompted` is derived in v1 and becomes a real notification with Inngest; §10 needed no edit (its events were already listed); §16 item 6 marked complete
- [x] ADR 0006 committed with the M1 migration

---

## Open Questions

### Resolved during planning

- **RSVP does not lock at confirmation.** PLANNING §5 Edge Cases said both "still allow late RSVPs" and "change mind until confirmed," which conflict. Resolved in favour of staying open: only location, time, and the ballot lock. PLANNING §5 amended.
- **The two-person minimum needs no confirm-time gate.** `confirmBrunch` requires an `active` brunch, and only `sendInvites` moves a brunch out of `draft`, so a brunch with zero invitees cannot reach confirm. "Invitees exist but nobody accepted" stays a UI warning, because the host usually knows their friend is coming before the app does.
- **`maybe` attendees can vote**, via `RsvpStatus.canVote` rather than by overloading `countsAsAttendee`.
- **The 66% nudge is derived rather than stored**, because v1 has no way to deliver the notification it was guarding.
- **Host management lives on its own route**, per PLANNING §5's "Manage Brunch" step and §1's one-primary-action principle.
- **A vote survives the voter later dropping below `canVote` (e.g. RSVP changed to `no`).** Raised during the pre-MR architect review: `updateRsvp` never touches `BrunchLocationVote`/`BrunchTimeVote`, so a vote cast while `yes`/`maybe` keeps counting toward `voteCount`, the host's `voters` list, and `ConfirmControl`'s leader preselection even after the voter says they're not coming. `participationRatio`/`eligibleCount`/the 66% nudge are unaffected either way — `getBrunchVoting` already filters participants against the _current_ eligible set. Decided to leave votes sticky, consistent with the mode-round-trip answer below: a vote is a timestamped record of "this person endorsed this option," not a live poll of current attendees, and clearing it on RSVP change would be new, asymmetric logic in spec 0004's `updateRsvp` for a spec 0005 concern. Pinned by `voting.integration.test.ts`.

### Still open

- **Do votes survive a mode round-trip?** Removing options down to one flips a kind to `host_decides` and the surviving option's votes stop being displayed. Adding a second option later flips it back and those votes reappear, even though the ballot they were cast against no longer exists. This spec keeps them — they are still a truthful record of "this person endorsed this option" — but clearing a kind's votes whenever it leaves `group_vote` is defensible. M2's integration test pins the behavior either way.

---

## What This Spec Does Not Cover

- **Real notification delivery** — every event fires into the no-op `EventBus`; Resend and Inngest arrive with the notifications spec (PLANNING §16 item 8), which also owns the fire-once guard for `vote.autoclose.prompted`
- **Realtime vote counts** — Supabase Realtime is unbuilt; the UI refetches after each action
- **Deadline-driven jobs** — `vote/deadline.approaching` and `deadline.reached` need a scheduler that does not exist. Closure is derived at read/write time instead
- **AuditLog persistence** — `brunch/confirmed` carries whether the host overrode the vote leader; writing audit rows lands with Inngest
- **Moving spec 0004's invite panel to the manage route** — it stays on the detail page for now; the new route is where it eventually belongs
- **Cancel, undo-cancel, host transfer, running late, the Google Calendar chip** — all v1 scope, all later specs
- **`brunching` / `paying` / `completed` statuses** — `isActive: false` for v1; `confirmed` is terminal here
- **Rich RSVP fields** — still untouched from spec 0004
- **Playwright E2E** — same rationale as specs 0003 and 0004, with no manual run to fall back on this time: there was no real browser or auth bypass available, so the M7/M8 acceptance criteria above were verified by hand-minting NextAuth session JWTs and driving the live dev server's HTTP surface directly (see `tasks.md`'s M7/M8 testing notes and post-M8 review) — real for the server-rendered data and route handlers, but it never proves a checkbox click, the debounced search, or `router.refresh()` work in an actual browser. This spec's multi-actor flows are exactly the case the E2E proposal in PLANNING §17 exists to automate
