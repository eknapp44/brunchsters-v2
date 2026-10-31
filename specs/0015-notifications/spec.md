# Spec 0015 — Notifications

**Status:** Draft (grilled 2026-10-25; no code yet)  
**Branch:** `feat/0015-notifications`  
**PLANNING.md ref:** §7 (Notifications), §9.9 (Notification table TTL), §9.10 (Realtime), §16 item 8 and the roadmap table; `docs/BACKLOG.md` "Live updates", "Silent failures to surface", Lifecycle deferrals (2) and (5), Redux follow-up (3), design-fidelity deferrals (6), (7) and (10)  
**ADRs:** [0017 — Notifications](../../docs/adrs/0017-notifications.md); builds on [0009](../../docs/adrs/0009-inngest-event-bus-and-email-delivery.md) (events and email), [0011](../../docs/adrs/0011-redux-toolkit-for-client-ui-state.md) and [0016](../../docs/adrs/0016-feedback-surfaces.md) (the store, `useMutation`, coded errors), [0013](../../docs/adrs/0013-rate-limits-in-postgres.md) (limits), [0015](../../docs/adrs/0015-brunch-lifecycle.md) (called off, `assertBrunchOpen`)  
**Builds on:** specs 0008, 0013, 0014; copy rules in `docs/voice-and-copy.md`

---

## What

Today the app tells people almost nothing. This spec makes it tell them, in the app's voice and in the right place:

- **An inbox.** A bell with an unread count in the top bar opens `/notifications`: what happened on your brunches, newest first, each row a link to its brunch.
- **Host activity.** The host hears about replies, votes, suggestions and an invitation email that did not go out.
- **Member notices.** Confirmed, called off, back on, a voting deadline coming up (for people who have not voted), and an invitation for people who already have an account.
- **Preferences.** Per type, in-app and email, on `/settings/notifications`; all four existing emails and the new reminder email obey them.
- **Per-brunch mute.** All, just big stuff, or muted, on the brunch page.
- **Live-ish pages.** A page refreshes when the tab regains focus, and the badge polls; no Realtime.
- **A scheduler.** Deadline reminders, and past confirmed brunches become `completed` and read-only.

### Grounded in the current code (verified 2026-10-25)

- **The schema exists and nothing uses it.** `Notification` (user, type, channel, optional brunch, title, body, `readAt`, `sentAt`, indexes on `userId` and `brunchId` only), `NotificationType` (12 codes), `NotificationChannel` (`email`, `in_app`, `push`), `UserNotificationPreference` (unique per user, type, channel). No service, route or screen reads or writes them. There is no mute column.
- **Events.** Services emit `brunch/created`, `confirmed`, `cancelled`, `reinstated`, `invite/sent`, `invite/resent`, `attendee/rsvp.received` (only from `respondToInvite`), `attendee/rsvp.changed` (`updateRsvp`), `vote/cast` and `vote/changed`. `suggestInvitee`, `suggestLocation` and `suggestTime` emit nothing. Only invite, confirmed, cancelled and reinstated reach the queue (`inngest/events.ts`).
- **Seeded types with a producer today:** `invite.received`, `brunch.confirmed`, `brunch.cancelled`, `rsvp.received`, `vote.cast`. Needing a new producer: `invite.suggestion`, `location.suggested`, `time.suggested`, `vote.deadline.approaching`. No feature behind them: `running.late`, `host.transferred`. Derived on read, not a row: `vote.autoclose.prompted`.
- **The host has a `BrunchAttendee` row** (`createBrunch.ts`), so a mute column on it covers the host too.
- **Email failure is invisible.** `sendToRecipient` maps a rejected address to `skipped_invalid_address`, an Ok outcome that survives only in the Inngest run output.
- **No Supabase client exists** and sign-in is NextAuth with a JWT. Realtime would need a minted JWT with RLS, a `wss:` origin in the CSP and a first client.
- **The signed-in layout already holds** the per-mount `StoreProvider` and the `ToastHost`; `TopBar` has a wordmark and Sign out, no navigation. `voice-and-copy.md`, `errorCopy.ts` and the `useMutation` recipe apply.
- **`votingDeadline` is nullable** and nothing schedules from it. `completed` exists in the status lookup and has no producer; a past confirmed brunch still accepts changes.

### Principles

- **A notification is a row a handler writes; words are rendered at read time.** Times come from instants and `LocalDateTime`, never from a server-formatted string.
- **Nothing leaks.** A notification endpoint is keyed by the signed-in person; an id that is not theirs is ignored like a made-up one. A preference skip is never shown to the host as a failure. Rows name no one's ballot and no "no" answer.
- **Do not promise what the app does not do** (voice rule 7): "within a minute" is not said anywhere; the copy for a deadline says when it closes, not that you will be reminded.
- **Complete, not half-baked.** Everything a type needs (recipient rule, copy, preference line, journey) ships with the type; types with no producer are hidden from preferences, not greyed out.

---

## Who is told what

| Type (code)                                                 | Recipient                                                                                    | Trigger                                                               | In-app | Email (default)       | Mute `big_stuff`         |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------ | --------------------- | ------------------------ |
| `invite.received`                                           | an invited person who already has an account (added to the brunch at once, answer "invited") | `invite/sent`                                                         | yes    | the invite (on)       | n/a (before they answer) |
| `brunch.confirmed`                                          | every member except the host                                                                 | `brunch/confirmed`                                                    | yes    | the confirmation (on) | kept                     |
| `brunch.cancelled`                                          | every member except the host                                                                 | `brunch/cancelled`, after the 5-minute hold, only if it still stands  | yes    | the called-off (on)   | kept                     |
| `brunch.reinstated` _(new type)_                            | the people who were told it was off                                                          | `brunch/reinstated`                                                   | yes    | the back-on (on)      | kept                     |
| `vote.deadline.approaching`                                 | members who can vote and have not                                                            | scheduler, 24 h before `votingDeadline`                               | yes    | on _(new email)_      | kept                     |
| `rsvp.received`                                             | the host                                                                                     | `attendee/rsvp.received` and `.changed`; one coalesced row per brunch | yes    | none                  | dropped                  |
| `vote.cast`                                                 | the host                                                                                     | `vote/cast` and `vote/changed`; one coalesced row per brunch          | yes    | none                  | dropped                  |
| `invite.suggestion`, `location.suggested`, `time.suggested` | the host                                                                                     | new events from the three suggestion services                         | yes    | none                  | dropped                  |
| `invite.email.failed` _(new type)_                          | the host                                                                                     | a rejected address, or retries exhausted for an invite email          | yes    | none                  | **always shown**         |

Not produced in this spec: `running.late`, `host.transferred`, `vote.autoclose.prompted` (see "What This Spec Does Not Cover"). A person is never notified about their own action.

## User flows

1. **Host sees activity.** Maya replies and votes; the host's bell shows a count; `/notifications` has "2 new replies on Sunday brunch" and "3 new votes on Sunday brunch". A row they read becomes unread again when more arrive; opening a row marks it read and goes to the brunch.
2. **A member hears it is on, off, or back on.** Confirm, call off (after the existing 5-minute hold, only if it stands) and bring back each produce a row and the existing email, both subject to preferences and mute.
3. **A deadline sneaks up.** Twenty-four hours before a voting deadline, members who can vote and have not get a row and an email; a deadline set inside the window sends nothing; moving the deadline later reminds again for the new time.
4. **The host learns an invite did not go out.** The address is rejected (or retries run out); the host gets a row "Your invite to {email} didn't go through", the invite list shows the same on that line, and resending clears it. An address the invitee silenced by preference is never shown this way.
5. **Mute a brunch.** On the brunch page choose All / Just big stuff / Muted. Muted stops rows and emails for that brunch (except the host's failed-invite row); email footers link back to that page.
6. **Set preferences.** `/settings/notifications` lists the types that fire, grouped ("Your brunches", "When people respond", "Reminders"), with an in-app and an email switch where an email exists.
7. **Pages stay fresh.** Returning to a tab refreshes the page; the badge updates about once a minute; a ballot being edited is never replaced.
8. **A brunch ends.** A confirmed brunch whose time passed by six hours becomes `completed`: read-only, off the "next up" slot, cannot be brought back. Old past brunches flip quietly on the first run.
9. **Offline or failing.** The badge poll fails silently; marking read goes through `useMutation` and toasts "Looks like you're offline." / the coded line.

---

## Acceptance Criteria

### Schema and shared (M1)

- [x] Migration: `Notification` gains `data Json`, `dedupeKey String` (unique with `userId`), `lastEventAt` (a plain timestamp, not `@updatedAt`, so reading a row does not move it up the inbox), and an index on (`userId`, `readAt`, `lastEventAt`); `BrunchAttendee` gains `notificationLevelId` (FK to a new `NotificationLevel` lookup: `all`, `big_stuff`, `muted`; default `all`); `BrunchInvite` gains `emailFailedAt`; `Brunch` gains a nullable `votingDeadlineSetAt` (written by `updateVotingDeadline`, so "set inside the 24-hour window" is decidable; existing rows count as set long ago). Seed: the lookup, and two `NotificationType` rows (`brunch.reinstated`, `invite.email.failed`)
- [x] `packages/shared`: notification type and level codes (branded where they cross a boundary), `NOTIFICATION_DEFAULTS` (per type and channel), `BIG_STUFF_TYPES`, `COMPLETED_AFTER_HOURS` (6), `DEADLINE_REMINDER_HOURS` (24), `NOTIFICATION_READ_RETENTION_DAYS` (60), `NOTIFICATION_UNREAD_RETENTION_DAYS` (90); unit tests (every seeded type has a default; every code is unique)
- [x] `packages/core/src/notification/`: `writeNotification` (idempotent on the dedupe key; coalescing variant that updates in place and clears `readAt`), `recipientsFor` per type (pure rules, injected db for membership, preferences and mute), `shouldDeliver` (preference + mute, one function used by inbox and every email handler), `listNotifications`, `countUnread`, `markRead`, `markAllRead`, `setNotificationLevel`, `getPreferences`, `setPreference`, `pruneNotifications`; all `Result`-returning, unit and integration tested against the local database

### Handlers and events (M2)

- [x] The suggestion services emit `suggestion/invite`, `suggestion/location`, `suggestion/time` (typed in `EventBus.ts`, listed in `inngest/events.ts`); RSVP, vote and the brunch events are added to the queued list
- [x] Inngest functions write the rows per the table above; every handler is idempotent; the cancel row follows the same hold-and-recheck as the email (`resolveCancelNotice`), so a bring-back inside the hold writes nothing
- [x] A test (`notificationRecipients`) fails when a seeded, producible type has no recipient rule, or an event in the queued list has no handler decision (as `emailBudgets.test.ts` does for mail)

### API routes (M3, M5, M6)

- [x] `GET /api/v1/notifications/unread-count` (a read; one indexed count; session required); `POST /api/v1/notifications/read` (`{ ids }` or `{ all: true }`, touches only the caller's rows; ids that are not theirs get the same response as made-up ids); `PUT /api/v1/brunches/[id]/notification-level` (membership first, an outsider gets the 404 a made-up id gets; any member, the host included, sets their own level); `PUT /api/v1/notification-preferences`
- [x] Every mutating route calls `enforceWriteLimit(session.user.id)` right after the session check; none is keyed by an id the caller named; `routeLimits.test.ts` passes for the right reasons (`/limited-surface` recorded in M3)
- [x] Every failure answers with `apiError({ code, status, message })`; new codes (`brunch_over`, and any the routes need) have copy in `errorCopy.ts`; `apiErrors.test.ts`, `lifecycleErrorMapping.test.ts` pass
- [x] `emailBudgets.test.ts`: the new deadline-reminder email is a recorded decision (bounded: one per member per (brunch, deadline), to people already in the brunch)

### UI (M3 to M5, M8)

- [x] `notificationsSlice` (unread count, polling status, optimistic mark-read with rollback) in the per-mount store; the slice says how it resets (dropped on sign-out, ignores a late response after unmount); thunk tests
- [x] Bell in `TopBar` ("Notifications, N unread", count capped at "99+", hidden when signed out), `/notifications` (list, empty state, "Mark all read", link to settings; no list items beyond the notifications), `/settings/notifications`, a mute control on the brunch page; all via `/ui-screen`, `useMutation`, `LocalDateTime`, a `lib/notificationCopy.ts` pure module covered by `voiceCopy.test.ts`
- [x] Focus refresh + visible-tab poll hook; rules: at most every 15 s for pages, 60 s for the badge, paused with an unsaved ballot, a request in flight or an open dialog; vote-count live region announces only changes the person did not cause (design-fidelity deferral 6)
- [x] The invite list line "didn't go out" with the existing Resend control; the mute choice shown to the person on the brunch page
- [x] Phone: see "Phone"

### Scheduler (M7)

- [x] `send-deadline-reminders-and-complete-brunches` (cron every 15 minutes) and `prune-notifications` (daily); the body of each is a core function taking `now`
- [x] `completed` has transitions (`confirmed → completed`), an "over" rule beside `assertBrunchOpen` (`brunch_over`, 409) enforced by `lifecycleGuards.test.ts`, and Bring it back refuses a brunch whose time passed
- [x] The dashboard's status mapping (`brunchCopy.ts`) and the brunch page show `completed` ("Over"); a test fails when a seeded status has no mapping (already exists)

### Docs

- [x] PLANNING §7, §9.9, §10 and the §16 row; ADR 0002 and ADR 0009 pointers; `docs/BACKLOG.md` (items closed or re-pointed; "Notifications deferrals" added); `docs/accessible-names.md`; `docs/voice-and-copy.md` (a notification pattern row); `docs/SETUP.md` (queue functions, the cron); `apps/web/CLAUDE.md` (the bell, the polling rule, the notification recipe); root `CLAUDE.md` (a recipient-rule test line); the `spec-grill` and `ui-screen` skills if they now need to ask about notifications; `SUMMARY.md`, `MANUAL-TESTING.md`, `screenshots.json` and the curated `screenshots/`

---

## E2E Journeys

New series **B** (the bell; N is spec 0008's email journeys); existing ones are edited where noted. The mobile project runs B1, B2, B4 and B8.

| ID  | Who                   | Asserts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | host, one invitee     | The invitee replies and votes; the host's bell shows a count, `/notifications` has one coalesced row for replies and one for votes, opening a row marks it read and lands on the brunch; a later vote makes the row unread again. Proved to fail with coalescing removed.                                                                                                                                                                                                                |
| B2  | host, member          | Confirm: the member's bell and inbox have "Brunch is on" and the existing email arrives; the host gets no row for their own action.                                                                                                                                                                                                                                                                                                                                                      |
| B3  | host, member          | Call off then bring back inside the hold: no row, no email. Call off and wait out the hold: a row and an email; bring back: "back on" row. Proved to fail with the recheck removed.                                                                                                                                                                                                                                                                                                      |
| B4  | one person            | The bell is named "Notifications, N unread"; "Mark all read" clears it with a coded toast on failure (intercepted), rolled back; offline shows the `network` line; viewing the page marks nothing.                                                                                                                                                                                                                                                                                       |
| B5  | host, three outsiders | A person cannot read, mark, or mute another person's notification or brunch: another person's notification id and a made-up id give the same response; the mute endpoint answers an outsider and a made-up brunch identically (extends the API-authorization journey).                                                                                                                                                                                                                   |
| B6  | member                | Preferences: email off for confirmations means no confirmation email but still a row; in-app off means no row but the email; the invite email to an account with its preference off is silent and the host sees no "didn't go out". Proved to fail with `shouldDeliver` bypassed.                                                                                                                                                                                                        |
| B7  | host, member          | Per-brunch mute: muted stops rows and emails for that brunch only; `big_stuff` keeps confirmed/called off/back on and drops host-style activity; the host's failed-invite row shows even when muted.                                                                                                                                                                                                                                                                                     |
| B8  | host                  | An invite to a rejected address: the host gets the row, the invite line says it did not go out, resend clears both. Proved to fail with the failure handler removed.                                                                                                                                                                                                                                                                                                                     |
| B9  | member                | Deadline: the scheduler function is invoked through the Inngest dev API (or its core body called with `now`); a member who has not voted gets a row and an email once; a voter does not; a moved deadline reminds again. (See plan: how it is driven.)                                                                                                                                                                                                                                   |
| B10 | host, member          | Completed: a confirmed brunch past its time becomes read-only; RSVP and votes answer `brunch_over`; Bring it back is refused; the dashboard shows it as over. Proved to fail without the rule.                                                                                                                                                                                                                                                                                           |
| B11 | member, host          | Focus refresh: a change by the other person appears after the tab regains focus, never while a ballot has unsaved changes; the vote-count live region announces an outside change politely and stays silent for the person's own tap.                                                                                                                                                                                                                                                    |
| B12 | one person            | The settings page lists only types that fire, grouped; toggling saves optimistically, rolls back with a toast on failure; axe passes (D2) in light and dark; no sideways scroll on a phone (D3).                                                                                                                                                                                                                                                                                         |
| B13 | host, members         | (M2, database-level: no screen reads the rows until M4) A reply, a vote and a suggestion write the host's rows, once, counted by person; confirming writes the members' rows and not the host's or the decliner's; calling off and bringing back write rows only when people were told; an invitation writes a row naming the invite (never its token) for an invitee with an account and nothing for one without. Proved to fail with each handler unregistered or its recheck removed. |

**Edited, not new:** the API-authorization journey (the new endpoints), `access-and-dashboard` (the bell in the bar), `design-fidelity` / `responsive-layout` / `accessibility` (the new screens), `email-notifications` (the four emails now obey preferences), and the brunch lifecycle journeys for `completed`. A grep at each milestone's start wins over this list.

## Accessible names changed

No existing button, link, label or heading is renamed. **New:** the bell link "Notifications, N unread" (and "Notifications" with none), the page headings "Notifications" and "Notification settings", the buttons "Mark all read" and a per-row link named by its text, switches named "{type line}, in the app" / "{type line}, by email", the mute control "Notifications for this brunch" with "All", "Just big stuff" and "Muted", and the invite line "Didn't go out". Each milestone lists them; `docs/accessible-names.md` gets one entry.

## Phone

The bell sits in the top bar with a 44px target; `/notifications` is a full page (no popover, no dialog): one column, each row a single link with the line, the brunch title and a relative time, "Mark all read" at the top. The settings page is one switch group per heading, stacked. What a phone leaves out: the relative time moves to the same line as the title, the per-row timestamp tooltip, and the group descriptions (the type lines say it). Nothing that is the only source of a fact is hidden. A phone board is made for the inbox and the settings page.

## Risks

- **Idempotency and coalescing under retries.** A handler that runs twice must not duplicate a row or double a count. Mitigation: the dedupe key is unique per user; the coalescing write is one upsert; integration tests replay handlers.
- **The cron body cannot be waited for.** Mitigation: a core function with `now`; M7 first checks whether the Inngest dev API can invoke the function from a journey, and the testing note says what was proved.
- **Polling cost.** Mitigation: one indexed count, 60 s, only while the tab is visible; no refresh of pages in the background.
- **A refresh under someone's hands.** Mitigation: the hook never refreshes with a dirty ballot, a request in flight or an open dialog; B11.
- **Preference skipping an invite.** A person may miss an invitation they would have wanted. Accepted in ADR 0017; the link and the in-app row remain.
- **Flipping old brunches to `completed` on the first run** changes what existing data can do. Accepted: it is what the rule is for; no one is notified.

## What This Spec Does Not Cover

Each has one entry in [`docs/BACKLOG.md`](../../docs/BACKLOG.md) ("Notifications deferrals"):

- **Supabase Realtime / push to the browser**, and presence-aware delivery.
- **`running.late`, `host.transferred` and `vote.autoclose.prompted`** as rows (no feature behind the first two; the third stays a derived banner).
- **A day-of reminder** and **email digests**.
- **"Didn't go out" for the confirmed, called-off and back-on emails** (needs a recipient-level delivery record).
- **A cancellation reason note** (Lifecycle deferral 1).
- **Push channel, SMS, and a Settings spec** (profile, photos, dark mode); the preferences page is a standalone page for now.
- **A one-click unsubscribe** (the footer links to the brunch page's mute).
- **Leaving a brunch**, and a hidden brunch resurfacing when something important changes (Lifecycle deferrals 3 and 4).

## Outcome: where the build differs from the plan

Written at the pre-merge review, from the final code. Every box above is ticked against the code; these are the differences.

- **One scheduler function, named `run-scheduler`** (not `send-deadline-reminders-and-complete-brunches`): a 15-minute cron and a `scheduler/tick` event (optionally `{ brunchId }`), which is how the journeys drive it. The core bodies are `completePastBrunches`, `claimDeadlineReminders`, `sendDeadlineReminder` and `pruneNotifications` in `packages/core/src/scheduler/`, each taking `now`. The daily `prune-notifications` is its own function.
- **One extra column**, `Brunch.deadlineReminderSentFor`: the cron sees a brunch for a whole day, so a deadline is claimed with a conditional update before its reminders go out (at most once; a run that dies between the claim and the send loses that one reminder rather than doubling it).
- **`brunch_over` is its own answer**, distinct from `brunch_called_off`: `assertBrunchOpen` returns both, every route that maps one maps the other, and the lifecycle mapping test fails a route that does not. A completed brunch's invite link and manage page say so.
- **Core names**: `getNotificationPreferences` and `setNotificationPreferences`, `getNotificationLevel` and `setNotificationLevel` (not `getPreferences` or `setPreference`); the failed-invite pair is `recordInviteEmailFailed` and `clearInviteEmailFailure`, wired through the invite function's `onFailure`.
- **`emailAllowed`** is the one question every email asks (the person's switch and their level for the brunch), and the failed-invite row ignores a muted brunch (only the host's own switch for it applies).
- **The invite-list line** reads "That email didn't go through. Try Resend, or copy the link and send it yourself." (it names the two things the host can do).
- **The refresh on focus also holds for ten seconds after any form is submitted**, and the bell's poll is cancelled on submit and unmount: an authenticated answer arriving after Sign out re-issues the session cookie and would bring the session back (found by journey A2 in dev mode). The wider case, any request in flight at sign-out, is in `docs/BACKLOG.md` ("Security and session follow-ups", item 8).
- **The reminder says how long is left** ("closes in about 5 hours"), not a clock time: a brunch has no single time zone for a deadline.
- **The vote-count live region is a polite live region without `role="status"`**, so the toast region stays the page's one status region (journey T2); the announcement is taken out ten seconds after it is set.
- **The bell stays a direct link** to `/notifications`; a quick look from the bell is a recorded, deferred decision (`docs/BACKLOG.md`, Notifications deferrals item 9).
- **Journey IDs** are the B series (B1 to B12): N1 to N4 were already spec 0008's.

## Open Questions

1. `COMPLETED_AFTER_HOURS` is 6 (a brunch has no end time). Tune it after real use.
2. How many retries before "didn't go out" is written (default: the Inngest default, then `onFailure`).
3. Whether the badge poll should back off when the tab has been idle a long time (default: no).
4. Whether the invite email to an account with the preference off should still go out on the first invitation to a brand-new brunch (default: it obeys the preference, as decided).
