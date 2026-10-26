# Tasks 0015 — Notifications

Eight milestones (the grill's five grew as the pieces became concrete: routes, the inbox and the settings were separated from the store work), each green on its own and ending in a commit. Branch: `feat/0015-notifications`, cut from `main` (no stacking). Close each milestone with `/milestone-done`, then **stop for the owner's review** before the next. Every milestone runs `pnpm typecheck && pnpm lint && pnpm test`, and `pnpm test:e2e` whenever it touches anything a user sees or does (`CI=true pnpm build && CI=true pnpm test:e2e` is the quick gate; stop your own `pnpm dev` first). Re-verify each milestone's "journeys that change" list with a grep at its start; the grep wins over the list. Use `/ui-screen` for every milestone that changes a screen (M4, M5, M6, M8) and `/limited-surface` at M3 (routes) and M7 (the reminder email).

The order proves the risky parts early: rows and the one delivery decision (M1, M2), then the read side and the poll (M3, M4), then the choices that gate delivery (M5), then the failure signal (M6), then the clock (M7), then focus refresh last (M8), which is the most separable. **At M6, ask whether M8 stays in this spec or becomes 0016.**

Process (pilot, spec 0014 and this one): the folder also gets `SUMMARY.md`, `MANUAL-TESTING.md` and `screenshots.json` (kept true by each milestone; finished in the pre-merge review). **At the pre-merge review ask whether the manual-testing list was run and the screenshots looked at, and drop what was not** (`docs/BACKLOG.md`, "Long-tail questions"). Testing notes stay short: what and how, fixed on the way, deferred, run.

---

## M1 — Schema, shared lists and the notification core

- [x] Commit this spec folder, ADR 0017 (with the README index row), the PLANNING and BACKLOG edits and the ADR 0002 / 0009 pointers as one docs-only commit, before any code
- [x] Migration and seed per the spec (`Notification.data`, `dedupeKey`, `lastEventAt`, indexes; `NotificationLevel` and `BrunchAttendee.notificationLevelId`; `BrunchInvite.emailFailedAt`; `Brunch.votingDeadlineSetAt`; two new types); generated and committed with the schema change
- [x] `packages/shared/src/notifications.ts` and tests (every seeded type has a default, codes are unique, `BIG_STUFF_TYPES` are types)
- [x] `packages/core/src/notification/`: `writeNotification`, `coalesceNotification`, `shouldDeliver`, `recipientsFor` (pure), `listNotifications`, `countUnread`, `markRead`, `markAllRead`; `updateVotingDeadline` writes `votingDeadlineSetAt`
- [x] Unit tests (`shouldDeliver` table, recipient rules) and integration tests against local Postgres (replay writes one row; coalescing clears `readAt`; `markRead` touches only the caller's rows; a dedupe collision across users does not collide)
- [x] **Prove the tests can fail:** drop the dedupe unique index → the replay test fails; make `markRead` match on `id` alone → the "only the caller's rows" test fails
- [x] Commit: `feat: add the notification schema and the delivery core (M1)`

**Journeys that change:** none (nothing is mounted). **Deployable:** yes.

**Testing notes:**

- **What and how:** shared +9 unit (lists, defaults, `readNotificationData`), core +17 unit (the `decideDelivery`/`shouldDeliver` table and `recipientsFor`) and 13 integration tests on real Postgres (seeded vocabulary matches the shared list; write replay and a simultaneous double write make one row; coalescing through new, another person, same person, read, again, and two people at once; `markRead` ignores another person's, a made-up and a non-UUID id alike; reading does not move a row; list order, paging, deleted-brunch and unreadable rows left out; `shouldDeliver` against a muted level and a saved switch). No journey: nothing is mounted or user-visible; full CI-mode e2e still passes (279 passed, 2 skipped). Proved to fail: `markRead` matching on id alone, `markRead` bumping `lastEventAt`, and the dedupe unique index dropped (6 tests fail).
- **Fixed on the way:** `@updatedAt` would have moved a row to the top of the inbox whenever it was read, so the column is `lastEventAt` (a plain timestamp), found by the paging test; the coalescing SQL needed parentheses around `->` before `@>`/`||` (caught by the first run). The migration SQL was written by hand (the 'all' level row must exist before existing attendee rows take its id as their default) and checked with `prisma migrate diff` (only the cosmetic uuid-default representation differs).
- **Deferred:** `pruneNotifications`, preferences and mute writes are M5 and M7; the stress run and a second CI-mode run are skipped because nothing mounted changed (the first milestone that mounts the bell, M4, runs them). `updateVotingDeadline` writing `votingDeadlineSetAt` is covered by its unit test only.
- **Run:** `pnpm --filter @brunchsters/core test:integration notification` (needs `pnpm db:seed` after `prisma migrate deploy`).

---

## M2 — Events and handlers write the rows

- [x] The three suggestion services emit `suggestion/invite|location|time` (typed in `EventBus.ts`); `events.ts` lists the new families; the handlers in `functions.ts` write rows per the spec's table, idempotently; the cancel row uses the same hold-and-recheck as the email
- [x] `invite.received` for an invitee who already has an account (a normalized-email lookup); nothing for one who does not
- [x] `notificationRecipients.test.ts` (a producible type without a recipient rule, or a handled event without a decision, fails and names the file)
- [x] Integration tests per event: who gets a row, who does not (the actor, the host for member types, a muted member); a retried handler writes once
- [x] **Prove the tests can fail:** remove the recheck from the cancel handler → a bring-back inside the hold still writes a row, and the test fails; remove a recipient rule → `notificationRecipients` fails
- [x] Commit: `feat: write notification rows from brunch events (M2)`

**Journeys that change:** new B13 (`notifications-queue.spec.ts`, reads the rows from the database: nothing on screen shows them until M4); `email-notifications` N4 (eight functions, was five). **Deployable:** yes (rows accumulate unseen; the daily prune arrives in M7, and M2 to M6 are small).

**Testing notes:**

- **What and how:** 11 new integration tests on real Postgres (`producers.integration.test.ts`: a reply or vote counts a person once and never the actor or a muted host; a pending suggestion writes one row and a decided one none; confirmed reaches members but not the host, the decliner or a muted member; called-off and back-on rows are keyed by the cancellation; an invitation row names the invite, never its token), 3 unit tests each for the two suggestion services (emit while pending, not when approved, survive a dead queue), one for "no" in `recipientsFor`, and the static `notificationRecipients.test.ts` guard. Journey **B13** (3 tests, real Inngest dev server): reply, vote, suggestion and confirm reach the right inboxes; called off and back on write rows only when people were told (a brunch brought back inside the hold writes none); an invitation reaches an account holder and not an address with none. Proved to fail: 7 core mutations (ignore "no", tell the actor, expired invite, decided suggestion, called-off confirmation, skip `shouldDeliver`, cancellation key without its moment) and 2 in the Inngest wiring (the called-off step replaced by a no-op; votes routed to the reply producer).
- **Fixed on the way:** a person with an account is added to the brunch the moment they are invited (answer "invited"), so skipping invites that have an attendee wrote nothing for exactly the people it is for; the integration test had built an invite without that row and passed, B13 found it. Journey ids: the spec's N-series clashed with spec 0008's N1 to N4, so the notification journeys are the **B** series (renamed in the spec folder). The static guard's "emitted by core" check must skip `EventBus.ts`, which names every event.
- **Deferred:** the stress run: nothing mounted changed (the first milestone that mounts the bell, M4, runs it); the failed-invite row (M6) and the deadline reminder (M7) are the two types still listed as not yet produced. Votes and RSVPs now reach the queue (one send each, ADR 0009 said they cost nothing until consumed): fine for a beta, a thing to watch.
- **Run:** `pnpm --filter @brunchsters/core test:integration notification`; `CI=true pnpm build && CI=true pnpm test:e2e notifications-queue`.

---

## M3 — Routes, the store slice and the badge poll

- [x] `GET notifications/unread-count`, `POST notifications/read`; each returns coded errors; made-up and foreign ids get the same response; the read route spends `enforceWriteLimit` right after the session check (`/limited-surface` recorded)
- [x] `notificationsSlice` (count, a poll-in-flight flag, optimistic `markNotificationsRead` with rollback; released with the store), selectors beside it; thunk tests (ok, coded failure, network, late result ignored)
- [x] `useBadgePoll`: 60 s while visible, once on focus, silent on failure; the decision is a pure function with unit tests
- [x] The API-authorization journey gains the two routes
- [x] **Prove the tests can fail:** the read route filtering by id only → the foreign-id test fails; the poll running while hidden → its unit test fails
- [x] Commit: `feat: add the notification routes, store slice and badge poll (M3)`

**Accessible names changed:** none yet (the bell arrives in M4). **Journeys that change:** `api-authorization`. **Deployable:** yes.

**Testing notes:**

- **What and how:** 13 slice tests (poll ok, a failed poll in five ways stays silent and keeps the number, no second poll while one is out or a read is in flight; `markNotificationsRead` drops the count at once, only by the unread rows named and never below zero, puts it back with a coded toast on a 500, offline and a 429, rolls back only the read that failed when two are out, and a poll that began before a read cannot put the old count back), 5 for the poll's pure rules (hidden never asks; mount always; focus not twice within 15 s; a tick right after a poll is skipped), 10 route tests (401 with a code and nothing spent, the write budget first, ids passed untouched, a foreign and a made-up id answered alike, 422/400/500 with codes, the count never cached). Journey **B5** (in `api-authorization`, real server): anonymous 401 on both routes; each person's count is their own; a foreign id, a made-up id and a non-id get the identical `{ marked: 0 }` and leave the other person's row unread; "mark all" touches only the caller's rows. Proved to fail: 8 unit/route mutations (poll epoch guard, no rollback, no clamp, poll during a read, no toast, poll while hidden, no write budget, cacheable count) and, in B5, the named-ids branch marking everything.
- **Limits (`/limited-surface`):** no new policy. Mark-read is a plain mutation (the write budget, spent right after the session check, keyed by the caller; `routeLimits.test.ts` picks it up); the count is a read (one indexed query, never cached, polled at most about once a minute per open tab). No email, no paid call, so nothing for `emailBudgets.test.ts`.
- **Deferred:** nothing is mounted, so `useBadgePoll`'s listeners and interval have no test beyond its pure rules; M4 mounts it and its journey (B4) proves the cleanup on sign-out and the poll on focus. No `unreadSeeded` caller yet (M4's bell seeds from the server render). Stress run and a second CI-mode run wait for M4 for the same reason.
- **Run:** `pnpm --filter @brunchsters/web exec vitest run src/store/notificationsSlice src/lib/badgePoll src/app/api/v1/notifications`; `CI=true pnpm build && CI=true pnpm test:e2e api-authorization`.

---

## M4 — The bell and the inbox

- [x] `/ui-screen` first: the bell in `TopBar` ("Notifications, N unread", "99+"), `/notifications` (rows as links, "Mark all read", empty state, phone layout), `lib/notificationCopy.ts` (every type, singular/plural, `LocalDateTime` for times, no corporate words), `errorCopy` lines for new codes
- [x] Opening a row marks it read and navigates (best-effort); viewing the page marks nothing
- [x] Journeys B1 (coalescing, unread again, opening a row), B2, B3, B4, B5 (the read routes); axe (D2), layout (D3) and the phone board for the inbox; `screenshots.json` entries
- [x] **Prove the tests can fail:** coalescing removed → B1 fails; the page marking rows read on view → B4 fails; the recheck removed → B3 fails
- [x] Commit: `feat: add the notification bell and inbox (M4)`

**Accessible names changed** (all new; logged in `docs/accessible-names.md`): the bell link "Notifications" / "Notifications, N unread" (in the `Account` navigation), the h1 "Notifications", "Mark all read", the rows (an unread row starts "Unread."), "Show older", and the empty inbox's "Nothing yet." and "Plan a Brunch". **Journeys that change:** new `notifications.spec.ts` (B1 to B4) in the desktop and `mobile` projects; one case each in `accessibility` (D2), `responsive-layout` (D3) and `keyboard-and-motion` (D4); `email-notifications` N4 and `api-authorization` B5 from earlier milestones. **Deployable:** yes.

**Testing notes:**

- **What and how:** 12 copy tests (`notificationCopy`: a line for every kind, exact lines the journeys look for, the bell name and "99+", relative times, no banned words, nothing promised) and 1 slice test for "All caught up."; journeys **B1** (grouped replies and votes; opening a row marks it read and lands on the brunch; viewing marks nothing; news after reading makes it unread again), **B2** (confirmed reaches the member with place and time in the place's zone, the host gets the empty inbox), **B3** (called off and back on; a brunch brought back inside the hold is nowhere), **B4** (mark all read: count at once, a 500 and offline each put it back with a toast, then success with "All caught up."; the poll on the minute and on coming back to the tab, never from a hidden tab, counted by requests sent; each person's own number and the bell gone after sign-out; "Show older"), plus axe in both palettes and at phone width (D2), no sideways scroll with an 80-character name (D3) and a keyboard path that keeps focus on "Mark all read" (D4). Run in the `mobile` project too. Proved to fail: 5 screen mutations, each by the journey meant for it (the button turning `disabled` → D4; the poll ignoring a hidden tab → B4; opening a row not marking it → B1; viewing marking everything read → B1, B2, B3; a read row staying read when news arrives → B1).
- **Fixed on the way:** the bell is in the root layout, above the store, so the **store provider moved to the root layout, keyed by the signed-in person** (ADR 0017 and `apps/web/CLAUDE.md` amended; the key is the guard, and no journey observes the store being dropped on sign-out: Redux follow-up (6) stays). Two of my own journeys survived their mutations and were rewritten: the keyboard check sampled "aria-disabled" while the request was still out, and the hidden-tab check asserted "still zero" before any answer could arrive (the "never appeared" trap again; now it counts the requests sent). Then the poll journey itself raced the server (the first poll was answered after the test added news): it waits for the first answer. The independent reads found: **accessibility review**, a keyboard user pressing "Mark all read" lost focus when the button became `disabled` (fixed: `aria-disabled`, journey D4) and a screen reader got no sign it worked (fixed: an "All caught up." toast); the silent count change on a poll was declined on purpose (a per-minute announcement is noise; the new name is read on focus). **UX copy** (against `docs/voice-and-copy.md`): took "Last call to vote on {title}" for the reminder (was "…is closing") and "Show older" for "Older"; declined the rest, which already name the brunch and the person and promise nothing. **Design critique** was not run; I looked at the review pictures myself (phone and desktop, light and dark).
- **Deferred:** the "Notification settings" link on the inbox (M5 adds the page); a prototype board (the prototype has no notifications scene); a real-phone check (MANUAL-TESTING A1, A7 to A9, H1). The gate: dev-mode e2e failed 4 older journeys while the machine slept (they pass on rerun, 14 of 14) and the B4 poll journey (fixed above); CI mode 302 passed, 2 skipped; the stress run (all journeys three times at 4 workers) 906 passed before the last test-only fix, and the journeys I touched 114 of 114 after it.
- **Run:** `pnpm --filter @brunchsters/web exec vitest run src/lib/notificationCopy src/store`; `CI=true pnpm build && CI=true pnpm test:e2e notifications.spec`.

---

## M5 — Preferences and per-brunch mute

- [x] `PUT notification-preferences` and `PUT brunches/[id]/notification-level` (membership first; `enforceWriteLimit`; coded errors); real and made-up brunch ids identical for an outsider
- [x] `shouldDeliver` wired into the inbox handlers and **all four existing email senders** (and a test that fails when an `emailService.send` caller does not call it); the invite email consults an account's preference by normalized email and is silent on a skip
- [x] `/settings/notifications` (grouped, only types that fire, in-app and email switches) and the brunch page's mute control; footer link in the four emails to the brunch page
- [x] Journeys B5 (the mute and preference routes), B6, B7, B12; the `email-notifications` journeys edited for preferences; axe light and dark, layout, phone board
- [x] **Prove the tests can fail:** bypass `shouldDeliver` in one email sender → B6 fails; let `big_stuff` keep host activity → B7 fails
- [x] Commit: `feat: add notification preferences and per-brunch mute (M5)`

**Accessible names changed** (all new; `docs/accessible-names.md`): the inbox link "Notification settings"; the settings page h1 "Notification settings", "Back to notifications", the h2s "Your brunches", "Reminders", "When you host", and switches named "{line}, in the app" / "{line}, by email"; the brunch page group "Notifications for this brunch" with radios starting "All", "Just big stuff", "Muted". **Journeys that change:** new `notification-settings.spec.ts` (B6, B7, B12; desktop and `mobile`), `api-authorization` (B5 gains the level and preference routes), `accessibility` D2, `responsive-layout` D3 and `keyboard-and-motion` D4 (one case each), `notifications` B4 (sign-out cancels the poll), `email-notifications` N4 earlier. **Deployable:** yes.

**Testing notes:**

- **What and how:** copy tests for the settings lines (every produced type exactly once, email only where an email exists), 3 template tests for the footers, the static guard in `emailBudgets.test.ts` (a file that sends mail without asking `emailAllowed` fails), 11 integration tests on real Postgres (`settings.integration.test.ts`: defaults and saved choices, one switch for several types, refused switches, a person's own level, an outsider and a deleted brunch answered alike, and the four emails against a switched-off email, a muted brunch, "just big stuff", an address with no account and the footer links), 12 route tests (preference and level routes: 401, the write budget first, the session's user, 422s, 500s). Journeys **B6** (email off still gives the row, in-app off still gives the email, the footer carries the way to want fewer; an invitation to an account with the email off is silent while an address with no account still gets it and the host's list shows nothing), **B7** (mute: muted hears nothing, just big stuff keeps the big stuff, the email's link lands on the control; a failed change goes back with a toast; an outsider has no control), **B12** (the settings page: only what the app does, a failed or offline save goes back with a toast, Space flips and keeps the focus), and **B5** extended (the level route in the member table: an outsider cannot tell a real brunch; the preference route refuses nonsense with a code and saves only the caller's own). Axe both palettes and phone width (D2), no sideways scroll (D3), the switch's focus ring (D4). "Was never sent" is observed with `waitForRuns` (the dev server's runs for that event and brunch have all finished), never a sleep. Proved to fail: 6 core/web mutations (everyone allowed, the invite email ignoring the preference, a level change not scoped to the caller, an email switch for a type with no email, the footer losing the mute link, a sender not asking) and 6 end-to-end (the mute control and a switch not going back on failure, a switch `disabled` instead of `aria-disabled`, an outsider's level change succeeding, the focus ring removed, and sign-out not cancelling the poll).
- **Fixed on the way:** (1) **E1 failed**: the confirm dialog's `margin: auto` tied in specificity with the panel's `> :last-child { margin-bottom: 0 }`, so which won depended on stylesheet load order, and adding a component to the brunch page flipped it; now `dialog.dialog:modal`. (2) **A real bug in M3/M4, found by the dev-mode run**: a poll answered after sign-out re-issued the session cookie (A2 failed 8 of 10 in dev mode, 0 of 10 with the poll off); the poll is now cancelled on any form submit and on unmount, with journey B4 holding the poll and signing out, and a rule in `apps/web/CLAUDE.md`. The wider race (any in-flight request) is `docs/BACKLOG.md` Security and session follow-ups (8). (3) Journey harness: a reload straight after a tap cancelled the save (wait for the response), and `waitForQueueIdle` watched every test's runs, so it timed out under load; `waitForRuns` looks only at one event name and brunch, and pages back with the dev server's cursor because its event list is capped at 51 (the cause of 1 failure in about 300 runs). Three long journeys are `test.slow()`. (4) A guard test written by script lost its regex backslashes (`\b` became a backspace character); caught because the file failed to load, and the repo now has no stray control characters.
- **Independent reads:** accessibility: one gap closed (a journey that the switch's focus ring is drawn, since the real input is invisible), nothing else; copy: no changes (the lines name what a choice hides and promise nothing). Design critique not run; I looked at the review pictures (phone and desktop, light and dark).
- **Deferred:** the invite email carries the settings link only (a person who has not joined has no brunch to mute); one-click unsubscribe (`docs/BACKLOG.md`); a real send of the footers (MANUAL-TESTING C4); a real phone.
- **Gate:** typecheck and lint; unit shared 64, core 749, web 754; core integration 201; CI-mode e2e 319 passed, 2 skipped; the stress run (every journey three times, four workers) 957 passed, none failed; dev mode 319 passed after the sign-out fix (it had failed A2 in two earlier dev runs, one of them while the machine slept). The invite-heavy journeys together five times over at four workers: 170 passed.
- **Run:** `pnpm --filter @brunchsters/core test:integration settings`; `CI=true pnpm build && CI=true pnpm test:e2e notification-settings`.

---

## M6 — "An email did not go out"

- [x] `emailFailedAt` set on a rejected address and, via `onFailure`, on exhausted retries; cleared by a successful resend; the host's `invite.email.failed` row (muting ignored); a preference skip writes nothing
- [x] The invite list line "That email didn't go through. Try Resend, or copy the link and send it yourself." with the existing Resend control (`/ui-screen`); `docs/BACKLOG.md` "Silent failures to surface" closed
- [x] Journey B8 (rejected address through the real handler, row and line, resend clears both) and a case in B6 that a preference skip shows the host nothing
- [x] **Ask the owner whether M8 stays in this spec** (asked at the M6 review)
- [x] **Prove the tests can fail:** `onFailure` removed → B8's exhausted-retries case fails; a preference skip counted as failure → B6 fails
- [x] Commit: `feat: tell the host when an invite email did not go out (M6)`

**Accessible names changed:** none renamed; new text on the invite list and a new inbox row (`docs/accessible-names.md`). **Journeys that change:** new `invite-email-failed.spec.ts` (B8; desktop and `mobile`), `accessibility` D2 (one case). **Deployable:** yes.

**Testing notes:**

- **What and how:** 2 unit tests in `sendInviteEmail.test.ts` (a sent or already-sent email clears the flag and the host's rows; a refused address, a provider that is down and a skipped invite leave it), 1 in `getInvitesForBrunch.test.ts` (the flag reaches the list), a static guard in `notificationRecipients.test.ts` (the invite function keeps its `onFailure`, which calls `recordInviteEmailFailed`), and 6 integration tests on real Postgres (`inviteEmailFailure.integration.test.ts`: marks and tells the host once however often it is told, news again after a failed resend, ignores a muted brunch but obeys the host's own switch with the flag kept, writes nothing for a revoked invite, made-up id or deleted brunch, shows only to the host, and clears on a real send while leaving another invite's failure). Journey **B8**: the invite list and the inbox say so, opening the row lands on the list, Resend through the real queue sends the email and takes both back; axe on the line in both palettes and at phone width (D2). The failure itself is seeded with the real service (`failInviteEmail`) because the suite's outbox never refuses; the `onFailure` wiring is covered by the guard, not by an end-to-end failure. A preference skip showing the host nothing is B6 (M5). Proved to fail: the list line removed (B8), the clearing removed (B8), `onFailure` renamed (the guard).
- **Fixed on the way:** the first version of the guard survived the `onFailure` mutation, because a renamed `onFailureX` still contained the word; it now matches `onFailure: async`. A regex escape written through a script again became a backspace character (found by `grep -c`).
- **Correction to the task list:** the line reads "That email didn't go through. Try Resend, or copy the link and send it yourself." (it names the two things the host can do) rather than "Didn't go out"; the exhausted-retries mutation is the guard, not a B8 case.
- **Deferred:** the same signal for the three other emails (`docs/BACKLOG.md`, "Silent failures to surface"); a real rejected address through Resend (MANUAL-TESTING D1).
- **Gate:** typecheck and lint; unit shared 64, core 752, web 755; core integration 207; CI-mode e2e 323 passed, 2 skipped; stress (three times, four workers) 969 passed; dev mode 323 passed. The first gate found two real misses, both fixed: the lifecycle-guard scan wanted a reason for a write that skips the open check (the queue recording a failure on a called-off brunch), and N4 counted 8 queue functions where Inngest registers the onFailure as a ninth.
- **Run:** `pnpm --filter @brunchsters/core test:integration inviteEmailFailure`; `CI=true pnpm build && CI=true pnpm test:e2e invite-email-failed`.

---

## M7 — The scheduler: reminders, completed and pruning

- [ ] Spike first: can a journey invoke the registered Inngest function through the dev server? Record the answer in `plan.md`
- [ ] `findDeadlineReminders`, `completePastBrunches` (take `now`); the cron function and `prune-notifications`; the deadline reminder email (`/limited-surface`: a decision in `emailBudgets.test.ts`, a sender in `SENDERS`)
- [ ] The over rule (`brunch_over`, 409) beside `assertBrunchOpen`, `confirmed → completed` in `BRUNCH_TRANSITIONS`, Bring it back refuses a past confirmed brunch, `errorCopy` line, `lifecycleGuards.test.ts` and `lifecycleErrorMapping.test.ts` cover it; the dashboard and brunch page show "Over"
- [ ] Integration tests: due, not due, already voted, cannot vote, a moved deadline, a deadline set inside the window, a retried run, a racing call off, the first-run flip notifying no one, prune boundaries (59/61 days read, 89/91 unread)
- [ ] Journeys B9 and B10 (as the spike allows); `docs/SETUP.md` and the pre-launch checklist name the new functions to register in Inngest Cloud
- [ ] **Prove the tests can fail:** drop the over rule → B10 fails; remove the voted-exclusion → B9 fails; prune using `createdAt` for unread → its boundary test fails
- [ ] Commit: `feat: add deadline reminders, completed brunches and pruning (M7)`

**Accessible names changed:** none beyond the "Over" status text. **Journeys that change:** the lifecycle journeys, new B9 and B10. **Deployable:** yes (the cron runs once registered).

**Testing notes:** _(fill on completion)_

---

## M8 — Live updates: refresh on focus

- [ ] `useRefreshOnFocus` (pure decision function: visible, ≥15 s since the last, no pending mutation, no dirty ballot, no open dialog); mounted on the brunch page, manage page and dashboard; unit tests for every exclusion
- [ ] The vote-count live region (design-fidelity deferral 6): announces a change the person did not cause, politely; silent for their own tap
- [ ] `docs/BACKLOG.md` "Live updates": the focus refresh and the live region done; Realtime stays an entry with what would settle it
- [ ] Journey B11 (an outside change appears on focus; never with a dirty ballot; the live region); the mobile project; axe
- [ ] **Prove the tests can fail:** drop the dirty-ballot exclusion → B11 fails (the ballot is replaced); announce an own tap → B11 fails
- [ ] Commit: `feat: refresh pages on focus and announce outside vote changes (M8)`

**Journeys that change:** `voting` (the live region), new B11. **Deployable:** yes.

**Testing notes:** _(fill on completion)_

---

## After M8

Run `/pre-merge-review` (the four lenses, lifecycle and docs drift; the owner questions about the pilot's manual list and screenshots), fix `SUMMARY.md`, run `pnpm --filter @brunchsters/web shots:spec 0015`, open the PR (`Implements specs/0015-notifications`), then `/post-merge`.
