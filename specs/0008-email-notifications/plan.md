# Plan 0008 — Email Notifications (Inngest + Resend)

**Companion to:** `spec.md`

---

## Architecture

### Files introduced or changed

```
docs/adrs/0009-inngest-event-bus-and-email-delivery.md             (new — committed with the spec)

packages/core/src/events/EventBus.ts                               (changed — M1: BrunchEventPayloads, generic emit)
packages/core/src/**/{createBrunch,confirmBrunch,sendInvites,
  resendInvite,reviewInviteSuggestion,respondToInvite,
  updateRsvp,castLocationBallot,castTimeBallot}.ts                 (changed — M1: typed payloads only)
packages/core/src/email/EmailService.ts                            (changed — M2: idempotencyKey)
packages/core/src/email/MockEmailService.ts                        (new — M2)
packages/core/src/email/templates/{inviteEmail,confirmedEmail,layout,
  escapeHtml,safeSubject,formatBrunchTime}.ts                                       (new — M2)
packages/core/src/email/{sendInviteEmail,sendBrunchConfirmedEmails,
  emailKeys}.ts                                    (new — M2: handlers as plain functions)

apps/web/src/lib/services.ts                                       (new — M1: composition root; M3 adds adapter selection)
apps/web/src/app/api/v1/**/route.ts, invite/[token]/page.tsx       (changed — M1: use the root, drop 11 inline Noop buses)
apps/web/src/adapters/{InngestEventBus,ResendEmailService,
  FileEmailService}.ts                                             (new — M3)
apps/web/src/inngest/{client,functions}.ts                         (new — M3: client + thin wrappers)
apps/web/src/app/api/inngest/route.ts                              (new — M3: serve())
apps/web/src/middleware.ts                                         (changed — M3: /api/inngest public)

apps/web/playwright.config.ts, .github/workflows/ci.yml            (changed — M4: Inngest dev server, outbox dir)
apps/web/e2e/support/mailbox.ts                                    (new — M4: read the outbox)
apps/web/e2e/journeys/email-notifications.spec.ts                  (new — M4: N1–N4)

docs/SETUP.md, docs/PLANNING.md, .env.example, .gitignore          (changed — M3/M4)
```

No Prisma schema or migration changes.

### Typed events (M1)

```ts
export type BrunchEventPayloads = {
  'brunch/created': { brunchId: BrunchId; hostId: UserId };
  'brunch/confirmed': { brunchId: BrunchId; locationId: BrunchLocationId; timeId: BrunchTimeId;
                        locationWasVoteLeader: boolean; timeWasVoteLeader: boolean };
  'invite/sent': { brunchId: BrunchId; inviteId: InviteId; invitedEmail: Email };
  'invite/resent': { brunchId: BrunchId; inviteId: InviteId };
  'attendee/rsvp.received' | 'attendee/rsvp.changed': { brunchId; inviteId; viewerId; response };
  'vote/cast' | 'vote/changed': { /* as emitted today */ };
};
export type BrunchEventName = keyof BrunchEventPayloads;
export interface EventBus {
  emit<N extends BrunchEventName>(name: N, data: BrunchEventPayloads[N]): Promise<void>;
}
```

The exact payload shapes are copied from what each service emits today (read, not guessed) and tightened to branded ids; M1 changes no behavior. Names with no producer (`invite/expired`, `vote/deadline.*`, `brunch/cancelled`, `notification/email.send`) leave the union until a spec produces them.

### Composition root (M1 → M3)

`apps/web/src/lib/services.ts` exports `eventBus` (M1, a module-level constant like `lib/db.ts`) and, from M3, `getEmailService()`, as singletons (module scope, so Next.js hot reload does not create a new client per request). M1 returns `NoopEventBus` everywhere (no behavior change, eleven call sites collapse to one import). M3 adds the selection table from ADR 0009 and the production boot check, which validates env in one function with Zod (the repo's existing boot-time validation style).

### Handlers: logic in core, wiring in the app

```ts
// packages/core/src/email/sendInviteEmail.ts
sendInviteEmail(input: { inviteId: InviteId },
  ctx: { db: DbClient; emailService: EmailService; appUrl: string })
  : Promise<Result<SendInviteEmailOutcome, SendInviteEmailError>>
// outcome: 'sent' | 'skipped_revoked' | 'skipped_expired' | 'skipped_gone' | 'skipped_host'
// error:   { kind: 'delivery_failed' } | { kind: 'invalid_address' } | { kind: 'db_error' }
```

`sendBrunchConfirmedEmails` is split into `resolveConfirmationRecipients(brunchId, ctx)` (pure DB read, returns `{ recipientKey, email, name?, link }[]`) and `sendConfirmationEmail(recipient, brunchSummary, ctx)` so the Inngest wrapper can run **one `step.run` per recipient**. The wrappers in `apps/web/src/inngest/functions.ts` do nothing but: parse the event, call core, map `delivery_failed` to a thrown error (retry) and `invalid_address` to `NonRetriableError`.

### Recipient resolution for `brunch/confirmed`

All reads go through the soft-delete-aware `db` client.

1. Brunch with confirmed location (`isConfirmed`, not deleted), confirmed time, timezone, host.
2. Host → `/brunch/{id}`, key `host`.
3. Live `BrunchInvite`s for the brunch, **excluding the host's synthetic invite** (identified the way `getInvitesForBrunch` and `confirmBrunch` do: `invitedEmail` equals the host's email) — each left-joined to its `BrunchAttendee` (via `inviteId`):
   - attendee exists and RSVP is `no` → skip
   - attendee exists otherwise (`invited`, `yes`, `maybe`) → `/brunch/{id}`
   - no attendee (no account yet) → `/invite/{token}` using the **current** token and the invite's `invitedEmail`
4. Recipients de-duplicated by lowercase address (the host may also hold an invite for a second address).

The time is rendered in the brunch's location timezone with an explicit zone abbreviation. The only existing code that formats times for display is in `apps/web` (UI); whether core already has a formatter is checked at the start of M2 before writing a new one.

### Idempotency keys

| Email            | Resend `Idempotency-Key`                            | Notes                                                             |
| ---------------- | --------------------------------------------------- | ----------------------------------------------------------------- |
| Invite           | `invite:{inviteId}:{first 16 hex of sha256(token)}` | rotates with the token, so a resend sends again; a retry does not |
| Brunch confirmed | `confirmed:{brunchId}:{recipientKey}`               | a brunch confirms once                                            |

Resend keeps idempotency keys for 24 hours; Inngest step memoization covers the retry window within that.

### Escaping and links

`escapeHtml` for every interpolated user value; `safeSubject` strips `\r`, `\n` and other control characters and trims to a sensible length. Links are built from `appUrl` (= `AUTH_URL`, already required, so no new setting — Constitution 2) plus a path; the token is never logged and never placed in an event payload or an idempotency key.

### Auth and 404/403

Handlers run as the system with ids from the event, not on behalf of a user, so the membership guards do not apply. The rule that matters here is **who may receive what**: an email goes only to the host and to live invitees of that brunch, resolved from the database at send time (never from the event payload), and never to a revoked invite. `/api/inngest` is the only new HTTP surface; it authenticates by Inngest signature, not session, which is why it is explicitly public in `middleware.ts` and tested.

### Local, CI and production

| Environment      | Bus                                              | Email                                   |
| ---------------- | ------------------------------------------------ | --------------------------------------- |
| Local dev        | Inngest dev server if `INNGEST_DEV=1`, else Noop | outbox files unless a Resend key is set |
| E2E (local + CI) | Inngest dev server (`INNGEST_DEV=1`)             | `FileEmailService` → temp outbox dir    |
| Production       | Inngest (`INNGEST_EVENT_KEY`/`SIGNING_KEY`)      | Resend (`RESEND_API_KEY`, `EMAIL_FROM`) |

Playwright's `webServer` becomes an array (Next server + Inngest dev server) with the outbox directory passed through `env`. The Inngest dev server needs to be told where the app's `/api/inngest` is; exact flags and the SDK's dev-mode detection are verified against the pinned `inngest` and `inngest-cli` versions in M3/M4.

---

## Decisions already made

(All in ADR 0009 and the grilling that preceded this spec.)

- Two specs: plumbing + two emails now; inbox, preferences, mute, host-facing emails later
- Emit after commit; no outbox
- Only `invite.received` and `brunch.confirmed` send mail
- Confirmation goes to everyone who has not declined, including invitees with no account
- Idempotency by Inngest step memoization + Resend idempotency key; no schema change
- Adapters chosen by config; E2E runs the real Inngest dev server and substitutes only the Resend hop
- Sandbox sender until the owner verifies a domain; walkthrough lives in `SETUP.md`

## Risks and mitigations

| Risk                                                                 | Mitigation                                                                                                        |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Stale event: invite revoked or token rotated before the handler runs | Handler loads live state by id and uses the current token; integration tests for revoked and rotated              |
| HTML/header injection through a brunch title or name in the email    | `escapeHtml` + `safeSubject`; tests with `<script>`, `"` and `\r\nBcc:` in title, host name and place name        |
| Duplicate email on retry                                             | Send is its own step; Resend idempotency key; test that two deliveries of one event produce one email             |
| `/api/inngest` blocked by auth middleware, or left open              | Explicit allowance + production-mode refusal test + N4 in the CI (production build) e2e run                       |
| Silent no-op bus in production                                       | Boot fails in production when Inngest/Resend config is missing                                                    |
| CI flakiness from a second process and asynchronous delivery         | Tests poll the outbox with a bounded timeout and assert on arrival, never on absence-after-sleep; no fixed sleeps |
| Sandbox Resend refuses non-owner recipients                          | Documented; not testable without a domain; permanent provider errors are non-retriable and logged                 |
| Lost event between commit and emit                                   | Accepted (ADR 0009); the host's resend button is the recovery path                                                |

## Test strategy

- **Unit (Vitest, `MockEmailService`, mocked db):** templates (content, escaping, subject sanitizing), `sendInviteEmail` outcomes, recipient resolution branches, error mapping, typed-bus payloads at each emit site (existing tests updated).
- **Integration (real local Postgres):** `sendInviteEmail` against a revoked invite, an expired one and a rotated token; `resolveConfirmationRecipients` with host, yes/maybe/no/invited attendees, a no-account invitee, a revoked invite, a duplicate address and the synthetic host invite.
- **Adapter tests:** `ResendEmailService` with a fake client (success, provider error, invalid address, idempotency header); `FileEmailService` writes a readable file; `InngestEventBus` with a fake client (name + data forwarded, errors propagate to the caller's catch).
- **Route test:** `/api/inngest` refuses an unsigned request in production mode.
- **E2E:** N1–N4 as in the spec; each proven to fail by temporarily breaking the behavior it guards (e.g. N2: stop rotating the token; N3: include decliners; N1: unregister the function).
