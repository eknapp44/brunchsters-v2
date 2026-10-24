# Plan 0013 — Brunch Lifecycle

## Files introduced or changed

**Schema (`packages/database`)**

- `prisma/schema.prisma` + one migration: `Brunch.cancelledAt`, `cancelledBy @db.Uuid`, `statusBeforeCancelId` (FK `BrunchStatus`, relation named), `cancelNoticeSentAt`; `BrunchAttendee.hiddenAt`. Comments in the schema say `archivedAt`/`archivedBy`/`cancellationJobId` are unused (ADR 0015).

**Core (`packages/core/src`)**

- `brunch/guards/brunchTransitions.ts` (+ test): `BRUNCH_TRANSITIONS`, `assertCanTransition({ from, to })`.
- `brunch/guards/assertBrunchOpen.ts` (+ test): rejects `cancelled`, `completed`, `archived`; `{ kind: 'brunch_called_off' }`.
- `brunch/guards/lifecycleGuards.test.ts`: the static enforcement test (see Test strategy).
- `brunch/cancelBrunch.ts`, `reinstateBrunch.ts`, `deleteBrunch.ts`, `setBrunchHidden.ts` (+ unit and integration tests each).
- Changed: every member-write service gets `assertBrunchOpen` (list below); `respondToInvite` (`brunch_called_off`); `getBrunchesForUser` (`isHidden`, `isCalledOff`); `presentation/groupDashboard.ts` (hidden, Past cap); `getBrunchById` and `getInviteByToken` (`isCalledOff`); `sendInvites` and `confirmBrunch` (transition guard inside the transaction).
- `email/resolveBrunchRecipients.ts` (extracted from `resolveConfirmationRecipients`, shared), `email/sendCancelledEmail.ts`, `email/sendBackOnEmail.ts`, `email/templates/cancelledEmail.ts`, `email/templates/backOnEmail.ts`, `emailKeys.ts` (`cancelledEmailKey`, `backOnEmailKey`, both including `cancelledAt` so a second cancellation sends again).
- `events/EventBus.ts`: `brunch/cancelled` `{ brunchId, cancelledAt }`, `brunch/reinstated` `{ brunchId }`.

**Shared (`packages/shared`)**

- `rateLimits.ts`: `cancelNoticesPerHost`; `brunchLifecycle.ts`: `CANCEL_NOTICE_HOLD_SECONDS = 300`, `PAST_BRUNCHES_SHOWN = 5`.

**Web (`apps/web`)**

- Routes: `api/v1/brunches/[id]/cancel/route.ts`, `reinstate/route.ts`, `hidden/route.ts`, and `DELETE` added to `api/v1/brunches/[id]/route.ts` (create it if only `[id]/...` children exist today; verified at M4).
- Inngest: `inngest/events.ts` (`CANCELLED_EMAIL_EVENTS`, `REINSTATED_EMAIL_EVENTS` added to `QUEUED_EVENTS`), `inngest/functions.ts` (`sendBrunchCancelledEmailsFunction`, `sendBrunchBackOnEmailsFunction`), `emailBudgets.test.ts` (decisions, `SENDERS`).
- UI: manage page `EndOfTheRoad.tsx` (+ `ConfirmDialog` primitive in `components/ui/`: none fit, so it is a native `<dialog>` opened with `showModal()`, no library; the browser gives focus trapping, Escape and the backdrop, and the safe choice takes focus first), brunch page banner and `HideControl.tsx` (also used by the dashboard rows and the next-up card, hidden below `40rem`, and by the Hidden list as Unhide at every width), invite page branch, dashboard (`Hidden` section, Past cap link), `lib/brunchCopy.ts` ("Called off" badge text), `lib/dashboardFormat.ts` if the summary line needs hidden-aware counts.
- E2E: `e2e/journeys/brunch-lifecycle.spec.ts`; additions to `api-authorization.spec.ts`; factories (`cancelBrunchAs`, `hideBrunchAs`, wrapping the real core services); updates to the dashboard journeys and the screenshot boards.

## Key design

**Transitions table.**

```typescript
export const BRUNCH_TRANSITIONS: Readonly<Record<BrunchStatusCode, readonly BrunchStatusCode[]>> = {
  draft: ['active'],
  active: ['confirmed', 'cancelled'],
  confirmed: ['cancelled'],
  cancelled: ['active', 'confirmed'], // only back to statusBeforeCancel; the service picks it
  completed: [],
  brunching: [],
  paying: [],
  archived: [],
};
```

The type of the keys is derived from `BRUNCH_STATUSES` (`packages/database/src/brunchStatuses.ts`) so a new seeded code is a type error until it has a row. `assertCanTransition` is pure; the service still re-reads the status **inside the transaction** and updates with `where: { id, statusId: <the status it read> }` (a conditional write), so a cancel racing a confirm has exactly one winner and the loser returns `invalid_transition`.

**`cancelBrunch` order of checks** (404/403 rule first): `assertHostOf` (404 outsider, 403 member) → `assertBrunchOpen` → status in {active, confirmed} → not over (`isPastBrunch` with the confirmed time read in the same call) → spend `cancelNoticesPerHost` (keyed by the host; refused → `rate_limited` with `retryAfterSeconds`, nothing written) → transaction (conditional status update, `cancelledAt`, `cancelledBy`, `statusBeforeCancelId`, `cancelNoticeSentAt = null`) → emit `brunch/cancelled` (a failed emit is swallowed, Constitution 12; `emailBudgets.test.ts` checks the budget is spent before the emit).

**`reinstateBrunch`:** `assertHostOf` → status is `cancelled` (else `not_called_off`) → conditional update back to `statusBeforeCancelId` → emit `brunch/reinstated`. Cancelled-and-over brunches can still be reinstated (they return to Past by derivation); an `archived`-status row is not reachable.

**`deleteBrunch`:** `assertHostOf` → status in {draft, cancelled} (else `not_deletable`) → not `isCancelNoticePending` (a called-off brunch whose notice has not gone out; it ends by itself one hour after the hold; else `notice_pending`) → set `deletedAt/By`. Invite links die through the existing `brunch: { deletedAt: null }` filters; the plan re-greps for any other read of a brunch's data that bypasses the soft-delete extension (nested includes) and adds the filter where one is found.

**`setBrunchHidden`:** `isBrunchMember` style lookup of the caller's own `BrunchAttendee` (not host-only) → `brunch_not_found` when absent → set or clear `hiddenAt`. Idempotent. No status check, no email, no budget beyond `enforceWriteLimit`.

**The open guard, and who calls it.** `assertBrunchOpen(brunch)` takes the `HostBrunch` shape, or, for member services that never load one, a small helper `loadOpenBrunch` reading just the status. Called by: `updateRsvp`, `respondToInvite`, `sendInvites`, `resendInvite`, `revokeInvite`, `suggestInvitee`, `reviewInviteSuggestion`, `suggestLocation`, `suggestTime`, `reviewLocationSuggestion`, `reviewTimeSuggestion`, `addLocation`, `addTime`, `removeLocation`, `removeTime`, `castLocationBallot`, `castTimeBallot`, `closeVoting`, `updateVotingDeadline`, `confirmBrunch` (some already use `assertBrunchActive`, which is stricter and stays). Verified in M2: twelve of these already refused a cancelled brunch through `assertBrunchActive` (`addLocation`, `addTime`, `removeLocation`, `removeTime`, `castLocationBallot`, `castTimeBallot`, `closeVoting`, `reviewLocationSuggestion`, `reviewTimeSuggestion`, `confirmBrunch`) or an inline status check (`suggestLocation`, `suggestTime`, now `assertBrunchActive` too), so only `updateVotingDeadline`, `sendInvites`, `resendInvite`, `revokeInvite`, `suggestInvitee`, `reviewInviteSuggestion`, `respondToInvite` and `updateRsvp` needed `assertBrunchOpen`. `lifecycleGuards.test.ts` accepts either call. No `loadOpenBrunch` helper was needed. **Exempt, with reasons:** `cancelBrunch`, `reinstateBrunch`, `deleteBrunch`, `setBrunchHidden`, `createBrunch` (nothing to guard). Read services are not mutating and are out of scope.

**Order of checks for member-write services** stays "membership first": the open guard runs _after_ membership so a non-member never learns a brunch is called off (404 rule). A member who writes to a called-off brunch gets `brunch_called_off` (route: **409**).

**Dashboard.** `getBrunchesForUser` adds `isHidden` (from the viewer's `BrunchAttendee.hiddenAt`) and `isCalledOff`. `groupDashboard` returns `{ nextUp, upcoming, past, hidden }`: hidden brunches never enter `toCome`/`past`; `past` is returned in full and the page slices to `PAST_BRUNCHES_SHOWN` unless `?past=all` (a pure `limitPast` helper, unit-tested). The page's empty-state branch tests "visible brunches and hidden brunches both empty", so a person who hid everything still gets the Hidden link. `summaryLine` is fed only visible counts (already true once `votesWaiting` and `comingUp` come from the grouped lists).

**Invite landing.** `getInviteByToken` adds `isCalledOff`; the page renders the called-off card **before** `respondToInvite` runs, for signed-in and signed-out visitors. `respondToInvite` also refuses (the API route `POST invites/token/[token]/respond` maps it to 409), so the page is not the only guard. The called-off card shows host name and title only (what the preview already exposed), no sign-in button, no description quote.

**Email.**

- Event `brunch/cancelled` `{ brunchId, cancelledAt: string }`, in the queued list. Function `send-brunch-cancelled-emails`: `step.sleep('hold', CANCEL_NOTICE_HOLD_SECONDS)` → `step.run('resolve-recipients')`: re-read the brunch; **stop** unless status is `cancelled` **and** `cancelledAt` equals the event's (a bring-back, or a bring-back and a second cancel, ends this run; the second cancel has its own run) → `step.run('claim-notice')` sets `cancelNoticeSentAt` where `cancelledAt` still matches (**before** sending, so a bring-back that arrives mid-send still knows people were told; queue steps are memoized, so a retry of the same run is not affected, and a replayed event sees `already_sent`) → one step per recipient (`email-<key>`). The hold is `step.sleepUntil(cancelledAt + hold)`, measured from the event's moment, not from when the run starts. The sleep and `cancelOn` alternatives were considered: re-reading is simpler and has no job id to store.
- Event `brunch/reinstated` `{ brunchId }`: function `send-brunch-back-on-emails`: re-read; stop unless status is not `cancelled` and `cancelNoticeSentAt` is set; recipients via the same resolver; keys `backon:<brunchId>:<cancelledAtMs>:<recipientKey>`. Cancel→(notice)→bring back→cancel again quickly: the back-on run sees `cancelled` and stops; the second cancel sends its own notice. Accepted: people see "called off" twice.
- Recipients: everyone invited who has not said no, removed attendees skipped, host excluded (they did it). Read at send time, never from the event. Email link: members get `/brunch/<id>`, invitees with no account get `/invite/<token>` (which shows "called this one off"); a revoked/expired invite is skipped (`skipped_invite_gone`).
- Idempotency keys: `cancelled:<brunchId>:<cancelledAtMs>:<recipientKey>` so a Resend retry does not double-send and a second cancellation does.
- **Limits (`/limited-surface`, M5):** `brunch/cancelled` = **budgeted** (`cancelNoticesPerHost`, spent in `cancelBrunch` after the host check, before the emit); `brunch/reinstated` = **bounded**: "only after a notice that a budgeted cancel already paid for; to the same people". Senders list gains `email/sendCancelledEmail.ts` and `email/sendBackOnEmail.ts`.

**Client state (per piece).** The confirm dialogs: open/pending/error are one control's state, so `useState`, not Redux (ADR 0011; CLAUDE.md State). No server data copied into the store. The Call-it-off wait uses `useWait` and `limitedMessage`. "Show all" and "Hidden" are server-rendered links (search params), not client state. Does it trigger a Redux follow-up? Only "show the server's real error message instead of a generic string" (feedback-surfaces spec): these controls show the existing generic error line until then, with the one exception of the 429 wording.

## Copy table (checked against `design-docs/Brand Voice.html` and `Copy Pass.html` at M6)

| Where                    | Draft string                                                                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Manage section heading   | End of the road                                                                                                                                |
| Call it off dialog title | Calling off "{title}"?                                                                                                                         |
| Call it off dialog body  | {n} people who said yes, maybe, or haven't said yet will get an email in a few minutes. Change your mind before then and nobody hears a thing. |
| Dialog buttons           | Nope, keep it / Call it off                                                                                                                    |
| Banner (members)         | {host} called this one off.                                                                                                                    |
| Banner (host)            | You called this one off. Bring it back and everything is just as you left it.                                                                  |
| Delete dialog            | Delete "{title}"? / This can't be undone from here. / Keep it / Delete it                                                                      |
| Hide control             | Hide from my dashboard / Unhide (page); Hide {title} / Unhide {title} (rows)                                                                   |
| Dashboard link           | Hidden ({n})                                                                                                                                   |
| Past cap                 | Show all ({n})                                                                                                                                 |
| Invite card              | {host} called this one off.                                                                                                                    |
| Past row badge           | Called off                                                                                                                                     |
| Wait line                | (existing `limitedMessage` pattern; wording settled in M5/M6)                                                                                  |

Names that a journey finds by role/label are listed in the spec; the existing "Past" heading and row text stay.

## Decisions already made (grill, 2026-10-23)

Hide is per person and archive is dropped (ADR 0015); delete only for draft/cancelled; cancel only active/confirmed-not-over; Bring it back with no timer; read-only page and clear link landing; one open guard with an enforcement test; dashboard hides hidden and caps Past at five; the cancel and back-on emails are in, with a five-minute hold; the Suggested-group-in-panels idea is out; "End of the road" section; transition table in code.

## Risks and mitigations

| Risk                                                    | Mitigation                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A mutating service missed by the guard                  | static test over `brunch/` and `invite/` with a named exemption list; failing test names the file                                                                                                                                                                                                                                 |
| Cancel/confirm/bring-back races                         | conditional updates inside one transaction; a concurrency integration test with two simultaneous calls                                                                                                                                                                                                                            |
| Inngest `step.sleep` untested locally                   | M5 runs the handler against the Inngest dev server and the e2e suite's mailbox; the hold is a constant the e2e run lowers through the existing env mechanism only if one exists (verified at M5); otherwise journeys assert the page state and read the function's result directly. **Never add a test-only bypass** (CLAUDE.md). |
| Email loop spam                                         | five-minute hold re-read + per-host daily budget + status transition rules                                                                                                                                                                                                                                                        |
| Hidden brunch missed changes                            | email ignores Hide; resurfacing recorded as deferred                                                                                                                                                                                                                                                                              |
| Dashboard journeys break on the Past cap                | M6 re-greps every journey that creates more than five brunches for one person                                                                                                                                                                                                                                                     |
| Existing "Cancelled" label tests (`brunchCopy.test.ts`) | updated in M6 with the badge text                                                                                                                                                                                                                                                                                                 |

## Test strategy

- **Unit:** transition table (every seeded status has a row; each move; a type-level exhaustiveness check), `assertBrunchOpen`, `limitPast`, `groupDashboard` with hidden brunches, recipient resolution (no / invited / removed / host), templates (subject, escaped text, links), email keys.
- **Static guards:** `lifecycleGuards.test.ts` (every mutating service in `brunch/` and `invite/` calls `assertBrunchOpen` or is exempt with a reason; fails naming the file), `routeLimits.test.ts` (new routes), `emailBudgets.test.ts` (new events and senders).
- **Integration (real Postgres):** cancel then every member write is refused and changes nothing; Bring it back restores status, confirmed flags and votes untouched; cancel racing confirm; delete only from draft/cancelled and links die; hide per person (host and attendee independent); the handlers (hold, stale-cancel stop, no-notice stop, recipients, `mark-sent`).
- **Handler tests:** each route (401, 404 for outsider/made-up/deleted, 403 for a non-host member, 409, 422, 429).
- **E2E:** journeys E1 to E11 in the spec.
- **Proving a test can fail** (recorded in each milestone's testing notes): remove `assertBrunchOpen` from `updateRsvp` → the static test and the integration test fail; make `respondToInvite` ignore called-off → E4 fails; send the cancel email without the re-read → the E2 journey fails; drop the conditional status update → the race test fails; leave `hiddenAt` out of the dashboard query → E6 fails.
