# Tasks 0013 — Brunch Lifecycle

Seven milestones, each green on its own and ending in a commit. Branch: `feat/0013-brunch-lifecycle`, cut from `main` (no stacking). Close each milestone with `/milestone-done`, then **stop for the owner's review** before the next. Every milestone runs `pnpm typecheck && pnpm lint && pnpm test`, and `pnpm test:e2e` whenever it touches anything a user sees or does. Re-verify each milestone's "journeys that change" list with a grep at its start; the grep wins over the list. Use `/limited-surface` at M4 and M5 and `/ui-screen` at M6.

The order proves the risky parts early: the guard that stops a called-off brunch taking changes (M2) and the status races (M3) come before any route, email or screen.

---

## M1 — Schema and docs

- [ ] Commit this spec folder, ADR 0015 (with the README index row) and the `PLANNING.md` edits as one docs-only commit, before any code
- [ ] Schema: `Brunch.cancelledAt`, `cancelledBy`, `statusBeforeCancelId`, `cancelNoticeSentAt`; `BrunchAttendee.hiddenAt`; migration generated and committed with the schema; apply on the dev and e2e databases
- [ ] Verify there are no rows with `archivedAt` set or a `cancelled`/`archived` status (so no data migration); record the result
- [ ] Prisma comments: `archivedAt`/`archivedBy`/`cancellationJobId` unused (ADR 0015); `PLANNING.md` §8 notes the new columns
- [ ] `packages/shared/src/brunchLifecycle.ts` constants (`CANCEL_NOTICE_HOLD_SECONDS`, `PAST_BRUNCHES_SHOWN`)
- [ ] Commit: `feat: add the brunch lifecycle columns (M1)`

**Journeys that change:** none. **Deployable:** yes (nullable columns).

**Testing notes:** _(fill on completion)_

---

## M2 — The status table and the open guard

- [ ] `BRUNCH_TRANSITIONS` + `assertCanTransition`; unit test: every seeded status has a row (derived from `BRUNCH_STATUSES`), each listed move allowed, every other refused
- [ ] `assertBrunchOpen` (+ `loadOpenBrunch` for member services that load no brunch); unit tests for cancelled, completed, archived and open
- [ ] Read every service named in `plan.md` and record whether it already refused a cancelled brunch; apply the guard after the membership check in each; map `brunch_called_off` where errors are mapped
- [ ] `respondToInvite` refuses a called-off brunch before creating anything; `getInviteByToken` gains `isCalledOff`
- [ ] `sendInvites` (draft→active) and `confirmBrunch` call `assertCanTransition` and use a conditional status update inside the transaction
- [ ] `lifecycleGuards.test.ts`: every mutating service in `brunch/` and `invite/` calls `assertBrunchOpen` or is in the exemption list with a reason
- [ ] Tests: each guarded service refuses a brunch set to `cancelled` directly in the test database (the service is exercised, not just the guard)
- [ ] **Prove the tests can fail:** remove the guard from `updateRsvp` → the static test and its service test fail; remove the conditional update from `confirmBrunch` → the stale-status test fails
- [ ] Commit: `feat: add the brunch status table and refuse changes to a called-off brunch (M2)`

**Journeys that change:** none expected (nothing can cancel yet). **Deployable:** yes.

**Testing notes:** _(fill on completion)_

---

## M3 — The lifecycle services and the dashboard read

- [ ] `cancelBrunch` (order of checks in `plan.md`; budget policy `cancelNoticesPerHost` in `rateLimits.ts`; emits `brunch/cancelled`, typed in `EventBus.ts`, with no handler yet)
- [ ] `reinstateBrunch` (emits `brunch/reinstated`), `deleteBrunch`, `setBrunchHidden`
- [ ] `getBrunchesForUser` (`isHidden`, `isCalledOff`), `groupDashboard` (hidden list, hidden brunches out of next-up/upcoming/past), `limitPast`; `getBrunchById` exposes `isCalledOff`
- [ ] Unit tests per service (404/403 order, state conflicts, over brunch, budget refused writes nothing); integration tests on real Postgres: cancel then every member write refused; bring back restores status, confirmed flags, votes and RSVPs untouched; cancel racing confirm has one winner (**E11**); delete only draft/cancelled and old links go cold; hide is per person
- [ ] **Prove the tests can fail:** drop the conditional update in `cancelBrunch` → the race test fails; clear `confirmed` flags in cancel → the restore test fails; filter on the host's hiddenAt instead of the viewer's → the per-person test fails
- [ ] Commit: `feat: add call-it-off, bring-it-back, delete and hide services (M3)`

**Journeys that change:** none yet (no routes). **Deployable:** yes.

**Testing notes:** _(fill on completion)_

---

## M4 — The routes

- [ ] `POST brunches/[id]/cancel`, `POST brunches/[id]/reinstate`, `DELETE brunches/[id]`, `PUT brunches/[id]/hidden`; each: session, `enforceWriteLimit(session.user.id)` before the body is read, id check, service, the status map (401/404/403/409/422/429)
- [ ] Handler tests for each; `routeLimits.test.ts` passes (it must fail first, proving it sees the new routes)
- [ ] **E9** added to `api-authorization.spec.ts`: real and made-up ids indistinguishable for an outsider on all four routes, member non-host gets 403 on the three host routes, deleted brunch 404 for all
- [ ] **E10**: through the real routes, every member write returns 409 on a called-off brunch (RSVP, vote, suggestion, resend) and reads still work
- [ ] `/limited-surface`: confirm `cancelNoticesPerHost`'s number and keying; the route maps `rate_limited` to 429 with `Retry-After`
- [ ] **Prove the tests can fail:** remove `enforceWriteLimit` from one route → `routeLimits.test.ts` fails; return 403 instead of 404 for an outsider on `/cancel` → E9 fails
- [ ] Commit: `feat: add the brunch lifecycle routes (M4)`

**Journeys that change:** `api-authorization.spec.ts` (E9 added); E10 new. **Deployable:** yes (no UI calls them yet).

**Testing notes:** _(fill on completion)_

---

## M5 — The cancel and back-on emails

- [ ] Shared recipient resolver extracted from `resolveConfirmationRecipients` (confirmation behavior unchanged; its tests stay green)
- [ ] Templates, `sendCancelledEmail`, `sendBackOnEmail`, keys including `cancelledAt`; copy from the Brand Voice; unit tests for rendering, escaping, links, skips
- [ ] Inngest functions (hold, re-read, stop conditions, per-recipient steps, `mark-sent`; back-on only when the notice went out) registered in `functions.ts`; `events.ts` lists the two events
- [ ] `emailBudgets.test.ts`: `brunch/cancelled` budgeted (spent before the emit), `brunch/reinstated` bounded with its reason, the two senders listed
- [ ] Integration tests: a cancel inside the hold sends nothing; after the hold the right people (not the host, not a "no", not a removed attendee, not a revoked invite) get mail; a re-cancel after a bring-back sends once for the new cancellation; the back-on goes only when a notice was sent
- [ ] `/real-send-check` for both templates to the owner's own inbox (asks first)
- [ ] **Prove the tests can fail:** skip the re-read after the sleep → the "brought back inside the hold" test fails; drop `cancelledAt` from the key → the second-cancel test fails
- [ ] Commit: `feat: email people when a brunch is called off or brought back (M5)`

**Journeys that change:** none (emails are asserted in M7 through the mailbox). **Deployable:** yes; pre-launch checklist in `PLANNING.md` §17 gains "confirm the two new functions are registered in Inngest Cloud".

**Testing notes:** _(fill on completion)_

---

## M6 — The screens

Use `/ui-screen`: list the accessible names and journeys a change touches before editing.

- [ ] Manage page: "End of the road" section and confirm dialogs (primitive reused or added in `components/ui/`, keyboard and focus rules, safe default); called-off view of the manage page
- [ ] Brunch page: called-off banner, read-only (RSVP, vote, suggest controls absent), Hide / Unhide
- [ ] Invite page: called-off card for signed-in and signed-out visitors before `respondToInvite`
- [ ] Dashboard: "Called off" badge, Past cap with "Show all", "Hidden (n)" section/link including in the empty state, summary and next-up ignore hidden brunches; Hide on each row and the next-up card from `40rem` up (absent on a phone), Unhide on the Hidden list at every width
- [ ] 429 wait on Call it off through `useWait`/`limitedMessage`; no browser storage
- [ ] Phone board for the end section, the dialog, the banner and the dashboard with Hidden; axe on every new state (light and dark); copy table checked against the Brand Voice
- [ ] Update every existing journey broken by the Past cap or the badge text (grep first); `brunchCopy.test.ts` updated
- [ ] Docs: `apps/web/CLAUDE.md` (new names, the dialog), root `CLAUDE.md` (status table and open-guard rule), skills if this spec taught them something
- [ ] Commit: `feat: add the lifecycle controls, banners and hidden list (M6)`

**Journeys that change:** the dashboard journeys (access-and-dashboard, design-fidelity, responsive-layout, `support/dashboard.ts`), invitations-invitee, the screenshot boards. **Accessible names:** added and changed per the spec. **Deployable:** yes.

**Testing notes:** _(fill on completion)_

---

## M7 — The journeys

- [ ] Factories wrapping the real core services (`cancelBrunchAs`, `hideBrunchAs`); no Prisma shortcut to a state the app cannot reach
- [ ] **E1 to E8** in `brunch-lifecycle.spec.ts` (each user and brunch its own; multi-identity throughout); the mailbox asserts the notice, the no-notice inside the hold, and the back-on
- [ ] Stress run: `--workers=4 --repeat-each=3`; dev mode and CI mode (`CI=true pnpm build && CI=true pnpm test:e2e`)
- [ ] **Prove the tests can fail:** each journey's key assertion fails with the matching fix removed (list in the notes)
- [ ] Spec status set to complete; `PLANNING.md` roadmap step 2 ticked with the release to come; `/pre-merge-review` before the PR
- [ ] Commit: `test: add the brunch lifecycle journeys (M7)`

**Journeys that change:** none beyond M6. **Deployable:** yes.

**Testing notes:** _(fill on completion)_
