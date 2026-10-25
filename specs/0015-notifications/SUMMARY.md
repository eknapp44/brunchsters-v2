# Spec 0015 — Notifications: summary

The one page to read. `spec.md`, `plan.md` and `tasks.md` are the working documents behind it. _Skeleton written at the grill (2026-10-25); the pre-merge review finishes it with what actually shipped._

**Status:** grilled, not started. Branch `feat/0015-notifications`, [ADR 0017](../../docs/adrs/0017-notifications.md).

## What it will do, in plain words

- A **bell** in the top bar and an **inbox** page: what happened on your brunches, newest first.
- The **host** hears about replies, votes and suggestions (grouped, so ten votes are one line), and when an **invite email did not go out**.
- **Members** hear when it's on, called off or back on, and get a **nudge before voting closes** if they haven't voted.
- You choose what you get, per kind and per channel (in the app, by email), and can **mute one brunch**.
- Pages **refresh when you come back to the tab**, and the bell updates about once a minute.
- A confirmed brunch whose time has passed becomes **over**: read-only, off the next-up spot.

## Decisions you made (and why)

| Decision                                                                                               | Why                                                                                                                  |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| One spec, eight small milestones; focus refresh last                                                   | The riskiest, most separable part last; asked again at M6 whether it stays                                           |
| A notification is a row a handler writes, with data and words rendered at read                         | Read state needs a home; times must show in the reader's zone                                                        |
| Polling and focus refresh, **no Realtime**                                                             | Realtime needs a Supabase login for the browser, row-level security and a CSP change, for a beta with no proven need |
| Invitees without an account get the email only                                                         | No user to attach a row to; nothing stored until they join                                                           |
| A bad invite address: host row **and** a line on the invite list, with a saved flag                    | The row finds you; the line tells you which person                                                                   |
| All four existing emails obey preferences; a skip is **silent** to the host                            | The host must not learn who opted out                                                                                |
| Host chatter is in-app only, grouped, never names a ballot                                             | Roster privacy rules hold; no inbox flood                                                                            |
| Mute on the brunch page: all / just big stuff / muted                                                  | Where you notice the noise                                                                                           |
| "Over" is read-only, six hours after the time, no bring-back; the first run flips old brunches quietly | Closes the old "past brunch still accepts changes" gap                                                               |
| Presence-aware delivery dropped                                                                        | Cannot know who is watching without a live channel                                                                   |

## What changed from the plan

_(filled at the pre-merge review)_

## What is not done, and why

Realtime and push; `running late` and `host transferred` (no feature behind them); a day-of reminder; digests; "didn't go out" for the other three emails; a cancellation reason; a one-click unsubscribe. Each is one entry in `docs/BACKLOG.md` "Notifications deferrals".

## How it was checked

_(filled at the pre-merge review: unit and integration counts, journeys N1 to N12 and what each was proved to fail without)_

## Where to look

`specs/0015-notifications/` (spec, plan, tasks, manual testing), ADR 0017, `packages/core/src/notification/`, `apps/web/src/inngest/`, `/notifications` and `/settings/notifications`.
