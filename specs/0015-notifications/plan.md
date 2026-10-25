# Plan 0015 — Notifications

Decisions are in [ADR 0017](../../docs/adrs/0017-notifications.md); the behavior is in `spec.md`. This file is the how.

## Files introduced or changed

**`packages/database`**

- `prisma/schema.prisma` and one migration: `Notification.data Json`, `dedupeKey`, `lastEventAt` (not `@updatedAt`: Prisma would bump that on every update, so marking a row read would move it to the top), `@@unique([userId, dedupeKey])`, `@@index([userId, readAt, lastEventAt])`; `NotificationLevel` lookup and `BrunchAttendee.notificationLevelId` (default `all`); `BrunchInvite.emailFailedAt`.
- `src/seed.ts`: the three levels, two new `NotificationType` rows, and a unit-level check that every seeded type has a default.

**`packages/shared`**

- `notifications.ts`: type and level code lists (`as const`, with a `NotificationTypeCode` union), `NOTIFICATION_DEFAULTS`, `BIG_STUFF_TYPES`, retention and timing constants (`COMPLETED_AFTER_HOURS`, `DEADLINE_REMINDER_HOURS`, the two retention days), and the `NotificationData` union per type (the shape of `Notification.data`) with a hand-written reader, `readNotificationData` (`packages/shared` has no Zod, and Zod stays out of browser code).
- `apiError.ts`: new codes (`brunch_over`, and any the routes need).

**`packages/core/src/notification/`** (new; framework-free, Prisma injected)

- `writeNotification.ts` (plain upsert on `(userId, dedupeKey)`) and `coalesceNotification.ts` (increments the count in `data`, bumps `lastEventAt` when the count changes, clears `readAt`, one statement).
- `recipientsFor.ts` (pure rules per type, given the brunch's members and the event), `shouldDeliver.ts` (type + channel + preference default + the person's mute level, **the only place that decides**), `listNotifications.ts`, `countUnread.ts`, `markRead.ts`, `setNotificationLevel.ts`, `preferences.ts`, `pruneNotifications.ts`.
- `reminders.ts`: `findDeadlineReminders({ now })` and `completePastBrunches({ now })`, both taking `now`, both idempotent.
- `email/`: the four senders and the new reminder email each call `shouldDeliver` before `emailService.send`; `sendDeadlineReminderEmail.ts` joins `SENDERS` in `emailBudgets.test.ts`.
- `brunch/guards/assertBrunchOpen.ts` gains the over rule; `BRUNCH_TRANSITIONS` gains `confirmed → completed`; `reinstateBrunch.ts` refuses when the restored status was `confirmed` and its time passed. The suggestion services emit new typed events; `EventBus.ts` gains `suggestion/invite|location|time`.

**`apps/web`**

- `src/inngest/events.ts` and `functions.ts`: handlers `write-notifications-*` per event family, the failed-email `onFailure`, `send-deadline-reminders-and-complete-brunches` (cron `*/15 * * * *`) and `prune-notifications` (daily, next to `prune-rate-limits`). All registered in `functions` (and SETUP's list).
- `src/app/api/v1/notifications/unread-count/route.ts`, `notifications/read/route.ts`, `notification-preferences/route.ts`, `brunches/[id]/notification-level/route.ts`, each with a route test.
- `src/app/(authenticated)/notifications/page.tsx` and `settings/notifications/page.tsx` (Server Components: read through core, format, draw), client islands for "Mark all read" and the switches.
- `src/components/nav/TopBar.tsx` plus `NotificationBell.tsx`: the bell, the badge, the poll.
- `src/store/notificationsSlice.ts` (+ test); `src/lib/notificationCopy.ts` (+ test); `src/lib/useRefreshOnFocus.ts` (the focus + visibility rule, pure decision function unit-tested); `src/lib/errorCopy.ts` lines for new codes.
- The brunch page: a `NotificationLevelControl` (mute), the vote-count live region, and the "Didn't go out" line in the invite list (`InvitePanel`).
- E2E: `e2e/journeys/notifications.spec.ts`, `notification-settings.spec.ts`, factories for notifications and preferences (through the real core services).

## Key design

### The row

```ts
type NotificationData =
  | { kind: 'rsvp.received'; count: number }
  | { kind: 'vote.cast'; count: number }
  | {
      kind: 'brunch.confirmed';
      hostName: string;
      placeName: string;
      scheduledAt: string;
      timezone: string;
    }
  | { kind: 'vote.deadline.approaching'; deadline: string }
  | { kind: 'invite.email.failed'; email: string };
/* … one member per type, ids and facts only, no tokens */
```

`title` and `body` hold plain-text fallbacks written by core (no times). The inbox reads `type` + `data` and words them in `notificationCopy`. **A row never holds an invite token**, as the queue never does (ADR 0009).

### Dedupe keys

`coalesced:<type>:<brunchId>` (replies and votes), `cancelled:<brunchId>:<cancelledAt>`, `reinstated:<brunchId>:<cancelledAt>`, `confirmed:<brunchId>`, `deadline:<brunchId>:<deadlineIso>`, `suggestion:<kind>:<suggestionId>`, `invite-received:<inviteId>`, `email-failed:<inviteId>:<n>` where `n` counts failures, so a second failure after a resend is a new row.

### Who decides delivery

`shouldDeliver({ userId, type, channel, brunchId? })` returns `deliver | skip`, reading, in order: the person's `notificationLevel` for that brunch (`muted` skips; `big_stuff` skips non-big types; the host's `invite.email.failed` ignores it), then their preference row, then `NOTIFICATION_DEFAULTS`. Inbox handlers and email senders both call it. A test lists every `emailService.send` caller and fails if one does not call `shouldDeliver` (a sibling of `emailBudgets.test.ts`).

**The invite email** is checked by looking up a `User` whose normalized email equals the invitee's. No account means the default. A skip returns an Ok outcome `skipped_by_preference` that the failure handler does not treat as a failure (so the host sees nothing). The outcome is not stored.

### The failed-invite signal

`sendInviteEmail` returns `skipped_invalid_address` today and retries `delivery_failed`. Both end up the host's row:

- a rejected address: written in the handler right where the outcome is mapped;
- exhausted retries: the function's `onFailure` writes `emailFailedAt` and the row, reading the event's `inviteId`.

A successful resend (`sendInviteEmail` returning `sent`) clears `emailFailedAt`. The invite list reads `emailFailedAt` through `getInvites`, already host-only.

### The scheduler

One cron function, two steps. `completePastBrunches` runs first (a single conditional `updateMany` on `statusId = confirmed AND scheduledAt + COMPLETED_AFTER_HOURS <= now`, inside the transition table, so a racing "call off" loses cleanly); then `findDeadlineReminders` selects active brunches with `votingDeadline` in `(now, now + 24h]` that were not already inside the window when the deadline was set (it compares `votingDeadline - updatedAtOfDeadline`: see risk below), excludes members who already voted or cannot vote, and writes `deadline:<brunch>:<deadline>` rows plus the email. **Deadline "set inside the window":** the deadline's set-time is not stored. Plan: add `votingDeadlineSetAt` to the migration (`updateVotingDeadline` writes it), so the rule is `deadline - setAt >= 24h`. Recorded as the one extra column.

### How the cron is tested

The core functions take `now` and are covered in integration tests against local Postgres (due, not due, voted, moved deadline, retry replay, racing call off). For the journey (B9, B10) M7 starts with a spike: invoke the registered function through the Inngest dev server's invoke API from Playwright. If that works, the journeys drive the real function; if it does not, the journeys create the due state through the real core services with a past `now`-equivalent (a deadline and a brunch time set in the past through the factories) and call the core function, and the testing note says plainly that the Inngest scheduling itself is unproved (as with `prune-rate-limits`, and on the pre-launch checklist).

### Live updates

`useRefreshOnFocus({ minIntervalMs: 15000 })` is mounted by the brunch page, the manage page and the dashboard. It calls `router.refresh()` on `visibilitychange` (visible) and `focus` unless: a mutation is pending (`mutationsSlice`), a ballot entry is dirty (`ballotsSlice`), a dialog is open, or the last refresh was under 15 seconds ago. The badge hook polls `GET unread-count` every 60 s while visible and on focus. The vote-count live region keeps a `lastOwnTap` flag in the ballot slice: a count change after a refresh the person did not start is announced politely, an own tap is not.

### Order of checks (permission)

- **Notification routes:** session → `enforceWriteLimit` (writes) → parse → act on `where: { userId: caller, ... }`. Never `where: { id }` alone.
- **Mute route:** session → `enforceWriteLimit` → `isBrunchMember` → `assertBrunchOpen` is **not** applied (muting a called-off brunch is harmless and allowed; a decision recorded in the spec) → write.
- **Pages:** `/notifications` and `/settings/notifications` need a session only; nothing in them is keyed by a named id.

### Store (per piece)

- **`notificationsSlice`** (unread count, last poll status, optimistic mark-read): several components read the count (bell, page), and optimistic mark-read has rollback, so it is a slice (ADR 0011). It holds counts and ids, not copies of rows.
- **Preference switches:** each switch is a `useMutation` key with an optimistic local value in the island (`useState`), because only that component reads it.
- **Mute control:** `useMutation` plus local selected value.
- Redux follow-up (3) is closed by this slice.

## Decisions already made

See ADR 0017 and the spec's table; the grill's answers are the content of both. Not decided and recorded as open: spec "Open Questions".

## Copy table (drafts; final wording lands in `notificationCopy.ts` with `/ui-screen`)

| Moment                           | Draft                                                                    | Source / note                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Confirmed                        | "Brunch is on. {place}, {time}. 💕"                                      | adapted from "Brunch on. 💕"; emoji `aria-hidden`                                                              |
| Called off                       | "{Host} called off {title}. No worries — these things happen."           | the shipped called-off line; no reason (no column)                                                             |
| Back on                          | "{title} is back on 🥂"                                                  | the shipped back-on subject                                                                                    |
| Invited (account)                | "{Host} wants you at brunch."                                            | the invite subject, minus the emoji                                                                            |
| Replies (host)                   | "{n} new replies on {title}" / "1 new reply on {title}"                  | Copy Pass "Maya's in" **adapted**: counts only, so no name or "no" leaks                                       |
| Votes (host)                     | "{n} new votes on {title}"                                               | Copy Pass "Tartine's leading" **not adopted** (a leader at write time is stale)                                |
| Suggestion (host)                | "{Name} suggested a spot for {title}" / "a time" / "someone to invite"   | host already sees suggesters                                                                                   |
| Deadline                         | "Voting on {title} closes {time}. You haven't voted yet."                | Copy Pass "⏳ Voting closes in 2h" **adapted** (an absolute time in the viewer's zone; "in 2h" would be stale) |
| Invite did not go out            | "Your invite to {email} didn't go through. Have a look at your invites." | rule 7: no retry promise                                                                                       |
| Empty inbox                      | "Nothing yet. Round up the crew and it'll start talking."                | empty-state pattern: inviting, a verb out                                                                      |
| Quiet nudge ("It's gone quiet…") | —                                                                        | **not adopted** (feature does not exist)                                                                       |
| Over                             | status "Over"                                                            | dashboard display mapping                                                                                      |

Email subjects for the reminder: "{title} closes soon — have you voted?" (final in M7).

## Risks and mitigations

See `spec.md` "Risks". Additional:

- **Handlers writing rows for events the queue still drops.** `QUEUED_EVENTS` is derived from the handler lists; a test fails when a handled event is missing from it (already true) and when a new event has no decision.
- **The `votingDeadlineSetAt` column** is the one addition not in the grill; it exists only to make "set inside the window sends nothing" decidable, and is nullable (existing rows: treated as set long ago).
- **Test cost.** Journeys B1 to B12 run on the real queue; they stay quick by creating state through factories, and the cron journeys avoid sleeping.

## Test strategy

- **Unit (node):** shared lists and defaults; `shouldDeliver` (a table of level × type × preference); `notificationCopy` (every type has a line, banned words, singular/plural); the focus-refresh decision; the slice.
- **Integration (local Postgres):** `writeNotification` replay, coalescing, recipient rules per event, `markRead` only touches the caller, prune retention boundaries, reminders and completion with `now`, the invite-preference skip, failed-invite row and clearing.
- **Route tests:** codes, limits (`routeLimits.test.ts`), real and made-up ids identical.
- **E2E:** B1 to B12 (spec); **proved to fail** with the behavior removed is listed per milestone.
