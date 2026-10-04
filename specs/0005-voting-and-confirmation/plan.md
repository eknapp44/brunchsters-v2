# Plan 0005 — Voting and Confirmation

**Companion to:** `spec.md`

---

## Architecture

### Files introduced

```
docs/adrs/0006-derive-decision-type.md                                        (new — committed with M1)

packages/database/prisma/schema.prisma                                        (updated — M1, M4, M5, M7)
packages/database/prisma/migrations/<ts>_drop_decision_type/migration.sql     (new — M1)
packages/database/prisma/migrations/<ts>_rsvp_status_can_vote/migration.sql   (new — M3)
packages/database/prisma/migrations/<ts>_voting_close_state/migration.sql     (new — M4)
packages/database/prisma/migrations/<ts>_single_confirmed_option/migration.sql (new — M5)
packages/database/prisma/migrations/<ts>_option_suggestions/migration.sql     (new — M7)
packages/database/src/seed.ts                                                 (updated — M7 suggestion statuses)

packages/core/src/brunch/addBrunchOption.ts                                   (new — M2)
packages/core/src/brunch/removeBrunchOption.ts                                (new — M2)
packages/core/src/brunch/getBrunchVoting.ts                                   (new — M3)
packages/core/src/brunch/castBallot.ts                                        (new — M3)
packages/core/src/brunch/closeVoting.ts                                       (new — M4)
packages/core/src/brunch/updateVotingDeadline.ts                              (new — M4)
packages/core/src/brunch/confirmBrunch.ts                                     (new — M5)
packages/core/src/brunch/suggestBrunchOption.ts                               (new — M7)
packages/core/src/brunch/reviewBrunchOptionSuggestion.ts                      (new — M7)
packages/core/src/brunch/optionKind.ts                                        (new — M2, shared discriminant + table selection)
packages/core/src/brunch/createBrunch.ts                                      (updated — M1, drops decisionType lookups)
packages/core/src/index.ts                                                    (updated — new exports)
(+ .test.ts beside every service, + .integration.test.ts for M2/M3/M4/M5/M7)

apps/web/src/app/api/v1/brunches/[id]/locations/route.ts                      (new — M2 POST)
apps/web/src/app/api/v1/brunches/[id]/locations/[optionId]/route.ts           (new — M2 DELETE)
apps/web/src/app/api/v1/brunches/[id]/times/route.ts                          (new — M2 POST)
apps/web/src/app/api/v1/brunches/[id]/times/[optionId]/route.ts               (new — M2 DELETE)
apps/web/src/app/api/v1/brunches/[id]/votes/locations/route.ts                (new — M3 PUT)
apps/web/src/app/api/v1/brunches/[id]/votes/times/route.ts                    (new — M3 PUT)
apps/web/src/app/api/v1/brunches/[id]/voting/close/route.ts                   (new — M4 POST)
apps/web/src/app/api/v1/brunches/[id]/voting/deadline/route.ts                (new — M4 PATCH)
apps/web/src/app/api/v1/brunches/[id]/confirm/route.ts                        (new — M5 POST)
apps/web/src/app/api/v1/brunches/[id]/option-suggestions/route.ts             (new — M7 POST)
apps/web/src/app/api/v1/option-suggestions/[id]/review/route.ts               (new — M7 POST)
(+ route.test.ts beside every route)

apps/web/src/app/(authenticated)/brunch/[id]/page.tsx                         (updated — M6, M8)
```

---

## Key Design Decisions

### The ballot is one `PUT`, not N `POST`s

`castBallot` takes the voter's **complete** set of option ids for a resource kind and replaces their votes in one transaction: delete the rows not in the set, insert the ones missing. The alternative — a `POST` per checkbox and a `DELETE` to uncheck — was rejected on three counts. It cannot express "I unchecked my last box" as a single intent, so the empty-ballot rule would have to be inferred from a subsequent read. It races: two checkboxes toggled quickly produce interleaved writes whose final state depends on arrival order. And it multiplies the participation-threshold check by the number of options touched.

Replace-whole-set also makes the operation naturally idempotent. Re-sending the same set — a double-click, a retry — computes an empty delete and an empty insert.

### One service, one `kind` discriminant

`BrunchLocation` and `BrunchTime` are structurally parallel: same lifecycle, same confirmation, same voting, different payload. Writing `addLocation`/`addTime`, `castLocationBallot`/`castTimeBallot`, `suggestLocation`/`suggestTime` as separate files would duplicate roughly eighty lines of validation, authorization, and closure logic per pair, six times over.

Instead each service takes `kind: 'location' | 'time'` as a discriminated union, with the payload typed per branch, and `optionKind.ts` centralizes the one thing that actually differs — which Prisma delegate and vote table to use. The API keeps them as separate routes (`/locations`, `/times`) so the URL space stays explicit; each route calls the shared service with its kind fixed.

This is the one place in the spec that trades a little indirection for a lot of removed duplication. Everywhere else, per-file services follow the existing convention.

### Closure is derived, not stored — except for the manual close

There is no scheduler, so nothing can flip a flag when `votingDeadline` passes. Closure is therefore computed wherever it matters:

```
closed = votingClosedAt != null
      || (votingDeadline != null && now > votingDeadline)
      || status == confirmed
```

`votingClosedAt` exists only because an early manual close is the one closure event that is _not_ derivable — it is a host action with no other trace. Overwriting `votingDeadline` with `now()` would have avoided the column at the cost of destroying the host's stated intent and making the UI misreport the deadline it once had.

Every write path re-evaluates the predicate **inside its transaction**, not from a value read earlier in the request. A ballot submitted a millisecond after the host closes voting must lose.

### The 66% prompt is a conditional update, not read-then-write

The naive shape — read `locationVotePromptedAt`, see null, emit, write the timestamp — double-fires when two ballots land concurrently: both reads see null. The guard is instead a single conditional write:

```sql
UPDATE "Brunch" SET "locationVotePromptedAt" = now()
WHERE id = $1 AND "locationVotePromptedAt" IS NULL
```

The event is emitted only if that update reports one affected row. This is why the prompt state lives on `Brunch` and not on option rows: it is per `(brunch, kind)`, there is no single option row that owns it, and a one-row conditional update is the whole concurrency story.

Participation counts the host. Excluding them was considered — they are the one being prompted — but with a three-person brunch that leaves two eligible voters, below the floor, so the prompt would never fire for the most common brunch size. Keeping the host in the denominator with a floor of three eligible attendees fires sensibly at the small sizes this app is actually for, and the floor is what prevents the degenerate case of a host alone voting for themselves at 1/1 = 100%.

Eligibility — both the numerator and the denominator — reads `RsvpStatus.canVote`, which is true for `yes` and `maybe`. This is deliberately _not_ `countsAsAttendee`: that column answers "is this person coming" and feeds the dashboard's going count, which is a different question from "does this person get a say." A `maybe` should not inflate the headcount but should absolutely be heard on which time works, since narrowing the options is often exactly what turns their `maybe` into a `yes`. Two flags, two questions, both retunable from the seed.

### Confirmation is one transaction with an obligation from spec 0004

`confirmBrunch` writes five things atomically: `isConfirmed` on the chosen location, `isConfirmed` on the chosen time, `votingClosedAt` if still null, `status = confirmed`, and a recomputed `tokenExpiresAt` on every active invite.

That last one is spec 0004's explicitly deferred hook — it set a flat 30-day token expiry because no time was ever confirmed, and noted that expiry should become `scheduledAt + 7 days` (PLANNING §5) once something confirmed one. This is that spec, so the debt is paid here rather than deferred again.

The partial unique indexes are belt-and-braces for the first two writes. The service already guarantees one confirmed option per kind; the index means a future code path cannot quietly violate it. Postgres partial indexes make this a one-line constraint, so there is no reason to rely on application logic alone.

### Suggestions get their own tables

Mirroring `BrunchInviteSuggestion` rather than adding a pending status to `BrunchLocation`/`BrunchTime`. The tempting alternative avoids duplicating the place columns and the copy-on-approve step, but it interacts badly with ADR 0006: with the mode derived from a count of option rows, a pending suggestion sitting in `BrunchLocation` would flip a brunch into `group_vote` before the host approved anything. Separate tables preserve the invariant the derivation depends on — every row in `BrunchLocation`/`BrunchTime` is a real ballot option.

`suggestBrunchOption` auto-approves by calling `reviewBrunchOptionSuggestion` internally rather than duplicating the approval path, exactly as `suggestInvitee` does, including its fallback of reporting `pending` if the internal call fails rather than failing the caller's request over a side effect.

### Vote visibility mirrors RSVP visibility

PLANNING §17 settled that the host sees RSVP names while other invitees see aggregate counts. Votes get the same rule, for the same reason: seeing who voted against the place you suggested is a social cost the host absorbs as organizer and other guests should not. `getBrunchVoting` includes voter names only when `viewerId` is the host — enforced in the service, not by the UI declining to render them.

---

## Milestones

| #   | Scope                                                            | Green checkpoint                                    |
| --- | ---------------------------------------------------------------- | --------------------------------------------------- |
| M1  | ADR 0006 + drop `decisionTypeId`, update `createBrunch`          | Existing tests pass with the column gone            |
| M2  | `addBrunchOption` / `removeBrunchOption` + routes                | Host can add a time to a brunch created without one |
| M3  | `RsvpStatus.canVote` + `castBallot` + `getBrunchVoting` + routes | Votes persist and count correctly                   |
| M4  | `closeVoting`, `updateVotingDeadline`, participation + 66% guard | Voting closes and the prompt fires exactly once     |
| M5  | `confirmBrunch` + partial indexes + token expiry recompute       | A brunch can be locked end to end                   |
| M6  | Voting, closing, and confirm UI                                  | Two-account browser test passes                     |
| M7  | Suggestion tables, services, routes                              | Attendee suggestion → host approval → ballot option |
| M8  | Suggestion UI                                                    | Full flow in the browser                            |

M1–M6 are a complete, useful feature; if the spec has to stop early, it stops after M6 with the suggestion flow carried to its own spec.
