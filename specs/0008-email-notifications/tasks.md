# Tasks 0008 — Email Notifications (Inngest + Resend)

Four milestones, each green on its own. Testing notes are filled in as each completes (CLAUDE.md — Testing notes required per milestone). Branch: `feat/0008-email-notifications`, cut from `main` (no stacking needed). Close each milestone with `/milestone-done`.

---

## M1 — Typed events and a composition root (no behavior change)

- [x] Commit ADR 0009, its README index row and this spec folder (docs-only commit, before any code)
- [x] Read every `emit` site and write `BrunchEventPayloads` from what is actually emitted; `emit` becomes generic over it; remove names with no producer
- [x] Update the eight emit sites and every test `makeMockEventBus` so they compile against the types
- [x] `apps/web/src/lib/services.ts`: exports `eventBus` (still `NoopEventBus`); replace the 11 inline `new NoopEventBus()` in routes and `invite/[token]/page.tsx`
- [x] Unit tests: each emit site asserts the exact typed payload (extend existing emit assertions where they are loose); a type-level test (`// @ts-expect-error` with a stated reason) that a wrong payload for an event does not compile
- [x] `pnpm typecheck && pnpm lint && pnpm test && pnpm --filter @brunchsters/core test:integration && pnpm test:e2e` pass (e2e must pass unchanged — this milestone touches routes)
- [x] Commit: `refactor: type event payloads and add an EventBus composition root (M1)`

**Testing notes:**

- **What was tested:** The event payload map is enforced by the compiler, not by convention. `events/EventBus.test.ts` (4 tests) accepts a matching payload and holds three `@ts-expect-error` lines, each a thing that must stay a compile error: a payload belonging to a different event, an unbranded string where a `BrunchId` is required, and an event name nothing emits (`brunch/cancelled`). Every emit site already asserted its exact payload in its own unit test except the two `vote/changed` cases, which used `expect.anything()`; those now assert `{ brunchId, voterId, optionIds }` exactly. No runtime behavior changed.
- **How:** unit (core 363, +4 over before; web 216 and shared 7 unchanged), integration against real local Postgres (88, unchanged) and the full e2e suite (69/69, dev mode) all pass; typecheck and lint are clean. **Mutation check:** replacing the generic `emit<N>(name, data)` with the old `emit(name: string, data: Record<string, unknown>)` made typecheck fail in exactly `EventBus.test.ts` (all three `@ts-expect-error` lines became "unused directive", plus the test double's own signature); restored from a copy and typecheck is green again.
- **E2E journeys:** none added. This milestone is a refactor with no user-visible change (the 10 route handlers and one page now import the bus from one place; the bus is still the no-op one), so per CLAUDE.md it needs no new journey, but `pnpm test:e2e` was run and passes. The stress run and CI-mode run were skipped for the same reason; M4 is where the e2e suite gains new moving parts and gets both.
- **Correction to this milestone's original task list:** (1) "Update the eight emit sites and every test `makeMockEventBus`": only four production lines needed changing, all missing `as BrunchId` / `as InviteId` casts on Prisma's plain-string ids (`resendInvite`, `respondToInvite` x2, `reviewInviteSuggestion`). The test doubles are `vi.fn()` so they compile against any signature and needed no edit. (2) The composition root exports a plain `eventBus` constant (the same style as `lib/db.ts`) and not a `getEventBus()` function; M3 adds `getEmailService()` and the adapter selection when there is something to select. (3) Eleven places built a bus inline: ten route handlers and the invite landing page.
- **Findings:** the two RSVP paths emitted different payload shapes under the same event name. `respondToInvite` includes `inviteId`; `updateRsvp` does not (it works from the signed-in attendee and has no invite in hand). The map makes `inviteId` optional on the RSVP payload with a comment saying why; nothing consumes RSVP events yet, so M2 and M3 are unaffected. `vote/cast` and `vote/changed` carry location ids or time ids in `optionIds` depending on the ballot, typed as a union of the two branded ids.
- **What's deferred:** no consumer of any event exists yet, so the payloads are only proven to match what the services emit, not that a handler can use them (M2/M3). The pre-existing "Failed to parse brunch creation request body" lines in the web unit test output are a test deliberately sending bad JSON, not a failure.
- **How to run it:** `pnpm typecheck` (the payload typing is checked here), `pnpm --filter @brunchsters/core test`, `pnpm test:e2e`.

---

## M2 — Email layer and handlers in `packages/core`

- [x] Check whether core already has a timezone-aware date formatter; reuse it or add one with tests
- [x] `EmailService` gains `idempotencyKey?`; `MockEmailService` records sends and can be told to fail (delivery_failed / invalid_address)
- [x] Templates: `inviteEmail`, `confirmedEmail`, `escapeHtml`, `safeSubject` (pure, tested with hostile inputs)
- [x] `sendInviteEmail` with outcomes `sent | skipped_revoked | skipped_expired | skipped_gone | skipped_host` and the idempotency key from the current token's hash
- [x] `resolveConfirmationRecipients` and `sendConfirmationEmail` as specified in the plan
- [x] Unit tests with `MockEmailService` for every outcome, error mapping and key format
- [x] Integration tests (real Postgres): revoked invite, expired invite, rotated token (second send uses the new token, key differs), recipients including host / yes / maybe / invited / **no (excluded)** / no-account invitee / revoked invite (excluded) / synthetic host invite (excluded) / duplicate address
- [x] **Prove the new tests can fail:** drop the revoked check, drop the decliner filter, and stop escaping the title in turn, each time confirming the matching tests (and only those) fail
- [x] `pnpm typecheck && pnpm lint && pnpm test && pnpm --filter @brunchsters/core test:integration` pass
- [x] Commit: `feat: invite and confirmation email handlers in core (M2)`

**Testing notes:**

- **What was tested:** Templates: `escapeHtml` (the five markup characters, ampersand first), `safeHttpUrl` (http/https kept; `javascript:`, `data:` and non-URLs dropped), `safeSubject` (a CRLF `Bcc:` header attempt, tabs, NUL, U+2028, whitespace collapse, 150-character truncation), `formatBrunchTime` (10:30 AM CDT for a Chicago brunch, the same instant on the next day in Tokyo, a labelled UTC fallback for an unknown zone) and both emails (content, optional description, a hostile `<script>"&` in every user-supplied field, a `javascript:` place URL, a link that tries to break out of its attribute). `sendInviteEmail`: sent with the current token and a key of the form `invite:{id}:{16 hex}`; a rotated token gives a different key and link; skips for a gone invite, a revoked invite, an expired link, a deleted brunch and the host's own invite in any address case (none send anything); `delivery_failed` and `invalid_address` pass through as different errors; a database failure becomes `db_error`. `resolveConfirmationRecipients`: host always; yes, maybe and not-yet-answered attendees go to the brunch; a decliner and a removed attendee do not; an invitee with no account gets their invite-page link; two invites for one address in different case, or one matching the host, send once; not-found, not-confirmed and database errors. `sendConfirmationEmail`: one email with the time in the brunch's zone and key `confirmed:{brunch}:{recipient}`, plus both error kinds. Idempotency keys never contain the token.
- **How:** unit (Vitest, `MockEmailService`, mocked db) core 415 (+52); integration against real local Postgres 96 (+8, `emailHandlers.integration.test.ts`): a resend sends the live token under a new key (including an event handled after the resend), an invite revoked before the queued email ran sends nothing, an expired link sends nothing, the host's synthetic invite sends nothing, an unknown id is skipped, and a full brunch (yes, maybe, no, an account that never answered, a removed member, a revoked no-account invitee, a silent no-account invitee) confirms to exactly the host, yes, maybe, waiting and silent addresses with the right links, and the silent invitee's link is still valid after confirming. **Mutation checks** (copy, mutate, run unit and integration, restore from the copy; seven in total): dropping the revoked check failed the unit and integration revoked tests; dropping the decliner filter failed the unit and integration recipient tests; not escaping the title failed the hostile-text test; a token-blind idempotency key failed three tests (key, handler, integration); dropping the removed-attendee check failed its unit test; dropping the host-invite check failed its unit and integration tests; dropping the expiry check failed its unit and integration tests. Each mutation failed exactly the tests that guard it and nothing else.
- **E2E journeys:** none this milestone. It adds no route, screen, rule or client logic: nothing calls these functions until M3 wires them to Inngest. The journeys (N1–N4) are M4.
- **Correction to this milestone's original task list:** (1) The plan listed one file `sendBrunchConfirmedEmails.ts` for the confirmation flow and that is what exists (`resolveConfirmationRecipients` and `sendConfirmationEmail`), plus three files the plan did not list: `emailKeys.ts` (keys and `joinUrl`), `templates/layout.ts` (the shared frame) and `templates/formatBrunchTime.ts`; the plan is updated. (2) Core had no timezone-aware date formatter (the UI formats times itself with `toLocaleString`), so `formatBrunchTime` is new; it uses `Intl.DateTimeFormat` and falls back to labelled UTC for an unknown zone. (3) `sendInviteEmail` has a fifth outcome, `skipped_host`, for the host's synthetic invite, instead of relying on that invite's born-expired token to produce `skipped_expired`: the reason is clearer in logs and it survives a change to how the synthetic invite is created.
- **Design choices the spec left open:** idempotency keys use the first 16 hex characters of a SHA-256 of the token, through the Web Crypto API that Node 22 and browsers share (core cannot import `node:crypto`). A removed attendee (soft-deleted `BrunchAttendee`) is skipped even if their invite is live, because nested includes are not soft-delete filtered by the Prisma extension and such a person is not part of the brunch. The greeting uses the account name when there is one.
- **A near miss:** writing source files through shell heredocs turned ` ` escapes into real line-separator characters and broke a regex literal; `safeSubject.ts` was rewritten with character codes instead of escapes. Not a product bug, but a trap for the next file that needs an escape sequence (and the same quoting trouble made several heredoc commands fail outright, so scripts went into files).
- **What's deferred:** The removed-attendee branch is covered by a unit test with a mocked database only: in the real database `revokeInvite` soft-deletes the invite too, so the integration scenario reaches that case through the invite filter instead. Nothing sends anything yet; delivery, retries and Resend honoring the idempotency header are M3 (adapter tests) and M4 (through the real queue). Email appearance in real mail clients is unchecked (inline-styled HTML only; no render test). A very large brunch still resolves all recipients in one query (spec Open Question 2).
- **How to run it:** `pnpm --filter @brunchsters/core test` (unit), `pnpm --filter @brunchsters/core test:integration` (needs local Supabase).

---

## M3 — Inngest and Resend wiring in `apps/web`

- [ ] Add `inngest` and `resend` (pinned, exact versions recorded in the testing note); approve any build scripts pnpm asks for
- [ ] Adapters: `ResendEmailService`, `FileEmailService`, `InngestEventBus` with unit tests using fake clients
- [ ] `apps/web/src/inngest/`: client, and thin function wrappers for `invite/sent` + `invite/resent` → `sendInviteEmail`, and `brunch/confirmed` → recipients then one `step.run` per recipient; retry vs `NonRetriableError` mapping tested
- [ ] `apps/web/src/app/api/inngest/route.ts` (`serve`) and the `middleware.ts` allowance; route test that an unsigned request is refused in production mode
- [ ] `sendInvitesRequestSchema` accepts at most 50 addresses per request (`.max(50)`, a clear validation message); unit test at 50 (accepted) and 51 (rejected). This guards the email fan-out without deciding what a brunch size limit means
- [ ] Composition root selects adapters per ADR 0009; production boot check with a Zod-validated env function (tests for each missing variable)
- [ ] `.env.example`, `.gitignore` (`.mail-outbox/`), `docs/SETUP.md` (Inngest dev server, outbox, env table, **Resend domain verification walkthrough**), `docs/PLANNING.md` §7/§10/§16 updated
- [ ] Manual check, recorded in the note: with `inngest-cli dev` running, send an invite from the app and see the file in the outbox and the run in the Inngest dev UI
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm --filter @brunchsters/core test:integration && pnpm test:e2e` pass (e2e still on the Noop bus here — it must be unaffected)
- [ ] Commit: `feat: wire Inngest and Resend behind the EventBus and EmailService (M3)`

**Testing notes:** _(fill on completion)_

---

## M4 — E2E journeys N1–N4 and CI

- [ ] `playwright.config.ts`: second `webServer` for the Inngest dev server; Next server gets `INNGEST_DEV=1`, `EMAIL_OUTBOX_DIR` (fresh per run) and no `RESEND_API_KEY`
- [ ] `.github/workflows/ci.yml` e2e job: make the Inngest CLI available (pinned version) and start it via Playwright's config; confirm CI runs the **production build** with the route registered
- [ ] `e2e/support/mailbox.ts`: `waitForEmail({ to, subjectIncludes? })` polling the outbox with a bounded timeout; helper to extract the link from the HTML
- [ ] **N1** invite → email → link → sign in → accept → attendee
- [ ] **N2** resend → first link dead, second link works
- [ ] **N3** confirm → exactly the right recipients, timezone-correct time, silent invitee's link still works
- [ ] **N4** `/api/inngest` refuses an unsigned request (production-mode CI run); add the case to the API-authorization e2e test
- [ ] Prove each journey can fail (N1: unregister the function; N2: stop rotating; N3: include decliners; N4: drop the signature check) and record the results
- [ ] Stress run (repeat/workers) and CI-mode run to flush out polling flakiness
- [ ] `docs/SETUP.md` testing section: how the e2e suite sees email; spec status → Complete; build order #8 ticked in PLANNING (with 0009 noted as the follow-up)
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm --filter @brunchsters/core test:integration && pnpm test:e2e` pass
- [ ] Commit: `test: e2e journeys for invite and confirmation email (M4)`

**Testing notes:** _(fill on completion)_
