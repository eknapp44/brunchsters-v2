# Spec 0015 — Notifications: summary

The one page to read. `spec.md` (with its Outcome section), `plan.md` and `tasks.md` are the working documents behind it.

**Status:** released as v1.13.0 (PR #28, merged 2026-10-31). Branch `feat/0015-notifications` (eight milestones plus review fixes), [ADR 0017](../../docs/adrs/0017-notifications.md).

## What it does, in plain words

- A **bell** in the top bar ("Notifications, 3 unread") and an **inbox** at `/notifications`: what happened on your brunches, newest first. Opening a row marks it read; looking marks nothing.
- The **host** hears about replies, votes and suggestions (grouped, so ten votes are one line), and when an **invite email did not go out**: a row, and a line under that invite on the list ("That email didn't go through. Try Resend, or copy the link and send it yourself.") that goes away when a resend goes.
- **Members** hear when it's on, called off or back on, and get **one "last call to vote"** (row and email) when a deadline is within a day and they have not voted.
- You choose what you get, per kind and per channel, at `/settings/notifications`, and you can **mute one brunch** (all, just big stuff, or muted) from its page. Every email says how to hear less. A switched-off email is silent to the host.
- Pages **refresh when you come back to the tab** (never over a ballot that has not saved, behind a dialog, or just after a form), the bell updates about once a minute, and a screen reader hears when **someone else's vote changes a count**.
- A confirmed brunch is **Over** six hours after its time: read-only everywhere, its own "already happened" answer, no bring-back.

## Decisions you made (and why)

| Decision                                                              | Why                                                                                                                                                 |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Polling and refresh on focus, **no Realtime**                         | Realtime needs a browser login to Supabase, row-level security and a CSP change, for a beta with no proven need                                     |
| A notification is a row a handler writes; words are made at read time | Read state needs a home; times must show in the reader's zone                                                                                       |
| All four existing emails obey preferences; a skip is **silent**       | The host must not learn who opted out                                                                                                               |
| The failed-invite row ignores a muted brunch                          | It is the one thing the host must not miss                                                                                                          |
| The bell stays a **link** (no quick-look panel)                       | A phone has no good dropdown, the inbox is small, and a popover is its own accessibility and design spec ([BACKLOG](../../docs/BACKLOG.md), item 9) |
| M8 (focus refresh) stayed in this spec                                | Asked at M6; small, and live updates are part of what you asked for                                                                                 |

## What changed from the plan

See `spec.md` ("Outcome"). The main ones: the clock is one function (`run-scheduler`, with a `scheduler/tick` event the journeys use), `brunch_over` is its own answer apart from "called off", one extra column (`deadlineReminderSentFor`) so a deadline is reminded once, the reminder says how long is left rather than a clock time, and a refresh or poll in flight at Sign out could bring the session back (found by a journey in dev mode, fixed for the bell and the refresh; the wider case is in the backlog).

## What is not done, and why

Realtime and push; `running late` and `host transferred` (no feature behind them); a day-of reminder; digests; "didn't go out" for the other three emails; a cancellation reason; a one-click unsubscribe; the bell quick-look; the cron schedule itself is untested (it is on the pre-launch checklist); a real screen reader and a real mail client have not been used (MANUAL-TESTING). Each is one entry in `docs/BACKLOG.md`.

## How it was checked

Final gate on the last commit: typecheck and lint; unit shared 64, core 758, web 785; core integration 222 (real Postgres); end-to-end 333 passed in CI mode, 999 in the stress run (every journey three times, four workers) and 333 in dev mode. Journeys B1 to B13 (new) plus edits to A, D, E, N and T journeys; each rule was proved to fail by breaking it (about 40 mutations across the milestones). Two independent reads (accessibility, copy) found five minor and four small items, and a deep code review found six real bugs (a deadline set at creation sent a "last call" minutes after the first invites; a bad scheduler tick ran over every brunch; "Show older" could skip rows; an opt-out left a stale failure line; one failed reminder blocked the rest; a cast): all fixed, each with a test shown to fail without it. A changed vote re-raising a read row follows the spec and is backlog item 13. The screenshots are in `screenshots/` (11 images, under 1 MB).

## Where to look

`specs/0015-notifications/` (this folder), ADR 0017, `packages/core/src/notification/` and `scheduler/`, `apps/web/src/inngest/functions.ts`, `/notifications`, `/settings/notifications`, and the root `CLAUDE.md` ("Notifications go through one decision").
