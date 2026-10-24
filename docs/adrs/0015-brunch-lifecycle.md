# 0015 — Brunch lifecycle: call it off, bring it back, delete, and hide

**Date:** 2026-10-23  
**Status:** Accepted  
**Deciders:** Evan Knapp

## Context

A brunch can be created, filled with invites and options, and confirmed. It cannot end. Old test brunches clog the dashboard, a host who must cancel a confirmed brunch has no way to, and the schema has parts nothing uses: `Brunch.archivedAt`/`archivedBy`, `cancelled` and `archived` rows in the status lookup, `cancellationJobId`, and a seeded `brunch.cancelled` notification type with no producer.

Reading the code (2026-10-23) showed that "cancelled" is not enough on its own:

- Only `confirmBrunch` (and the option services that use `assertBrunchActive`) refuse a brunch that is not active. `respondToInvite`, `updateRsvp`, `resendInvite` and `revokeInvite` do not look at the status at all, so a cancelled brunch would still accept RSVPs, resend invite email, and auto-RSVP "yes" a signed-in person who opens an old link.
- `groupDashboard` files any status it does not know as Past, so a new status alone would not clean up the dashboard.
- `assertHostOf` reads through the soft-delete extension, so a soft-deleted brunch is already a 404 for the host, and `getBrunchesForUser`, `getInviteByToken` and `respondToInvite` already exclude `brunch.deletedAt`. Delete needs little new read code.
- The cancellation notice was planned as a delayed job (a 5-second undo window, `cancellationJobId`), and the roadmap deferred the email itself to the notifications spec.

Tidying up and ending a brunch are different needs with different scopes, and using one word ("archive") for both would confuse people.

## Decision

**Three host/member actions, one word each in the UI.**

| Word            | Scope    | Who                             | What                                                                       |
| --------------- | -------- | ------------------------------- | -------------------------------------------------------------------------- |
| **Call it off** | everyone | host                            | status becomes `cancelled`; reversible with **Bring it back**              |
| **Delete**      | everyone | host                            | soft delete (`deletedAt`/`deletedBy`); only a draft or a called-off brunch |
| **Hide**        | just me  | anyone in the brunch, any state | takes it off my dashboard; `BrunchAttendee.hiddenAt`; reversible           |

1. **Status flow is a table in code.** A pure `BRUNCH_TRANSITIONS` map and `assertCanTransition` guard in `packages/core` list the moves: draft→active, active→confirmed, active/confirmed→cancelled, cancelled→the status it had before. Every seeded status must have an entry (a test fails otherwise); `completed`, `brunching` and `paying` have no moves because nothing produces them. No state-machine library. Services that change status call the guard inside their transaction, which also decides a cancel racing a confirm.
2. **Cancel changes only the status.** It records `cancelledAt`, `cancelledBy` and `statusBeforeCancelId`; the confirmed place and time, votes, invites and attendees are untouched, so **Bring it back** restores exactly what was there. Cancel is allowed from `active` and from `confirmed` while the brunch is not over (`isPastBrunch`); a draft can only be deleted.
3. **One guard for every member write.** `assertBrunchOpen` rejects a cancelled (or completed, or the legacy `archived`) brunch. Every core service that changes a brunch's data calls it, except a short list of named exemptions with reasons, and a static test fails when a new mutating service does neither (the same enforcement style as `routeLimits.test.ts` and `emailBudgets.test.ts`). `respondToInvite` refuses a called-off brunch, so an old link does not join anyone.
4. **What people see.** Members keep a read-only page with a "called off" banner and may Hide it. A link holder sees "{host} called this one off" and is not joined (they already knew the title and host; the status adds nothing an outsider can use, and an outsider with no link still gets a 404). A deleted brunch is a 404 for everyone, links included.
5. **Hide is per person.** `hiddenAt` on the person's own `BrunchAttendee` row (the host has one). Hidden brunches leave the dashboard, "next up", and the votes-waiting count, and live behind a "Hidden (n)" link that un-hides. The page stays reachable by direct link, and email ignores Hide. The dashboard's Past list also shows only the five newest, with a server-rendered "Show all".
6. **The cancel notice is an email, held for five minutes.** `brunch/cancelled` is emitted with the cancellation's `cancelledAt`; the Inngest function sleeps five minutes, re-reads the brunch, and sends only if it is still called off _and_ the cancellation is the same one. Bringing it back inside the window therefore sends nothing, which also stops a cancel/bring-back loop from emailing people repeatedly. Recipients are everyone invited who has not said no, minus the host. When the notice has gone out (`cancelNoticeSentAt`), **Bring it back** emits `brunch/reinstated` and a "back on" email goes to the same people. A cancellation spends a per-host daily budget (`packages/shared/src/rateLimits.ts`) in `packages/core` after the host check; `brunch/cancelled` is a _budgeted_ decision in `emailBudgets.test.ts`, `brunch/reinstated` a _bounded_ one (it exists only after a sent notice, which spent the budget).
7. **`Brunch.archivedAt`/`archivedBy`, the `archived` status row and `cancellationJobId` stay in the schema, unused.** A brunch-level "closed for everyone" archive had no job that Hide, Call it off and Delete do not already do; the notice's hold re-reads the database instead of tracking a job id. The `archived` status is treated as terminal by `assertBrunchOpen` in case a row ever has it. A future spec may give them a meaning (for example "wrap up a finished brunch").
8. **A called-off brunch cannot be deleted until its notice has gone out.** Deleting inside the hold would leave the guests never told it was off (the notice resolves to "brunch gone" and sends nothing). `deleteBrunch` refuses with `notice_pending` while `cancelNoticeSentAt` is empty, and the wait ends by itself one hour after the hold (`CANCEL_NOTICE_GRACE_SECONDS`) so a queue outage can never trap a host. One pure rule, `isCancelNoticePending`, is shared by the service and by the screen that offers Delete. The queue function claims the notice (sets `cancelNoticeSentAt`) **before** it sends, so a bring-back that arrives mid-send still knows people were told.

## Consequences

- A host can end, undo, remove, and an attendee can tidy, with one vocabulary and no way to leave a half-state.
- Every member-write service now refuses a called-off brunch, closing three holes that exist today (RSVP after cancel, resend email after cancel, auto-join from an old link).
- The status table and the open-guard test make the next status (completed, brunching) a deliberate decision instead of a silent gap.
- Cancelling sends mail, so the cancel path has its own budget, a template, and a recorded decision in the email-budget guard.
- **Deliberately not done (also in the spec and `PLANNING.md` §17):** a reason note on the cancellation (the prototype has one; it needs a column and wording, and nothing else uses it); the in-app inbox item for a cancellation and per-brunch mute (notifications spec); leaving a brunch (the person-level counterpart of Call it off); a hidden brunch resurfacing when something important changes (today the email is the signal); the **Suggested group inside the Locations and Times panels** (PLANNING §17 product candidate 2, which was floated for this spec's manage-page pass and left out to keep it to lifecycle; it is its own spec); a brunch-level archive; automatic archiving; a scheduler that marks past brunches `completed`; **no guard yet on a confirmed brunch whose time has passed** (it still accepts RSVPs; a derived "over" rule could join `assertBrunchOpen` later).
- The seeded notification type `brunch.cancelled` still has no producer: the in-app notification belongs to the notifications spec, which adds a handler for the same event.

## Alternatives considered

- **Archive as a brunch-level flag or status** (the roadmap's original wording). Rejected: it overlaps Hide for tidying and Call it off for ending, and as a status it would overwrite what the brunch was (cancelled versus done).
- **Archive as a per-person action under the name "Archive"** (email's mental model). Rejected in favour of "Hide": it keeps "archive" free for a brunch-level meaning and says plainly that only the person's own view changes.
- **A real 5-second delayed job with `cancellationJobId`.** Rejected: five seconds is too short to notice a mistake, and re-reading after a longer hold needs no stored job id and needs no toast to offer the undo (toasts do not exist until the feedback-surfaces spec).
- **Defer the cancel email to the notifications spec.** Rejected: cancelling a confirmed brunch is the one case where someone could turn up to an empty restaurant, so a cancel that tells nobody is not a finished feature.
- **Cancel allowed in any state, delete allowed in any state.** Rejected: deleting a live brunch makes it vanish from every invitee's dashboard with no explanation, so a live brunch must be called off first; cancelling a brunch that already happened would email people about the past.
- **A state-machine library (XState).** Rejected: four statuses and one table need no dependency (Constitution Principle 2).
- **Patch only the three known holes** (`respondToInvite`, `resendInvite`, `updateRsvp`). Rejected: the next service added would forget the guard; the enforcement test is the point.
