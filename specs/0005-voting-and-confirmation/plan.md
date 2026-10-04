# Plan 0005 — Voting and Confirmation

**Companion to:** `spec.md`

---

## Architecture

### Files introduced

```
docs/adrs/0006-derive-decision-type.md                                        (new — committed with M1)

packages/database/prisma/schema.prisma                                        (updated — M1, M3, M4, M5, M6)
packages/database/prisma/migrations/<ts>_drop_decision_type/migration.sql     (new — M1)
packages/database/prisma/migrations/<ts>_rsvp_status_can_vote/migration.sql   (new — M3)
packages/database/prisma/migrations/<ts>_voting_closed_at/migration.sql       (new — M4)
packages/database/prisma/migrations/<ts>_single_confirmed_option/migration.sql (new — M5)
packages/database/prisma/migrations/<ts>_option_suggestions/migration.sql     (new — M6)
packages/database/src/seed.ts                                                 (updated — M3 canVote, M6 suggestion statuses)

packages/core/src/brunch/guards/assertHostOf.ts                               (new — M2)
packages/core/src/brunch/guards/assertBrunchActive.ts                         (new — M2)
packages/core/src/brunch/guards/assertVotingOpen.ts                           (new — M4)
packages/core/src/brunch/guards/assertCanVote.ts                              (new — M3)
packages/core/src/brunch/guards/deriveDecisionMode.ts                         (new — M1)
packages/core/src/brunch/addLocation.ts                                       (new — M2)
packages/core/src/brunch/addTime.ts                                           (new — M2)
packages/core/src/brunch/removeLocation.ts                                    (new — M2)
packages/core/src/brunch/removeTime.ts                                        (new — M2)
packages/core/src/brunch/castLocationBallot.ts                                (new — M3)
packages/core/src/brunch/castTimeBallot.ts                                    (new — M3)
packages/core/src/brunch/getBrunchVoting.ts                                   (new — M3)
packages/core/src/brunch/closeVoting.ts                                       (new — M4)
packages/core/src/brunch/updateVotingDeadline.ts                              (new — M4)
packages/core/src/brunch/confirmBrunch.ts                                     (new — M5)
packages/core/src/brunch/suggestLocation.ts                                   (new — M6)
packages/core/src/brunch/suggestTime.ts                                       (new — M6)
packages/core/src/brunch/reviewLocationSuggestion.ts                          (new — M6)
packages/core/src/brunch/reviewTimeSuggestion.ts                              (new — M6)
packages/core/src/brunch/createBrunch.ts                                      (updated — M1, drops decisionType lookups)
packages/core/src/index.ts                                                    (updated — new exports)
(+ .test.ts beside every service and guard, + .integration.test.ts for M2–M6)

apps/web/src/app/api/v1/brunches/[id]/locations/route.ts                      (new — M2 POST)
apps/web/src/app/api/v1/brunches/[id]/locations/[optionId]/route.ts           (new — M2 DELETE)
apps/web/src/app/api/v1/brunches/[id]/times/route.ts                          (new — M2 POST)
apps/web/src/app/api/v1/brunches/[id]/times/[optionId]/route.ts               (new — M2 DELETE)
apps/web/src/app/api/v1/brunches/[id]/votes/locations/route.ts                (new — M3 PUT)
apps/web/src/app/api/v1/brunches/[id]/votes/times/route.ts                    (new — M3 PUT)
apps/web/src/app/api/v1/brunches/[id]/voting/close/route.ts                   (new — M4 POST)
apps/web/src/app/api/v1/brunches/[id]/voting/deadline/route.ts                (new — M4 PATCH)
apps/web/src/app/api/v1/brunches/[id]/confirm/route.ts                        (new — M5 POST)
apps/web/src/app/api/v1/brunches/[id]/location-suggestions/route.ts           (new — M6 POST)
apps/web/src/app/api/v1/brunches/[id]/time-suggestions/route.ts               (new — M6 POST)
apps/web/src/app/api/v1/location-suggestions/[id]/review/route.ts             (new — M6 POST)
apps/web/src/app/api/v1/time-suggestions/[id]/review/route.ts                 (new — M6 POST)
(+ route.test.ts beside every route)

apps/web/src/app/(authenticated)/brunch/[id]/BallotChecklist.tsx              (new — M7)
apps/web/src/app/(authenticated)/brunch/[id]/OptionSuggestionControl.tsx      (new — M7)
apps/web/src/app/(authenticated)/brunch/[id]/page.tsx                         (updated — M7, composes the above)
apps/web/src/app/(authenticated)/brunch/[id]/manage/page.tsx                  (new — M8, host-only route)
apps/web/src/app/(authenticated)/brunch/[id]/manage/OptionManager.tsx         (new — M8)
apps/web/src/app/(authenticated)/brunch/[id]/manage/VotingControls.tsx        (new — M8)
apps/web/src/app/(authenticated)/brunch/[id]/manage/ConfirmControl.tsx        (new — M8)
apps/web/src/app/(authenticated)/brunch/[id]/manage/OptionSuggestionReview.tsx (new — M8)
apps/web/src/app/(authenticated)/brunch/PlaceSearchInput.tsx                  (new — M8, extracted from the wizard)
apps/web/src/app/(authenticated)/brunch/new/page.tsx                          (updated — M8, uses the extraction)
```

---

## Key Design Decisions

### Shared guards, per-kind services

Location and time operations look structurally parallel — same lifecycle, same confirmation, same voting — which argues for one service per operation taking `kind: 'location' | 'time'`. That was the earlier plan, and it was wrong.

Prisma generates a distinct delegate type per model. `tx.brunchLocation` and `tx.brunchTime` do not unify, nor do `tx.brunchLocationVote` and `tx.brunchTimeVote`, and the vote FK field name differs (`brunchLocationId` vs `brunchTimeId`). A single `castBallot(kind)` therefore needs either a delegate-mapping object that erases Prisma's inference or the casts CLAUDE.md forbids outright. The abstraction fights the type system rather than riding it.

What is _actually_ shared is the authorization and lifecycle logic, not the data access. So that gets extracted — `assertHostOf`, `assertBrunchActive`, `assertVotingOpen`, `assertCanVote`, `deriveDecisionMode` — and the per-kind services stay thin, fully typed, and readable end to end. Duplication drops about as far as the discriminant would have taken it, each service remains one exported function per file per the existing convention, and nothing needs a cast.

The guards return `Result` and compose with `neverthrow`'s `andThen`, so a service body reads as a sequence of named preconditions followed by the write.

### The ballot is one `PUT`, not N `POST`s

`castLocationBallot` takes the voter's **complete** set of option ids and replaces their votes in one transaction: delete the rows not in the set, insert the ones missing. The alternative — a `POST` per checkbox and a `DELETE` to uncheck — was rejected on three counts. It cannot express "I unchecked my last box" as a single intent, so the empty-ballot rule would have to be inferred from a subsequent read. It races: two checkboxes toggled quickly produce interleaved writes whose final state depends on arrival order. And it multiplies the participation calculation by the number of options touched.

Replace-whole-set also makes the operation naturally idempotent. Re-sending the same set — a double-click, a retry — computes an empty delete and an empty insert.

### Closure is derived, not stored — except for the manual close

There is no scheduler, so nothing can flip a flag when `votingDeadline` passes. Closure is therefore computed wherever it matters:

```
closed = votingClosedAt != null
      || (votingDeadline != null && now > votingDeadline)
      || status == confirmed
```

`votingClosedAt` exists only because an early manual close is the one closure event that is _not_ derivable — it is a host action with no other trace. Overwriting `votingDeadline` with `now()` would have avoided the column at the cost of destroying the host's stated intent and making the UI misreport the deadline it once had.

`assertVotingOpen` re-evaluates the predicate **inside the transaction**, not from a value read earlier in the request. A ballot submitted a millisecond after the host closes voting must lose.

### The 66% nudge is derived, and that deletes most of its complexity

The earlier plan stored `locationVotePromptedAt` / `timeVotePromptedAt` and fired the notification exactly once via a conditional `UPDATE ... WHERE ... IS NULL`, to survive two ballots landing concurrently.

All of that machinery existed to stop a _notification_ from being sent twice. But this spec cannot send notifications at all — the `EventBus` is a no-op until the Inngest spec — and there is no realtime either, so a stored timestamp would have recorded an event that no human could receive through any channel. Building a fire-once guard for an unreachable notification is speculative work on a code path nothing exercises.

So the nudge is computed on the host's manage screen from the live ratio:

```
shouldSuggestClosing = !closed && eligibleCount >= 3 && participationRatio >= 0.66
```

That removes a migration, the conditional-update dance, the concurrency reasoning, and the "does not re-fire when participation drops and re-crosses" test class. A banner cannot spam, so idempotency stops being a concern. When the notifications spec lands, it adds the columns and the guard at the point where spam becomes possible — which is the right time to pay for them.

Participation counts the host. Excluding them was considered — they are the one being nudged — but with a three-person brunch that leaves two eligible voters, below the floor, so the nudge would never appear for the most common brunch size. Keeping the host in the denominator with a floor of three eligible attendees behaves sensibly at the small sizes this app is for, and the floor is what prevents a host alone voting for themselves and seeing 1/1 = 100%.

Eligibility — numerator and denominator both — reads `RsvpStatus.canVote`, true for `yes` and `maybe`. Deliberately _not_ `countsAsAttendee`: that column answers "is this person coming" and feeds the dashboard's going count, a different question from "does this person get a say." A `maybe` should not inflate the headcount but should absolutely be heard on which time works, since narrowing the options is often exactly what turns their `maybe` into a `yes`.

### Confirmation is one transaction with an obligation from spec 0004

`confirmBrunch` writes five things atomically: `isConfirmed` on the chosen location, `isConfirmed` on the chosen time, `votingClosedAt` if still null, `status = confirmed`, and a recomputed `tokenExpiresAt` on every active invite.

That last one is spec 0004's explicitly deferred hook — it set a flat 30-day token expiry because no time was ever confirmed, and noted expiry should become `scheduledAt + 7 days` (PLANNING §5) once something confirmed one. This is that spec, so the debt is paid here rather than deferred again.

The partial unique indexes are belt-and-braces for the first two writes. The service already guarantees one confirmed option per kind; the index means a future code path cannot quietly violate it. Postgres partial indexes make this a one-line constraint, so there is no reason to rely on application logic alone.

### Suggestions get their own tables

Mirroring `BrunchInviteSuggestion` rather than adding a pending status to `BrunchLocation`/`BrunchTime`. The tempting alternative avoids duplicating the place columns and the copy-on-approve step, but it interacts badly with ADR 0006: with the mode derived from a count of option rows, a pending suggestion sitting in `BrunchLocation` would flip a brunch into `group_vote` before the host approved anything. Separate tables preserve the invariant the derivation depends on — every row in `BrunchLocation`/`BrunchTime` is a real ballot option.

`suggestLocation` auto-approves by calling `reviewLocationSuggestion` internally rather than duplicating the approval path, exactly as `suggestInvitee` does, including its fallback of reporting `pending` if that internal call fails rather than failing the caller's request over a side effect.

### Two screens, not one

PLANNING §1 asks for minimal chrome, progressive disclosure, and one primary action per screen; §5 lists "Manage Brunch" as its own step in the Host Journey. The detail page already carries six regions from spec 0004, and this spec would have added eight more, with visibility keyed on role _and_ lifecycle state. It also has no styling yet — bare `<main>`/`<h1>`/`<p>` — so fourteen conditional regions would be genuinely unusable.

Splitting on the axis the doc already suggests: `/brunch/[id]` is the shared view (summary, RSVP, ballot, counts, suggest), `/brunch/[id]/manage` is the host's workbench (add/remove, deadline, close, nudge, confirm, review). Each screen gets one obvious primary action — vote, and confirm. Spec 0004's invite panel stays put for now; the manage route is where it eventually belongs, but moving shipped UI is out of scope here.

Both screens read from the same `getBrunchVoting` call, which returns one shape for every viewer with `voters` populated only for the host. A read model whose _type_ varied by caller would push role-checking into every consumer.

### `PlaceSearchInput` has to be extracted before it can be reused

The spec says adding a location reuses the wizard's Places autocomplete. That autocomplete is currently inline in `StepTwo`, inside the 441-line `brunch/new/page.tsx` — it is not a component, and "reuse" is not free. M8 extracts it to `brunch/PlaceSearchInput.tsx` and repoints the wizard at it as its own commit, before the manage route consumes it. Editing already-shipped wizard code deserves to be isolated in history rather than buried in a feature milestone.

---

## Milestones

Service and schema work lands first, so the UI is built once against a complete API rather than being revisited.

| #   | Scope                                                                     | Green checkpoint                                    |
| --- | ------------------------------------------------------------------------- | --------------------------------------------------- |
| M1  | ADR 0006 + drop `decisionTypeId` + `deriveDecisionMode`                   | Existing tests pass with the column gone            |
| M2  | Shared guards + add/remove location and time + routes                     | Host can add a time to a brunch created without one |
| M3  | `RsvpStatus.canVote` + cast ballot + `getBrunchVoting` + routes           | Votes persist and count correctly                   |
| M4  | `votingClosedAt` + `closeVoting` + `updateVotingDeadline` + derived nudge | Voting closes; the ratio is exposed                 |
| M5  | `confirmBrunch` + partial indexes + token expiry recompute                | A brunch can be locked end to end                   |
| M6  | Suggestion tables, services, routes                                       | Attendee suggestion → host approval → ballot option |
| M7  | `/brunch/[id]` — ballot, counts, suggest control, timezone subline        | Two accounts can vote in the browser                |
| M8  | `PlaceSearchInput` extraction + `/brunch/[id]/manage`                     | Full two-account flow passes                        |

M1 is a pure refactor with no user-facing change and merges on its own as soon as it is green, rather than riding along in an eight-milestone PR. M2–M6 are a complete API; M7–M8 are the UI on top.
