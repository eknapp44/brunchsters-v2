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

- [ ] `GET notifications/unread-count`, `POST notifications/read`; each returns coded errors; made-up and foreign ids get the same response; the read route spends `enforceWriteLimit` right after the session check (`/limited-surface` recorded)
- [ ] `notificationsSlice` (count, poll status, optimistic `markRead` with rollback, release on unmount), selectors beside it; thunk tests (ok, coded failure, network, late result ignored)
- [ ] `useBadgePoll`: 60 s while visible, once on focus, silent on failure; the decision is a pure function with unit tests
- [ ] The API-authorization journey gains the two routes
- [ ] **Prove the tests can fail:** the read route filtering by id only → the foreign-id test fails; the poll running while hidden → its unit test fails
- [ ] Commit: `feat: add the notification routes, store slice and badge poll (M3)`

**Accessible names changed:** none yet (the bell arrives in M4). **Journeys that change:** `api-authorization`. **Deployable:** yes.

**Testing notes:** _(fill on completion)_

---

## M4 — The bell and the inbox

- [ ] `/ui-screen` first: the bell in `TopBar` ("Notifications, N unread", "99+"), `/notifications` (rows as links, "Mark all read", empty state, phone layout), `lib/notificationCopy.ts` (every type, singular/plural, `LocalDateTime` for times, no corporate words), `errorCopy` lines for new codes
- [ ] Opening a row marks it read and navigates (best-effort); viewing the page marks nothing
- [ ] Journeys B1 (coalescing, unread again, opening a row), B2, B3, B4, B5 (the read routes); axe (D2), layout (D3) and the phone board for the inbox; `screenshots.json` entries
- [ ] **Prove the tests can fail:** coalescing removed → B1 fails; the page marking rows read on view → B4 fails; the recheck removed → B3 fails
- [ ] Commit: `feat: add the notification bell and inbox (M4)`

**Accessible names changed:** new bell, "Notifications" heading, "Mark all read". **Journeys that change:** `access-and-dashboard` (the bar), new `notifications.spec.ts`. **Deployable:** yes.

**Testing notes:** _(fill on completion)_

---

## M5 — Preferences and per-brunch mute

- [ ] `PUT notification-preferences` and `PUT brunches/[id]/notification-level` (membership first; `enforceWriteLimit`; coded errors); real and made-up brunch ids identical for an outsider
- [ ] `shouldDeliver` wired into the inbox handlers and **all four existing email senders** (and a test that fails when an `emailService.send` caller does not call it); the invite email consults an account's preference by normalized email and is silent on a skip
- [ ] `/settings/notifications` (grouped, only types that fire, in-app and email switches) and the brunch page's mute control; footer link in the four emails to the brunch page
- [ ] Journeys B5 (the mute and preference routes), B6, B7, B12; the `email-notifications` journeys edited for preferences; axe light and dark, layout, phone board
- [ ] **Prove the tests can fail:** bypass `shouldDeliver` in one email sender → B6 fails; let `big_stuff` keep host activity → B7 fails
- [ ] Commit: `feat: add notification preferences and per-brunch mute (M5)`

**Accessible names changed:** new switches, the mute control and its three options, "Notification settings". **Journeys that change:** `email-notifications`, `api-authorization`, new `notification-settings.spec.ts`. **Deployable:** yes.

**Testing notes:** _(fill on completion)_

---

## M6 — "An email did not go out"

- [ ] `emailFailedAt` set on a rejected address and, via `onFailure`, on exhausted retries; cleared by a successful resend; the host's `invite.email.failed` row (muting ignored); a preference skip writes nothing
- [ ] The invite list line "Didn't go out" with the existing Resend control (`/ui-screen`); `docs/BACKLOG.md` "Silent failures to surface" closed
- [ ] Journey B8 (rejected address through the real handler, row and line, resend clears both) and a case in B6 that a preference skip shows the host nothing
- [ ] **Ask the owner whether M8 stays in this spec**
- [ ] **Prove the tests can fail:** `onFailure` removed → B8's exhausted-retries case fails; a preference skip counted as failure → B6 fails
- [ ] Commit: `feat: tell the host when an invite email did not go out (M6)`

**Accessible names changed:** new invite-line text "Didn't go out". **Journeys that change:** `invitations-host`, new B8. **Deployable:** yes.

**Testing notes:** _(fill on completion)_

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
