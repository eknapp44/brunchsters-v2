# Spec 0008 — Email Notifications (Inngest + Resend)

**Status:** Complete (merged, PR #12, released as v1.6.0)  
**Branch:** `feat/0008-email-notifications`  
**PLANNING.md ref:** §7 Notifications, §10 Async Event Architecture, §16 Build Order #8, §17 Open Questions  
**ADRs:** [0009 — Inngest-backed EventBus, emit after commit, config-selected adapters](../../docs/adrs/0009-inngest-event-bus-and-email-delivery.md)

---

## What

Make Brunchsters tell people things. Today a host invites friends by copying a link out of the app and pasting it into a text message, and nobody learns that a brunch was confirmed unless they open the app. The `EventBus` the services already emit through does nothing (`NoopEventBus`), which was the plan until a queue existed (specs 0003–0005).

This spec wires the real queue (Inngest) and the real email provider (Resend) and ships **the two emails the core flow cannot work without**:

1. **Invite received** — the invitee gets an email with their personal link.
2. **Brunch confirmed** — the host and everyone who has not declined learn the confirmed place and time.

Nothing else sends mail yet. With no preferences UI, every email is on for everybody, so the first slice sends only what the flow needs (Constitution 2 and 5). The in-app inbox, per-type preferences, per-brunch mute, realtime, deadline reminders and host-facing emails (RSVPs, suggestions, the 66% close-voting nudge) are the follow-up spec (0009).

Grounded in the current code:

- Nine services emit events after their transaction commits, with untyped payloads; `NoopEventBus` is constructed inline in 11 route/page files.
- `sendInvites` emits `invite/sent` for new **and** revived invites; `resendInvite` emits `invite/resent`; both rotate the token. `reviewInviteSuggestion` also emits `invite/sent` when the host approves a suggestion.
- `confirmBrunch` emits `brunch/confirmed` once (only an `active` brunch can be confirmed) and, in the same transaction, extends every live invite's `tokenExpiresAt` to a week past the confirmed time — so the invite link in a confirmation email keeps working. `getInviteByToken` accepts any brunch status as long as the token has not expired.
- An invitee who has never signed in has a `BrunchInvite` but no `User` and no `BrunchAttendee`, so email is the only channel that can reach them.
- `inngest` and `resend` are not dependencies; `EmailService` exists as an interface only (no implementation, no mock). `.env.example` already lists the three keys.
- `middleware.ts` returns 401 for every `/api/*` path that is not whitelisted.

---

## User flows

### Host invites people (wizard, "Invite more people", or approving a suggestion)

1. Host submits email addresses; invites are created exactly as today and the response returns immediately
2. For each invite, an event is queued; the host does not wait for delivery
3. Each invitee receives an email: who invited them, the brunch title, the host's description if any, a button to the invite page, and when the link expires
4. The invite link in the email is the same page the host's copy-link opens; an invitee who is not signed in is taken through sign-in and back (unchanged)

### Host resends an invite

1. Host clicks resend (or re-invites an address already invited — the revive path); the token is rotated as today
2. The invitee receives a new email with the new link. The link in any earlier email stops working (unchanged behavior, now visible to the person)

### Host confirms the brunch

1. Host picks a place and time and confirms; the response returns immediately
2. Everyone **who has not declined** receives one email: the host, every attendee whose RSVP is not "no", and every invited person who never created an account (they have no RSVP, so they have not declined). It names the confirmed place and address, shows the time in the **brunch's local timezone**, and links to the brunch (signed-up people) or to the invite page (people without an account)
3. Anyone who declined, anyone whose invite was revoked, and anyone who left gets nothing

### Failure and edge cases

- Resend is down or the address bounces: the handler retries with backoff; permanent failures are not retried: an invalid address fails an invite run once, while a confirmation run records that recipient as skipped (`skipped_invalid_address`) and carries on with everyone else. Both show in the Inngest run output, and a failure to reach the queue at all is logged by the event bus. The brunch flow is never affected
- The invite is revoked or the token is rotated before the queued email runs: the handler sends nothing for a revoked invite and always uses the **current** token
- The same event is delivered twice: one email is sent
- Local development with no Resend key: the email is written to a local outbox folder as a JSON file instead of being sent

---

## Acceptance Criteria

### Events and wiring (`packages/core`, `apps/web`)

- [x] `BrunchEventPayloads` maps each emitted event name to its payload type; `eventBus.emit` is generic over it; names with no producer are removed from the union; all nine emit sites and every test mock compile against the types
- [x] A single composition root in `apps/web/src/lib/` provides the `EventBus` (and the `EmailService` for handlers); no route or page constructs a bus inline
- [x] `InngestEventBus` (in `apps/web/src/adapters/`) implements `EventBus`; selected when `INNGEST_EVENT_KEY` or `INNGEST_DEV` is set, otherwise `NoopEventBus`; it forwards only events some function handles (one list in `apps/web/src/inngest/events.ts`) and drops the rest before any network call, and it logs a failed send before re-throwing it
- [x] `POST/GET/PUT /api/inngest` serves the registered functions; it is public in `middleware.ts`, and an unsigned request is refused when the app runs in production mode
- [x] A production deployment (`VERCEL_ENV=production`; not `NODE_ENV`, which CI's production build also sets) missing `AUTH_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `INNGEST_EVENT_KEY` or `INNGEST_SIGNING_KEY` fails at server start with a message naming the variable (a silent no-op in production is the worst failure mode)

### Email layer

- [x] `ResendEmailService` implements `EmailService` (maps provider errors to `EmailError`; passes an idempotency key); `FileEmailService` writes one JSON file per email (to, subject, html, createdAt) into `EMAIL_OUTBOX_DIR` (default `.mail-outbox/`, git-ignored); `MockEmailService` in `packages/core` records sends for tests
- [x] `SendEmailInput` gains an optional `idempotencyKey`; `from` defaults to the `EMAIL_FROM` setting
- [x] Templates are pure functions in `packages/core`; every user-supplied value (brunch title, description, host name, place name and address) is HTML-escaped, and subject lines have control characters/newlines stripped

### Handlers (`packages/core`, thin Inngest wrappers in `apps/web`)

- [x] `sendInviteEmail`: triggered by `invite/sent` and `invite/resent`; loads the live invite, brunch, host and **current token** by id; skips (returns a reason) when the invite or brunch is gone or the invite is revoked or expired; sends one email with idempotency key `invite:{inviteId}:{sha256(token) prefix}`
- [x] The confirmation handler (`resolveConfirmationRecipients` and `sendConfirmationEmail`): triggered by `brunch/confirmed`; resolves recipients as above; one `step.run` per recipient so one failure retries only that email; idempotency key `confirmed:{brunchId}:{recipientKey}`
- [x] Delivery failure throws (Inngest retries); invalid address is non-retriable (for confirmations a rejected address is recorded as `skipped_invalid_address` and the run continues)
- [x] The synthetic host invite never receives an invite email
- [x] Unit tests with `MockEmailService` for every branch above; integration tests (real Postgres) for recipient resolution including a decliner, a revoked invite, a silent no-account invitee, a rotated token, and the host

### API routes

- [x] `sendInvitesRequestSchema` rejects a request with more than 50 addresses (422, clear message); this bounds the email fan-out and is not an attendee cap
- [x] No route's request or response changes. Existing handler tests pass against the typed bus

### UI

- [x] The creation wizard's invitee step (step 4) stops at 50 addresses, disables adding and says where to invite the rest, because it sends the whole list in one request and ignores the response (found in review after M3; its own `fix:` commit). The invite panel's copy-link stays; email is additive.

### E2E Journeys

See the section below.

### Docs

- [x] `docs/SETUP.md`: running the Inngest dev server, the local outbox, env vars, and a step-by-step **verifying a sending domain in Resend** walkthrough; `.env.example` updated (`EMAIL_FROM`, `EMAIL_OUTBOX_DIR`, `INNGEST_DEV`)
- [x] `PLANNING.md` §7, §10, §16 updated (event list, build order #8 split into 0008/0009, `vote.autoclose.prompted` note)
- [x] ADR 0009 and the README index row
- [x] Testing notes per milestone in `tasks.md`

---

## E2E Journeys

The suite runs the **real Inngest dev server and the real handlers**; the only substitution is the final hop to Resend, replaced by `FileEmailService` through configuration (ADR 0009). Tests read emails from the outbox folder. The journey IDs continue spec 0006/0007's numbering.

| ID     | People                                                | What is asserted                                                                                                                                                                                                                                                                                                    |
| ------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **N1** | Host, invitee                                         | Host invites an address through the UI; one email addressed to it appears; following its link as the invitee lands on that brunch already "going" and the host sees it. A second case: an address with no account gets the email and its link is the signed-out preview page                                        |
| **N2** | Host, invitee                                         | Host resends; a second email arrives; the **first** email's link no longer works (invite page shows the invalid-link state) and the second one does — the token-rotation regression, now from the person's side                                                                                                     |
| **N3** | Host, attendee who said yes, decliner, silent invitee | Host confirms; the host, the attendee and the silent (no-account) invitee each get exactly one email naming the place and the time in the brunch's timezone; the decliner gets none; the silent invitee's link still opens the invite page after confirm                                                            |
| **N4** | Unauthenticated visitor                               | `/api/inngest` is reachable without a session (the middleware lets it through to the Inngest SDK) and reports both functions registered. The e2e server runs Inngest in dev mode, which does not enforce signatures, so **refusal of unsigned requests is proven in cloud mode by the route's unit test**, not here |

A fifth journey, **C2 (50-address cap)**, was added after M3 in `create-brunch.spec.ts`: the wizard's invitee list stops at 50 with an explanation, removing one frees a slot, and all 50 are invited. N1–N3 are multi-person flows; N2 is the historic-bug class (stale token). "Revoked before the queued email runs" is deliberately **not** an e2e journey: whether the handler runs before or after the revoke is a race, so it is proven deterministically at the integration level (real Postgres, handler called directly). No client-side behavior changes, so no optimistic-update journeys apply.

---

## What This Spec Does Not Cover

- The in-app notification inbox, `Notification` rows, `UserNotificationPreference` and per-brunch mute (spec 0009)
- Realtime / presence-aware notifications (Supabase Realtime is not wired anywhere yet)
- Emails to the host for RSVPs, votes, option or invite suggestions, and the 66% close-voting nudge; deadline-approaching reminders (these need scheduled jobs)
- Cancel-with-5-second-undo, running-late and host transfer: the services and UI do not exist yet, so they are their own feature specs (their notification types stay seeded and unused)
- An attendee/brunch size cap (the 50-addresses-per-request limit above is only an input guard; the real cap is a separate feature, logged in PLANNING §17)
- A transactional outbox (ADR 0009 — accepted risk of a rare lost event)
- Bounce/complaint webhooks, unsubscribe links, email rate limiting
- Calendar attachments (`.ics`) and the Google Calendar chip
- Internationalized email copy (ADR 0005)
- Verifying a real sending domain (documented in `SETUP.md`; sandbox sender until then)

---

## Open Questions

1. ~~**Resend sandbox limit.**~~ **Resolved.** `mail.brunchsters.com` was verified in Resend in October 2026 and real invite and confirmation emails were sent and received; verifying a domain changed only configuration (`EMAIL_FROM`), as predicted. The sandbox limit still applies to anyone running the code without a verified domain (see `SETUP.md`).
2. **Large brunches.** Confirmation fans out one step per recipient. Brunch size is not capped anywhere today; if a brunch ever has hundreds of invitees the function may need batching. Not designed for now.
3. **Exact Inngest dev-server flags and SDK dev-mode detection** are verified against the pinned versions in M3/M4 rather than assumed here.
