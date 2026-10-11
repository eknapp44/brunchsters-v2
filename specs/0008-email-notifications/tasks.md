# Tasks 0008 — Email Notifications (Inngest + Resend)

Four milestones, each green on its own. Testing notes are filled in as each completes (CLAUDE.md — Testing notes required per milestone). Branch: `feat/0008-email-notifications`, cut from `main` (no stacking needed). Close each milestone with `/milestone-done`.

---

## M1 — Typed events and a composition root (no behavior change)

- [x] Commit ADR 0009, its README index row and this spec folder (docs-only commit, before any code)
- [ ] Read every `emit` site and write `BrunchEventPayloads` from what is actually emitted; `emit` becomes generic over it; remove names with no producer
- [ ] Update the eight emit sites and every test `makeMockEventBus` so they compile against the types
- [ ] `apps/web/src/lib/services.ts`: `getEventBus()` (returns `NoopEventBus`); replace the 11 inline `new NoopEventBus()` in routes and `invite/[token]/page.tsx`
- [ ] Unit tests: each emit site asserts the exact typed payload (extend existing emit assertions where they are loose); a type-level test (`// @ts-expect-error` with a stated reason) that a wrong payload for an event does not compile
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm --filter @brunchsters/core test:integration && pnpm test:e2e` pass (e2e must pass unchanged — this milestone touches routes)
- [ ] Commit: `refactor: type event payloads and add an EventBus composition root (M1)`

**Testing notes:** _(fill on completion)_

---

## M2 — Email layer and handlers in `packages/core`

- [ ] Check whether core already has a timezone-aware date formatter; reuse it or add one with tests
- [ ] `EmailService` gains `idempotencyKey?`; `MockEmailService` records sends and can be told to fail (delivery_failed / invalid_address)
- [ ] Templates: `inviteEmail`, `confirmedEmail`, `escapeHtml`, `safeSubject` (pure, tested with hostile inputs)
- [ ] `sendInviteEmail` with outcomes `sent | skipped_revoked | skipped_expired | skipped_gone` and the idempotency key from the current token's hash
- [ ] `resolveConfirmationRecipients` and `sendConfirmationEmail` as specified in the plan
- [ ] Unit tests with `MockEmailService` for every outcome, error mapping and key format
- [ ] Integration tests (real Postgres): revoked invite, expired invite, rotated token (second send uses the new token, key differs), recipients including host / yes / maybe / invited / **no (excluded)** / no-account invitee / revoked invite (excluded) / synthetic host invite (excluded) / duplicate address
- [ ] **Prove the new tests can fail:** drop the revoked check, drop the decliner filter, and stop escaping the title in turn, each time confirming the matching tests (and only those) fail
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm --filter @brunchsters/core test:integration` pass
- [ ] Commit: `feat: invite and confirmation email handlers in core (M2)`

**Testing notes:** _(fill on completion)_

---

## M3 — Inngest and Resend wiring in `apps/web`

- [ ] Add `inngest` and `resend` (pinned, exact versions recorded in the testing note); approve any build scripts pnpm asks for
- [ ] Adapters: `ResendEmailService`, `FileEmailService`, `InngestEventBus` with unit tests using fake clients
- [ ] `apps/web/src/inngest/`: client, and thin function wrappers for `invite/sent` + `invite/resent` → `sendInviteEmail`, and `brunch/confirmed` → recipients then one `step.run` per recipient; retry vs `NonRetriableError` mapping tested
- [ ] `apps/web/src/app/api/inngest/route.ts` (`serve`) and the `middleware.ts` allowance; route test that an unsigned request is refused in production mode
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
