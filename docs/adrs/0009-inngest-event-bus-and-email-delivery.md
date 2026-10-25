# 0009 — Inngest-backed EventBus, emit after commit, config-selected adapters

**Date:** 2026-10-11  
**Status:** Accepted  
**Deciders:** Evan Knapp

## Context

Constitution 12 says the API handles the transaction and side effects go to a queue. Until now that was honored by an `EventBus` interface whose only implementation, `NoopEventBus`, does nothing. Nine services call `eventBus.emit(...)` after their transaction commits (create, confirm, invite sent/resent, RSVP received/changed, vote cast/changed); the payloads are untyped (`Record<string, unknown>`); and `NoopEventBus` is constructed inline in eleven route and page files, so there is no single place to swap an implementation. Invites work only because the host copies a link by hand.

Spec 0008 delivers the first real consequences (an email to a new invitee; an email to everyone when the brunch is confirmed). That forces four decisions that a future reader would otherwise find surprising:

1. How events reach the queue, and what happens if that fails.
2. How a handler that runs twice avoids sending two emails.
3. Which implementations run in local dev, in CI, and in production, without test-only seams in production code (CLAUDE.md — E2E rules).
4. Where the code lives so `packages/core` stays framework-agnostic.

## Decision

**Emit after commit, no outbox.** Services keep the current pattern: commit the database transaction, then `await eventBus.emit(...)` inside a `try/catch` that swallows the error. If the process dies, or Inngest is unreachable, between commit and emit, that one event is lost. Accepted: the host can already resend an invite, and a lost confirmation email is an annoyance, not a data-integrity problem. A transactional outbox can be added later behind the same `EventBus` interface without touching callers.

**Typed events.** `BrunchEventName` becomes a map of name → payload type (`BrunchEventPayloads`) and `emit` is generic over it. Names with no producer yet (`invite/expired`, `vote/deadline.*`, `brunch/cancelled`, `notification/email.send`) are removed from the union until a spec adds a producer.

**Business logic in core, wiring in the app.** The decision "who gets what email" (recipient resolution, templates, skipping revoked invites) is plain functions in `packages/core` taking an injected `EmailService` and database. `apps/web` holds only adapters and wiring: `InngestEventBus`, thin Inngest function wrappers, `ResendEmailService`, `FileEmailService`, the `/api/inngest` route, and one composition root (`apps/web/src/lib/`) that replaces the eleven inline `new NoopEventBus()` calls.

**Idempotency without a table.** Handlers run at least once. The send is its own `step.run` (Inngest memoizes a completed step across retries), and the Resend call carries an `Idempotency-Key` derived from the invite id and a hash of the current token (never the token itself), or from the brunch id and the recipient for confirmations. No schema change.

**Duplicates and rejected addresses are outcomes, not failures.** If Resend refuses a repeat with `409 invalid_idempotent_request` (the same key with a different body, which happens when an invite's expiry moved at confirmation and the event is replayed), the adapter maps it to `already_sent` and the handlers finish with `skipped_duplicate`: the email already went, and retrying can only repeat the 409. A permanently rejected recipient in a confirmation run is recorded as `skipped_invalid_address` so it cannot end the run for the people after them. Found by replaying an event against real Resend, not by the automated suite.

**Handlers read the database; payloads and queue state carry only ids.** What Inngest stores (event data and each step's output, including in Inngest Cloud) must never hold a secret: the confirmation run lists its recipients in a stored step, so an invitee's invite-page link is represented by the invite's id and the token is read from the database in the step that sends the email.

**Only events that have a handler reach the queue.** The functions subscribe through one list (`apps/web/src/inngest/events.ts`) and `InngestEventBus` drops every other event before the network call, so votes, RSVPs and brunch creation cost the request nothing until something consumes them. `sendInvites` emits its events in parallel for the same reason.

Why handlers read the database: an event can arrive after the invite was revoked or its token rotated, so the handler loads the live invite and its current token at send time and skips when the invite is gone.

**Adapters are selected by configuration, never by test flags.**

| Setting                                                           | `EmailService`                                                         | `EventBus`        |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------- |
| `RESEND_API_KEY` set                                              | `ResendEmailService`                                                   | —                 |
| `RESEND_API_KEY` unset                                            | `FileEmailService` (writes one JSON file per email into an outbox dir) | —                 |
| `INNGEST_EVENT_KEY` or `INNGEST_DEV` set                          | —                                                                      | `InngestEventBus` |
| neither set                                                       | —                                                                      | `NoopEventBus`    |
| `VERCEL_ENV=production` with any of the required settings missing | startup fails                                                          | startup fails     |

"Production" means a deployment (`VERCEL_ENV=production`), not `NODE_ENV=production`: CI and the e2e suite serve a production _build_ with `next start`, which is not a deployment and must not need Resend or Inngest keys. The check runs in `instrumentation.ts`, which Next executes once at server start, so a misconfigured deployment fails to start with the missing variable named; the adapters themselves are built on first use so `next build` needs no keys.

`FileEmailService` is a real local-development feature (it lets you see the invite link without any account) and it is also how the e2e suite reads emails across the process boundary. E2E runs the real Inngest dev server and the real handlers; the only thing it substitutes is the final network hop to Resend, chosen the same way local dev chooses it.

## Consequences

- Easier: every future notification is one typed event plus one handler; swapping Inngest or Resend touches one adapter and the composition root.
- Easier: the e2e suite can prove "invite → email → working link → invitee joins" through the real queue and handlers.
- Harder: CI gains a second long-running process (the Inngest dev server) for the e2e job.
- Accepted risk: an event can be lost between commit and emit (see above). Becomes real work only if a notification ever becomes mandatory rather than convenient (for example a legally required notice), at which point an outbox ADR supersedes this one.
- The `/api/inngest` route must be public (signed requests only): `middleware.ts` currently 401s every unlisted `/api/*` path, so it gets an explicit allowance and a test that an unsigned request is refused in production mode.
- Resend delivers only to the account owner's address until a sending domain is verified. The code does not change when the domain is added; `EMAIL_FROM` does. (Verified in practice in October 2026 with `mail.brunchsters.com`.)

## Alternatives considered

- **Transactional outbox** (an `OutboxEvent` row written in the same transaction, relayed by a job). No lost events, but a new table, a relay, and edits to all nine emit sites for a failure mode that costs a resend click. Deferred, not rejected.
- **Send email inline from the services.** Violates Constitution 12 and makes API latency and success depend on Resend.
- **Record every send in the `Notification` table for dedupe.** It would double as history for a later inbox, but non-user invitees have no `userId` (required FK) and it needs a migration now. The in-app inbox spec can decide its own storage. **Decided in [ADR 0017](./0017-notifications.md) (2026-10-25):** only in-app rows are stored, one per recipient who has an account; email sends are still not recorded.
- **An in-process EventBus for e2e/dev** (call handlers inline, no Inngest). Simpler CI, but the Inngest wiring (serve route, function registration, signing) would be untested end to end.
- **A test-only email provider or a bypass flag.** Rejected by CLAUDE.md; the config-selected `FileEmailService` is a legitimate dev adapter, not a seam.
