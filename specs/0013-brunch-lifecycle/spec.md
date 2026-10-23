# Spec 0013 — Brunch Lifecycle

**Status:** Drafted 2026-10-23 (grilled with the owner; no code yet)  
**Branch:** `feat/0013-brunch-lifecycle`  
**PLANNING.md ref:** §16 roadmap step 2, §17 "Product candidates" (2), §8 (Brunch, BrunchAttendee)  
**ADRs:** [0015 — Brunch lifecycle](../../docs/adrs/0015-brunch-lifecycle.md)  
**Builds on:** [spec 0005](../0005-voting-and-confirmation/spec.md) (the status guards), [spec 0008](../0008-email-notifications/spec.md) (the email path), [spec 0011](../0011-design-fidelity/spec.md) (dashboard and manage page), [spec 0012](../0012-security-hardening/spec.md) (write limits, email budgets)

---

## What

A brunch can be planned, filled and confirmed, but not ended. This spec adds the three ways a brunch ends or goes away, and a fourth, private way to tidy up:

| Word              | Scope    | Who                             | What                                                                |
| ----------------- | -------- | ------------------------------- | ------------------------------------------------------------------- |
| **Call it off**   | everyone | host                            | cancels an active or not-yet-over confirmed brunch; people are told |
| **Bring it back** | everyone | host                            | undoes a cancel; people who were told are told it is back on        |
| **Delete**        | everyone | host                            | removes a draft or a called-off brunch (soft delete)                |
| **Hide**          | just me  | anyone in the brunch, any state | takes it off my dashboard; reversible                               |

Plus the **status flow** written down as a table the code checks, **one guard** so a called-off brunch accepts no more changes, and a **dashboard** that stops growing without limit.

### Grounded in the current code (verified 2026-10-23)

- **Nothing uses** `Brunch.archivedAt`/`archivedBy`, the `cancelled`/`archived` status rows, or `cancellationJobId`. `isPastBrunch` already files `cancelled` as Past; `groupDashboard` files an unknown status such as `archived` as Past too, so a new status alone would not clean up the dashboard.
- **Cancelled would not stop anything.** `respondToInvite`, `updateRsvp`, `resendInvite` and `revokeInvite` contain no status check. Left alone, a called-off brunch would still take RSVPs, resend invite email, and auto-RSVP "yes" a signed-in person who opens an old link (the invite page calls `respondToInvite` before it shows anything). `sendInvites` only reads the status to flip a draft to active. The option and ballot services use `assertBrunchActive` in places (`confirmBrunch` does); the plan re-checks each one.
- **Soft delete is mostly there.** `assertHostOf` reads through the soft-delete extension (a deleted brunch is a 404 for the host); `getBrunchesForUser`, `getInviteByToken` and `respondToInvite` already exclude `brunch: { deletedAt: null }`; `packages/database/src/clearBrunches.ts` is the precedent for a reversible soft delete.
- **The invite preview already carries the status.** `getInviteByToken` returns `brunchStatusLabel` and the page ignores it.
- **Email.** `brunch/cancelled` is in the typed event list's roadmap but has no producer or handler; only `invite/sent`, `invite/resent` and `brunch/confirmed` reach the queue (`events.ts`). `resolveConfirmationRecipients` already knows the recipient rule (everyone invited who has not said no, the host excluded from invites, removed attendees skipped) and already refuses a cancelled brunch. `emailBudgets.test.ts` fails for an email event with no recorded decision. Inngest handlers send one email per recipient step (`functions.ts`).
- **Dashboard.** `dashboard/page.tsx` shows an empty-state hero when the person has no brunches at all (it would hide a "Hidden (n)" link), Past is unbounded, and `summaryLine` counts come from the grouped lists.
- **No toasts exist** (the feedback-surfaces spec adds them), so this spec uses an in-page confirmation dialog and inline results.

### Principles

- **Outsiders get 404, members who lack the privilege get 403** (CLAUDE.md), established first on every new route. Hide is a member action with no host check, so it has no 403.
- **Cancel only changes the status.** Nothing else about the brunch is touched, so Bring it back restores it exactly.
- **One word per idea in the UI**, "called off" everywhere a person reads it; the code and lookup keep `cancelled`.
- **Copy never promises what is not built**: the notice goes out after a short hold, and the dialog says so.

---

## The status flow

**Brunch status (shared, stored)**

| From                         | To                                          | Trigger                                                                   |
| ---------------------------- | ------------------------------------------- | ------------------------------------------------------------------------- |
| draft                        | active                                      | first invites sent (`sendInvites`)                                        |
| active                       | confirmed                                   | host confirms (`confirmBrunch`)                                           |
| active, confirmed (not over) | cancelled                                   | host calls it off                                                         |
| cancelled                    | the status it had (`active` or `confirmed`) | host brings it back                                                       |
| any                          | (deleted)                                   | host deletes: only from `draft` or `cancelled`; `deletedAt`, not a status |

`completed`, `brunching`, `paying` and the legacy `archived` have no moves (nothing produces them). A draft is never cancelled, only deleted.

**Derived (never a status):** voting closed (deadline, early close, confirmed), brunch over (confirmed and its time passed), votes waiting.

**Per person:** RSVP (invited, yes, maybe, no), role (host, attendee, link holder, outsider), hidden.

**What each role sees**

|                    | Host                        | Attendee                  | Link holder (not in)                     | Outsider |
| ------------------ | --------------------------- | ------------------------- | ---------------------------------------- | -------- |
| active / confirmed | everything                  | RSVP, vote, suggest, Hide | joins via the link                       | 404      |
| called off         | Bring it back, Delete, Hide | read-only, Hide           | "{host} called this one off", not joined | 404      |
| deleted            | 404                         | 404                       | "That invite's gone cold."               | 404      |

---

## User flows

1. **Host calls off a confirmed brunch.** On the manage page, an "End of the road" section offers **Call it off**. A dialog names the brunch and how many people said yes, maybe or hadn't said, and says they will get an email in a few minutes unless the host brings it back first. **Nope, keep it** is the default focus. After confirming, the page shows the called-off banner and **Bring it back** and **Delete**.
2. **Host changes their mind within five minutes.** Bring it back; the brunch is exactly as it was, and nobody is emailed.
3. **Host brings it back after the notice went out.** Same, and the people who were emailed get a "back on" email.
4. **An attendee opens a called-off brunch** (from the email, the dashboard or a link): the page is read-only with a banner; RSVP, vote and suggest controls are gone; **Hide** is there.
5. **A link holder opens an old invite link to a called-off brunch**: signed out or in, they see "{host} called this one off" and are **not** joined; nothing is changed by opening the page.
6. **Host deletes a draft or a called-off brunch**: a dialog says it cannot be undone from the app; afterwards the brunch is a 404 for everyone, its links gone cold, and it is off every dashboard.
7. **Anyone hides a brunch** from the brunch page, or from its dashboard row on a tablet or desktop; it leaves their dashboard, "next up" and the waiting count. A "Hidden (n)" link (also shown when everything is hidden) lists them with **Unhide**.
8. **The dashboard stays short**: Past shows the five newest; "Show all" (a link, `?past=all`) shows the rest.
9. **A host calls off too often**: the per-host daily cancel budget is spent; **Call it off** waits with the usual line ("try again in …") and nothing changes.

---

## Acceptance Criteria

### Schema

- [ ] `Brunch`: `cancelledAt`, `cancelledBy`, `statusBeforeCancelId` (FK to `BrunchStatus`), `cancelNoticeSentAt` (all nullable); `BrunchAttendee`: `hiddenAt` (nullable); one migration, committed with the schema
- [ ] No data migration: no row has `archivedAt` set or a `cancelled`/`archived` status today (verified against the dev and e2e databases in M1)
- [ ] PLANNING §8 notes the new columns and that `archivedAt`/`archivedBy`/`cancellationJobId` are unused (ADR 0015)

### Services (`packages/core`)

- [ ] `BRUNCH_TRANSITIONS` + `assertCanTransition`; a unit test requires an entry for every seeded status; `sendInvites` (draft→active) and `confirmBrunch` use it, re-checking the status inside the transaction
- [ ] `assertBrunchOpen` (rejects `cancelled`, `completed`, `archived`); applied to every service that changes a brunch's data (RSVP, token join, invites send/resend/revoke, invite and option suggestions and reviews, ballots, option add/remove, voting deadline and close, confirm); exemptions are named with reasons; a static test fails when a mutating service in `brunch/` or `invite/` neither calls it nor is exempt
- [ ] `cancelBrunch`: `assertHostOf` first, then open (not already cancelled), status in {active, confirmed}, not over; spends the per-host cancel budget; one transaction sets status, `cancelledAt/By`, `statusBeforeCancelId`, clears `cancelNoticeSentAt`; emits `brunch/cancelled` after commit (a failed emit never fails the cancel)
- [ ] `reinstateBrunch`: host, status `cancelled`, not deleted; restores `statusBeforeCancelId`; emits `brunch/reinstated` (only the handler decides whether anyone is told)
- [ ] `deleteBrunch`: host; only `draft` or `cancelled`; sets `deletedAt/By`; a second delete is a 404
- [ ] `setBrunchHidden`: any current member (host included), any status; sets or clears the caller's own `hiddenAt`; an outsider gets `brunch_not_found`
- [ ] `getBrunchesForUser` returns `isHidden` and `isCalledOff`; `groupDashboard` returns `hidden`, drops hidden brunches from next-up/upcoming/past, caps Past at five unless asked; `summaryLine` counts only visible brunches
- [ ] `getBrunchById` and `getInviteByToken` expose `isCalledOff`; `respondToInvite` refuses a called-off brunch (`brunch_called_off`) before creating anything
- [ ] Recipient resolution shared by the confirmation and cancel emails; `brunch/cancelled` handler (hold, re-read, send), `brunch/reinstated` handler (send only if the notice went out), templates, idempotency keys that include `cancelledAt`
- [ ] Policy `cancelNoticesPerHost` in `packages/shared/src/rateLimits.ts`, keyed by the host (never a brunch id)

### API routes (`apps/web/src/app/api/v1/`)

- [ ] `POST brunches/[id]/cancel`, `POST brunches/[id]/reinstate`, `DELETE brunches/[id]`, `PUT brunches/[id]/hidden` (`{ hidden: boolean }`), each: session → `enforceWriteLimit(session.user.id)` → id check → body → service; 401, 404 (outsider, made-up and deleted ids alike), 403 (member who is not the host, on the host routes), 409 (wrong state), 422, 429 (with `Retry-After`)
- [ ] `routeLimits.test.ts` passes for each; `emailBudgets.test.ts` records `brunch/cancelled` as budgeted and `brunch/reinstated` as bounded (with the reason), and core spends the budget before emitting
- [ ] Handler tests per route (state conflicts, the 404/403 order, limits)

### UI

- [ ] Manage page: an "End of the road" section whose buttons depend on the state (Call it off; Bring it back and Delete; Delete this draft); a called-off brunch shows the banner and only these actions; confirm dialogs (focus trapped, Escape closes, safe default)
- [ ] Brunch page: called-off banner, read-only; **Hide** / **Unhide** control for every member
- [ ] Invite page: "called this one off" for a called-off brunch, signed in or out, no join, no sign-in button for the dead end
- [ ] Dashboard: "Called off" badge on Past rows (copy table entry), Past capped at five with "Show all", "Hidden (n)" section/link (also in the empty state), hidden brunches excluded from next-up and the waiting count; a **Hide** button on each row and on the next-up card at tablet width and up (the existing `min-width: 40rem` breakpoint), absent on a phone, where the brunch page's control is the way; an **Unhide** button on each row of the Hidden list at every width
- [ ] Client state: the dialogs' open/pending/error are a single control's state (`useState`, ADR 0011); no Redux slice. Server-rendered links for "Show all" and "Hidden". The 429 wait uses the existing `useWait`/`limitedMessage` pattern
- [ ] Phone: phone board for the manage page's end section, the dialog, the called-off banner and the dashboard with a Hidden link; the explanatory sub-lines drop on a phone and the buttons stack full width
- [ ] Voice: strings added to the copy table in `plan.md` and checked against the Brand Voice; accessible names listed per milestone below

### Docs

- [ ] `PLANNING.md`: §8 columns, §16/§17 roadmap and open items updated; `docs/SETUP.md` if any command changes; `apps/web/CLAUDE.md` (screens, accessible names); root `CLAUDE.md` (the status table and open-guard rules, in Architectural Rules); `/spec-grill` and `/ui-screen` skills if this spec teaches them something; each milestone's testing notes

---

## E2E Journeys

| ID  | Who                         | Asserted                                                                                                                                                                                                                                                                                                                                            | Milestone |
| --- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| E1  | host + two attendees        | host calls off a confirmed brunch from the manage page through the dialog (default focus on "Nope, keep it"); the page becomes called off; each attendee opens it read-only (no RSVP, vote or suggest control, banner shown, Hide shown); the cancel email waits out the hold and is then delivered to the two attendees and not the host or a "no" | M7        |
| E2  | host + one attendee         | host brings it back inside the hold: nobody is emailed and the brunch is exactly as before (votes, confirmed place and time, RSVPs unchanged)                                                                                                                                                                                                       | M7        |
| E3  | host + one attendee         | host brings it back after the notice went out: the attendee gets the "back on" email and the brunch accepts RSVPs again                                                                                                                                                                                                                             | M7        |
| E4  | host + invitee with a link  | an old link to a called-off brunch shows "called this one off" signed out and signed in, and does not join the signed-in person (no attendee row, no RSVP)                                                                                                                                                                                          | M7        |
| E5  | host + attendee             | a delete of a draft and of a called-off brunch: afterwards the page, the manage page, the invite link and the dashboard all behave as a made-up id for both people; a live brunch has no Delete                                                                                                                                                     | M7        |
| E6  | attendee                    | Hide takes a brunch off the dashboard, out of "next up" and out of the waiting count; Hidden (n) lists it, also when it was the only brunch; Unhide returns it; the host is unaffected                                                                                                                                                              | M7        |
| E7  | person with 7 past brunches | Past shows five; "Show all" shows all seven; the order is newest first                                                                                                                                                                                                                                                                              | M7        |
| E8  | host                        | the cancel budget: after the daily number of cancels the **Call it off** control waits with the reason, nothing changes, and a different host is unaffected                                                                                                                                                                                         | M7        |
| E9  | host, member, outsider      | **API authorization (extends the existing journey):** for cancel, reinstate, delete and hidden, real and made-up ids are indistinguishable for an outsider (404), a member who is not the host gets 403 on the host routes, and a deleted brunch is a 404 for all                                                                                   | M4        |
| E10 | attendee                    | every member write is refused on a called-off brunch through the real routes (RSVP, vote, suggestion, resend) with a clean 409, while a read still works                                                                                                                                                                                            | M4        |
| E11 | a person                    | the transition table: a cancel racing a confirm leaves exactly one winner and a consistent brunch (service-level concurrency test, not a browser journey)                                                                                                                                                                                           | M3        |

**Journeys that change** (re-verified by grep at each milestone start; the grep wins over this list): the dashboard journeys that count or find Past rows (access-and-dashboard, design-fidelity, responsive-layout, the dashboard helpers in `e2e/support/dashboard.ts`), `api-authorization.spec.ts` (E9 added), the invitee journeys that open `/invite/<token>` (invitations-invitee), and the screenshot/review boards.

**Accessible names added** (new, so no existing journey breaks on them): buttons **Call it off**, **Bring it back**, **Delete this brunch**, **Delete this draft**, **Hide from my dashboard** (brunch page), **Hide {title}** and **Unhide {title}** (dashboard rows; the title keeps them distinct), **Unhide**; dialog buttons **Nope, keep it** and the confirm button named as its action; headings **End of the road** and **Hidden**; link **Hidden (n)**; link **Show all**. **Names that change:** the Past section's status text on cancelled rows ("Cancelled" becomes "Called off").

---

## What This Spec Does Not Cover

Each of these is also in ADR 0015 (Consequences) and `PLANNING.md` §17.

- A **reason note** on the cancellation (the prototype's textarea): it needs a column and copy, and the email would have to carry it.
- The **in-app notification** for a cancellation, per-brunch mute, and the host-facing notices (RSVP, vote, suggestion, deadline): the notifications spec. The seeded `brunch.cancelled` type waits for it.
- **Leaving a brunch** (the attendee's counterpart of Call it off) and **host transfer**.
- A hidden brunch **resurfacing** when something important changes. (The row-level Hide control is in; it is left off the phone on purpose.)
- A **brunch-level archive**, **auto-archive**, and a scheduler that marks past brunches `completed`. A confirmed brunch whose time has passed **still accepts changes** (no "over" guard yet).
- The **"Suggested" group inside the Locations and Times panels** (PLANNING §17 product candidate 2): floated for this spec's manage-page pass and left out on purpose, so lifecycle stays small; it needs its own spec, and its journeys that count list items are not touched here.
- Toasts and real server error text (feedback-surfaces spec); the cancel dialog's result is inline.

---

## Open Questions

All four first-round questions were settled by the owner on 2026-10-23:

1. **The cancel budget number**: 6 per host per day is accepted as the starting point and tuned with beta data (`/limited-surface` still confirms it at M4).
2. **Email subject and body lines** wait for M5, drafted against the Brand Voice and checked with `/real-send-check`.
3. **Hide on dashboard rows**: yes on tablet and desktop, no on a phone (the page control stays the phone's way). Decided; see the UI criteria.
4. **The hold length**: five minutes, a named constant that is easy to change.

Still open: whether a stored `completed` status is wanted (asked 2026-10-23; see ADR 0015 if it is decided here).
