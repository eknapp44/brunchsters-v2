# Spec 0013 — Brunch Lifecycle

**Status:** Complete and released as v1.11.0 (M1 to M7 done and merged 2026-10-24, PR #21; see "Outcome")  
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
6. **Host deletes a draft or a called-off brunch**: a dialog says it cannot be undone from the app; afterwards the brunch is a 404 for everyone, its links gone cold, and it is off every dashboard. A brunch called off a moment ago cannot be deleted until its guests have been told (a few minutes; the button says so), so nobody is left never knowing it was off.
7. **Anyone hides a brunch** from the brunch page, or from its dashboard row on a tablet or desktop; it leaves their dashboard, "next up" and the waiting count. A "Hidden (n)" link (also shown when everything is hidden) lists them with **Unhide**.
8. **The dashboard stays short**: Past shows the five newest; "Show all" (a link, `?past=all`) shows the rest.
9. **A host calls off too often**: the per-host daily cancel budget is spent; **Call it off** waits with the usual line ("try again in …") and nothing changes.

---

## Acceptance Criteria

### Schema

- [x] `Brunch`: `cancelledAt`, `cancelledBy`, `statusBeforeCancelId` (FK to `BrunchStatus`), `cancelNoticeSentAt` (all nullable); `BrunchAttendee`: `hiddenAt` (nullable); one migration, committed with the schema
- [x] No data migration: no row has `archivedAt` set or a `cancelled`/`archived` status today (verified against the dev and e2e databases in M1)
- [x] PLANNING §8 notes the new columns and that `archivedAt`/`archivedBy`/`cancellationJobId` are unused (ADR 0015)

### Services (`packages/core`)

- [x] `BRUNCH_TRANSITIONS` + `assertCanTransition`; a unit test requires an entry for every seeded status; `sendInvites` (draft→active) and `confirmBrunch` use it, re-checking the status inside the transaction
- [x] `assertBrunchOpen` (rejects `cancelled`, `completed`, `archived`); applied to every service that changes a brunch's data (RSVP, token join, invites send/resend/revoke, invite and option suggestions and reviews, ballots, option add/remove, voting deadline and close, confirm); exemptions are named with reasons; a static test fails when a mutating service in `brunch/` or `invite/` neither calls it nor is exempt
- [x] `cancelBrunch`: `assertHostOf` first, then open (not already cancelled), status in {active, confirmed}, not over; spends the per-host cancel budget; one transaction sets status, `cancelledAt/By`, `statusBeforeCancelId`, clears `cancelNoticeSentAt`; emits `brunch/cancelled` after commit (a failed emit never fails the cancel)
- [x] `reinstateBrunch`: host, status `cancelled`, not deleted; restores `statusBeforeCancelId`; emits `brunch/reinstated` (only the handler decides whether anyone is told)
- [x] `deleteBrunch`: host; only `draft` or `cancelled`; a called-off brunch only once its notice has gone out (`notice_pending` until then, or an hour after the hold if the queue never delivered it); sets `deletedAt/By`; a second delete is a 404
- [x] `setBrunchHidden`: any current member (host included), any status; sets or clears the caller's own `hiddenAt`; an outsider gets `brunch_not_found`
- [x] `getBrunchesForUser` returns `isHidden` (the viewer's own; a called-off brunch is `statusCode === 'cancelled'`, so there is no separate flag); `groupDashboard` returns `hidden`, drops hidden brunches from next-up/upcoming/past; `limitPast` caps Past at five unless asked (the page slices with it); `summaryLine` counts only visible brunches
- [x] `getInviteByToken` exposes `isCalledOff` (M2); `getBrunchById` exposes the viewer's `isHidden`; `respondToInvite` refuses a called-off brunch (`brunch_called_off`) before creating anything (M2)
- [x] Recipient resolution shared by the confirmation and cancel emails; `brunch/cancelled` handler (hold, re-read, send), `brunch/reinstated` handler (send only if the notice went out), templates, idempotency keys that include `cancelledAt`
- [x] Policy `cancelNoticesPerHost` in `packages/shared/src/rateLimits.ts`, keyed by the host (never a brunch id)

### API routes (`apps/web/src/app/api/v1/`)

- [x] `POST brunches/[id]/cancel`, `POST brunches/[id]/reinstate`, `DELETE brunches/[id]`, `PUT brunches/[id]/hidden` (`{ hidden: boolean }`), each: session → `enforceWriteLimit(session.user.id)` → id check → body → service; 401, 404 (outsider, made-up and deleted ids alike), 403 (member who is not the host, on the host routes), 409 (wrong state), 422, 429 (with `Retry-After`)
- [x] `routeLimits.test.ts` passes for each; `emailBudgets.test.ts` records `brunch/cancelled` as budgeted and `brunch/reinstated` as bounded (with the reason), and core spends the budget before emitting
- [x] Handler tests per route (state conflicts, the 404/403 order, limits)

### UI

- [x] While a called-off brunch's notice is pending (`isCancelNoticePending`, the rule `deleteBrunch` uses), the Delete button is `aria-disabled` with a line saying people are still being told; it comes back by itself
- [x] Manage page: an "End of the road" section whose buttons depend on the state (Call it off; Bring it back and Delete; Delete this draft); a called-off brunch shows the banner and only these actions; confirm dialogs (focus trapped, Escape closes, safe default)
- [x] Brunch page: called-off banner, read-only; **Hide** / **Unhide** control for every member
- [x] Invite page: "called this one off" for a called-off brunch, signed in or out, no join, no sign-in button for the dead end
- [x] Dashboard: "Called off" badge on Past rows (copy table entry), Past capped at five with "Show all", "Hidden (n)" section/link (also in the empty state), hidden brunches excluded from next-up and the waiting count; a **Hide** control (an eye icon, named `Hide {title}`) on each row and on the next-up card at every width, phone included (first decided as tablet and up only; the icon fits a phone row, so it was extended after the owner's review); an **Unhide** button on each row of the Hidden list at every width
- [x] Client state: the dialogs' open/pending/error are a single control's state (`useState`, ADR 0011); no Redux slice. Server-rendered links for "Show all" and "Hidden". The 429 wait uses the existing `useWait`/`limitedMessage` pattern
- [x] Phone: phone board for the manage page's end section, the dialog, the called-off banner and the dashboard with a Hidden link. **As built (corrected at M7):** the dialog's choices stack on a phone, and the page's one-line helper sentences stay (they are short); buttons keep their natural width, and Hide is an eye on rows and the next-up card at every width, with the word and its explanation in the brunch page's header.
- [x] Voice: strings added to the copy table in `plan.md` and checked against the Brand Voice; accessible names listed per milestone below

### Docs

- [x] `PLANNING.md`: §8 columns, §16/§17 roadmap and open items updated; `docs/SETUP.md` if any command changes; `apps/web/CLAUDE.md` (screens, accessible names); root `CLAUDE.md` (the status table and open-guard rules, in Architectural Rules); `/spec-grill` and `/ui-screen` skills if this spec teaches them something; each milestone's testing notes

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

**Accessible names added** (new; but see the correction at the end of this paragraph): buttons **Call it off**, **Bring it back**, **Delete this brunch**, **Delete this draft**, **Hide from my dashboard** (brunch page), **Hide {title}** and **Unhide {title}** (dashboard rows; the title keeps them distinct), **Unhide**; dialog buttons **Nope, keep it** and the confirm button named as its action; headings **End of the road** and **Hidden**; link **Hidden (n)**; link **Show all**. **Correction found in M6:** "new, so nothing breaks" was wrong. `getByRole` matches names as substrings, so **Call it off** also matches the manage page's existing **Call it** (close voting); five journey lines in `closing-voting`, `confirm` and `manage-options` first passed `exact: true`, and the two buttons sit next to each other on the manage page, so after M6 the owner chose to rename close voting from **Call it** to **Close voting** (and the nudge line to "close voting now if you're ready"), which reverses spec 0011's wording for that button; the `exact: true` workarounds were removed. **Names that change:** the Past section's status text on cancelled rows ("Cancelled" becomes "Called off").

---

## Outcome

Shipped in PR #21 (released as **v1.11.0** on 2026-10-24) in seven milestones, each committed green, then reviewed by the owner on the running app and by `/pre-merge-review`.

**What shipped.** A brunch can end. The host **calls it off** (and can **bring it back**) or **deletes** a draft or a called-off brunch; any member **hides** a brunch from their own dashboard. The status moves are a table in code (`BRUNCH_TRANSITIONS`), one guard (`assertBrunchOpen`) stops a called-off brunch taking changes and a static test names any service that skips it, and calling off has its own budget (6 per host per day). Guests get a "called off" email after a five-minute hold (so the host can change their mind) and a "back on" email only if they had been told. A called-off brunch is read-only for members, an old invite link says it was called off and joins nobody, and Delete waits until the guests have been told (or an hour of grace). The dashboard caps Past at five ("Show all"), has a Hidden list, and Hide is an eye icon on rows, the next-up card and the Hidden list at every width. One additive migration (four nullable columns, `hiddenAt`, one foreign key).

**What changed from the plan.**

- **The spec's "new names break nothing" was wrong.** `getByRole` matches names as substrings, so **Call it off** matched the manage page's **Call it** (close voting). The owner chose clarity over brevity: the close-voting button is now **Close voting** (this reverses spec 0011's wording for it), and the exact-match workarounds were removed.
- **Hide moved.** It was a "Tidy up" panel at the bottom of the brunch page; it is a button in the header beside Manage brunch, with its explanation as a tooltip (and a line under the bar on a phone). On rows it was first tablet-and-up only; as an icon it fits a phone row, so it is on phones too. The spec's phone criterion (sub-lines drop, buttons stack full width) was corrected to what was built.
- **Delete's wait asks the server.** The first countdown re-enabled the button by itself while the server still said the guests had not been told; `useWait` gained `onExpire`, and the control refreshes and keeps holding until the server says it may.
- **The first dialog in the app is a native `<dialog>`** (no library). Its centring was broken by the brunch page's panel spacing rule (a top margin beat the browser's `margin: auto`); fixed and guarded by a geometry assertion, with a journey that it stays open while its request is in flight.
- **`hideBrunchAs` was not added** (every Hide journey presses the real control); `pnpm dev` now starts the Inngest queue (`pnpm dev:app` and `pnpm dev:queue` for either alone), because Delete and the emails depend on it.
- **The CLAUDE.md files were slimmed** (the accessible-names history moved to `docs/accessible-names.md`) and four skills learned from the review.

**What was found.**

- **A real bug in production builds:** a page-level `notFound()` is sent as an empty error shell that the browser rebuilds, and the rebuild hung when the Hero stylesheet request was aborted (about 1 in 10 attempts under load). It surfaced as the intermittent P9 and H4 failures. Worked around by importing `Hero.module.css` from the root layout; it has no deterministic test of its own (P9 and H4 are its only guard) and should be revisited when Next is upgraded (PLANNING §17).
- **The dev-mode e2e flakes were the suite's own parallelism:** with no worker limit it ran 12 browsers against one `next dev` process, which compiles routes on first use and is the limit. 4 and 6 workers take the same time (about 200 seconds, every test passing); local runs are capped at 4 workers. A production build runs the suite in about 40 seconds and is the quick gate. Dev-mode runs also fail while the owner's own `pnpm dev` and queue are running (`docs/SETUP.md`).
- **Two mutation checks that proved nothing** were caught and closed: the Hide control's layering (the journey had only clicked the next-up card, never a list row) and the Delete refresh.
- **The CI audit gate failed on a new `zod` advisory** during the PR (GHSA-mrhx-c7xc-m3w5); `zod` was bumped to 4.6.7. Expect more of these.

**What is deferred.** Recorded in "What This Spec Does Not Cover" below and PLANNING §17 "Lifecycle deferrals": a reason note on a cancellation, the in-app notification and per-brunch mute, leaving a brunch, no "over" guard (a confirmed brunch whose time has passed still accepts changes, and Bring it back does not check that its time went by while it was called off), the "Suggested" group in the Locations and Times panels, and, before launch, confirming the two new Inngest functions are registered in Inngest Cloud.

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
3. **Hide on dashboard rows**: yes at every width. First decided as tablet and desktop only, with the page control as the phone's way; changed after the owner's review of the running app, when Hide became an icon that fits a phone row. See the UI criteria.
4. **The hold length**: five minutes, a named constant that is easy to change.

Still open: whether a stored `completed` status is wanted (asked 2026-10-23; see ADR 0015 if it is decided here).
