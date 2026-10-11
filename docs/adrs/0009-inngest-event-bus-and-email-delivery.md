# 0009 — Inngest-backed EventBus, emit after commit, config-selected adapters

**Date:** 2026-10-11  
**Status:** Accepted  
**Deciders:** Evan Knapp

## Context

Constitution 12 says the API handles the transaction and side effects go to a queue. Until now that was honored by an `EventBus` interface whose only implementation, `NoopEventBus`, does nothing. Eight services call `eventBus.emit(...)` after their transaction commits (create, confirm, invite sent/resent, RSVP received/changed, vote cast/changed); the payloads are untyped (`Record<string, unknown>`); and `NoopEventBus` is constructed inline in eleven route and page files, so there is no single place to swap an implementation. Invites work only because the host copies a link by hand.

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

**Handlers read the database; payloads carry only ids.** An event can arrive after the invite was revoked or its token rotated, so the handler loads the live invite and its current token at send time and skips when the invite is gone.

**Adapters are selected by configuration, never by test flags.**

| Setting                                                     | `EmailService`                                                         | `EventBus`        |
| ----------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------- |
| `RESEND_API_KEY` set                                        | `ResendEmailService`                                                   | —                 |
| `RESEND_API_KEY` unset                                      | `FileEmailService` (writes one JSON file per email into an outbox dir) | —                 |
| `INNGEST_EVENT_KEY` or `INNGEST_DEV` set                    | —                                                                      | `InngestEventBus` |
| neither set                                                 | —                                                                      | `NoopEventBus`    |
| `NODE_ENV=production` with any of the required keys missing | boot fails                                                             | boot fails        |

`FileEmailService` is a real local-development feature (it lets you see the invite link without any account) and it is also how the e2e suite reads emails across the process boundary. E2E runs the real Inngest dev server and the real handlers; the only thing it substitutes is the final network hop to Resend, chosen the same way local dev chooses it.

## Consequences

- Easier: every future notification is one typed event plus one handler; swapping Inngest or Resend touches one adapter and the composition root.
- Easier: the e2e suite can prove "invite → email → working link → invitee joins" through the real queue and handlers.
- Harder: CI gains a second long-running process (the Inngest dev server) for the e2e job.
- Accepted risk: an event can be lost between commit and emit (see above). Becomes real work only if a notification ever becomes mandatory rather than convenient (for example a legally required notice), at which point an outbox ADR supersedes this one.
- The `/api/inngest` route must be public (signed requests only): `middleware.ts` currently 401s every unlisted `/api/*` path, so it gets an explicit allowance and a test that an unsigned request is refused in production mode.
- Resend delivers only to the account owner's address until a sending domain is verified. The code does not change when the domain is added; `EMAIL_FROM` does.

## Alternatives considered

- **Transactional outbox** (an `OutboxEvent` row written in the same transaction, relayed by a job). No lost events, but a new table, a relay, and edits to all eight emit sites for a failure mode that costs a resend click. Deferred, not rejected.
- **Send email inline from the services.** Violates Constitution 12 and makes API latency and success depend on Resend.
- **Record every send in the `Notification` table for dedupe.** It would double as history for a later inbox, but non-user invitees have no `userId` (required FK) and it needs a migration now. The in-app inbox spec can decide its own storage.
- **An in-process EventBus for e2e/dev** (call handlers inline, no Inngest). Simpler CI, but the Inngest wiring (serve route, function registration, signing) would be untested end to end.
- **A test-only email provider or a bypass flag.** Rejected by CLAUDE.md; the config-selected `FileEmailService` is a legitimate dev adapter, not a seam.
