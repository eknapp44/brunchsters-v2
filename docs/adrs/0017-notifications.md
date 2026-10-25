# 0017 — Notifications: inbox rows written by handlers, preferences and mute, polling instead of Realtime

**Date:** 2026-10-25  
**Status:** Accepted  
**Deciders:** Evan Knapp

## Context

The app tells people almost nothing. Spec 0008 sends four emails (invite, confirmed, called-off, back-on); the host hears nothing when someone replies, votes or suggests; a voting deadline passes in silence; and a host cannot tell that an invitation email never arrived. The schema for the rest has sat unused since the first migration: `Notification`, `NotificationType` (12 seeded codes), `NotificationChannel` (`email`, `in_app`, `push` inactive) and `UserNotificationPreference`.

Reading the code (2026-10-25) showed what the design has to deal with:

- **Few events exist.** Services emit `brunch/created`, `confirmed`, `cancelled`, `reinstated`, `invite/sent`, `invite/resent`, `attendee/rsvp.received`, `attendee/rsvp.changed`, `vote/cast` and `vote/changed`. The suggestion services (`suggestInvitee`, `suggestLocation`, `suggestTime`) emit nothing, nor does anything run on a clock. Only five events reach the queue (`inngest/events.ts`). Of the 12 seeded types, five have a producer today.
- **A mailed invitee has no `userId`** and `Notification.userId` is required. ADR 0009 declined to record sends in `Notification` for that reason and left the inbox to this decision.
- **An email that did not go out leaves no trace.** `sendToRecipient` turns a rejected address into an Ok outcome that lives only in the Inngest run output.
- **There is no Supabase client** in the repo, and sign-in is NextAuth with a JWT. PLANNING §7 and ADR 0002 planned Supabase Realtime, "presence-aware".
- **Times in server-written strings are wrong for most readers.** The server runs in UTC and a person reads in their own zone; the app already learned this once (`LocalDateTime`, journey H8).
- **There is no per-brunch mute column**, and `completed` is never set, so a past brunch still accepts changes (`docs/BACKLOG.md`, Lifecycle deferral 5).

## Decision

**A notification is a row, written by an Inngest handler, one per recipient.** Only `in_app` rows are stored. Email follows the same preferences but is not written to `Notification` (ADR 0009's reasoning stands). Derived banners that are computed on every read (`shouldSuggestClosing`) stay derived; `vote.autoclose.prompted` is not made a row.

- **Content is structured, words are rendered at read time.** A row stores `type`, `brunchId` and a `data` JSON (names, counts, instants). The page words it from `lib/notificationCopy.ts` and shows times with `LocalDateTime`. `title` and `body` are still filled, as a plain-text fallback. A copy change therefore reaches old unread rows.
- **A dedupe key, unique per user,** makes a retried handler write the same row once (for example `rsvp:<brunch>`, `cancelled:<brunch>:<cancelledAt>`, `deadline:<brunch>:<deadline>`).
- **Host-activity rows coalesce.** RSVPs and votes for one brunch are one row ("3 new votes on Sunday") that updates in place and becomes unread again when it changes; suggestions are individual rows. Rows name no one's ballot and no "no" answer (the presentation rules in ADR 0012).
- **Who gets what.** The host gets `rsvp.received`, `vote.cast`, `invite.suggestion`, `location.suggested`, `time.suggested` (in-app only) and `invite.email.failed` (new seeded type). Members get `brunch.confirmed`, `brunch.cancelled`, `brunch.reinstated` (new seeded type) and `vote.deadline.approaching` (a member who can vote and has not). A person who already has an account and is invited gets `invite.received`; a person with no account gets the email only, and nothing is stored for them until they join. `running.late`, `host.transferred` and `vote.autoclose.prompted` stay unproduced (`docs/BACKLOG.md`).
- **Preferences.** `UserNotificationPreference` stays; a missing row means the default (in-app on for everything; email on for the four existing emails and the reminder; off where no email exists). All four existing emails obey the per-type email preference, including the invite email _when the invited address belongs to an account_. A skipped email because of a preference is silent: it is never reported to the host as "didn't go out", so a host cannot learn who opted out.
- **Per-brunch mute** is `BrunchAttendee.notificationLevelId`, a lookup (`all`, `big_stuff`, `muted`), default `all`. It applies to both channels. "Big stuff" is confirmed, called off, back on and the deadline reminder. The host's own "email did not go out" row ignores mute.
- **Host-facing "email did not go out".** `BrunchInvite.emailFailedAt` is set when the address is rejected or retries are exhausted (`onFailure`), cleared by a successful resend, and a host inbox row is written. It covers invite emails only; the other three emails need a recipient-level record and are in `docs/BACKLOG.md`.
- **Live updates are a refresh on window focus plus a poll of the unread count, not Realtime.** A page refreshes with `router.refresh()` when the tab regains focus (at most every 15 seconds, never while the person has an unsaved ballot, a request in flight or a dialog open); the badge polls a cheap count endpoint every 60 seconds while the tab is visible. A vote-count live region announces only a change the person did not cause. Supabase Realtime is deferred.
- **This reverses two plan lines.** PLANNING §7's "presence-aware" delivery is dropped (no presence channel without Realtime; emails were never presence-gated), and ADR 0002's Supabase Realtime is not used in v1. Both docs get a pointer to this ADR in the same commit.
- **A scheduler runs every 15 minutes** (Inngest cron). It writes deadline reminders (24 hours before `votingDeadline`, once per (brunch, member, deadline), nothing if the deadline was set inside the window or the member has voted) and marks a confirmed brunch `completed` once its time has passed by `COMPLETED_AFTER_HOURS` (6, one constant in `packages/shared`). `completed` is read-only like called off (an "over" rule beside `assertBrunchOpen`, code `brunch_over`) and cannot be brought back. The first run flips existing old confirmed brunches quietly: `completed` notifies no one.
- **Retention.** Read rows are deleted after 60 days (PLANNING §9.9), unread after 90, by a daily Inngest function. This is a hard delete, justified: a notification is an ephemeral view of events that live elsewhere, with no audit value; the constitution's soft-delete default is for entities.
- **Every notification endpoint is keyed by the signed-in person**, never by an id they named. A notification id that is not theirs is ignored in the same response as a made-up one. The per-brunch mute checks membership first and answers an outsider with the 404 a made-up id gets.

## Consequences

- **Easier:** a new notification is a typed event, a recipient rule and a copy entry. The inbox, badge, preferences and mute apply to it without more UI.
- **Easier:** the host sees what is happening to a brunch without opening it; "an email did not go out" is finally visible.
- **Harder:** every handler must be idempotent (dedupe key) and every email handler must consult preferences and mute before sending. A test (`notificationRecipients`) asserts that each producing event has a recipient rule, as `emailBudgets.test.ts` does for mail.
- **Harder:** the 15-minute cron cannot be waited for in a journey; its body is a core function that takes `now` and is covered by integration tests (the plan says how the Inngest function itself is driven).
- **Accepted:** with polling, a change by someone else can take up to a minute (badge) or until the next focus (page) to appear. `docs/BACKLOG.md` "Live updates" keeps Realtime open, with what would settle it.
- **Accepted:** a person who switched off the invite email for their account may not see an invitation; the invite link and the in-app row still exist. Presence-aware suppression is gone.
- **Accepted:** the lost-event window of ADR 0009 applies (a lost event is a missed notification). The inbox is a convenience, not a record; an outbox remains a later ADR if that changes.
- New deferrals are entries in `docs/BACKLOG.md`: "Notifications deferrals".

## Alternatives considered

- **Compute the inbox from current state** (no rows). No write path to build or prune, but "read" and "seen" have nowhere to live, and events that leave no state (a vote on an option later removed, a cancelled-then-restored brunch) vanish. Rejected.
- **Supabase Realtime for live updates.** True push, but it needs a Supabase JWT minted for the browser plus row-level security (or a data-less Broadcast channel), a `wss:` origin in the CSP (ADR 0014), and the first Supabase client in the repo, all for a beta that has not yet shown a need. Deferred, not rejected.
- **Frozen title and body only.** Simplest, but a time in the text is wrong for most readers, and a copy fix could not reach existing rows.
- **One row per event for votes and RSVPs.** Literal, but a ten-person ballot writes ten rows and buries the inbox.
- **Make `userId` nullable and key invite rows by email.** Records every send, but weakens the foreign key and the 404 rule; ADR 0009 rejected it.
- **Presence-aware delivery by a last-seen write on every page load.** A new write on a GET path, unreliable across tabs, for a nicety.
