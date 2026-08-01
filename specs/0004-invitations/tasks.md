# Tasks 0004 — Invitations

---

## M1 — Invite lifecycle: `sendInvites`, `resendInvite`, `revokeInvite`, `getInviteByToken`, `getInvitesForBrunch`

- [x] Add `@@unique([brunchId, invitedEmail])` to `BrunchInvite`; generate and commit the migration
- [x] Implement `packages/core/src/invite/sendInvites.ts`:
  - Zod input schema: `brunchId`, `invitedById`, `emails: Email[]` (non-empty, each a valid email)
  - Reject if `invitedById` isn't the brunch's host (`kind: 'not_host'`)
  - Reject any email equal to the host's own (`kind: 'cannot_invite_self'`)
  - Per email: `findUnique` on `(brunchId, invitedEmail)` — bypasses the soft-delete extension (only `findMany`/`findFirst` are intercepted), so this sees active _and_ revoked invites; found → regenerate token/expiry and clear `deletedAt`/`deletedBy` (revives a revoked invite through the same path as an active resend); not found → look up `User` by email — if found, create `BrunchInvite` (`invitedUserId` set) + `BrunchAttendee` (`rsvpStatus = invited`) together; if not found, create only `BrunchInvite` (`invitedUserId = null`)
  - New/revived invites: `tokenExpiresAt` = now + 30 days
  - Brunch currently `draft` → transitions to `active` (checked by current status code, not invite count — robust to revoke/resend edge cases)
  - Emit `invite/sent` per invite via `EventBus`, best-effort
- [x] Implement `resendInvite.ts`: host-only, new `token`, new `tokenExpiresAt` (+30 days), `lastResentAt = now`; emit `invite/resent`
- [x] Implement `revokeInvite.ts`: host-only, soft delete (`deletedAt`/`deletedBy`)
- [x] Implement `getInviteByToken.ts`: returns `{ brunchTitle, hostName, brunchStatusLabel } | undefined` for a valid, non-expired, non-revoked token
- [x] Implement `getInvitesForBrunch.ts`: host-only; returns `readonly { id, invitedEmail, status, lastResentAt }[]` (status derived from the joined `BrunchAttendee.rsvpStatus`, or `'pending'` when no attendee row exists yet or its status is `invited`); excludes the synthetic host self-invite by filtering out the host's own email
- [x] Export all five (+ their types) from `packages/core/src/index.ts`
- [x] Extracted shared `LookupNotFoundError` to `packages/core/src/errors/` (now used by every new invite service; `createBrunch.ts`'s inline copy left as-is to avoid touching already-shipped code)
- [x] Unit tests: known-user vs. unregistered-user branch in `sendInvites`, duplicate-email delegates to resend, soft-deleted invite revived via the same path, self-invite rejected, non-host rejected for every host-only action, `draft`→`active` transition (and no-op when already `active`), lookup-not-found and db-error mapping, event-emit-failure-still-Ok
- [x] Integration test against local Postgres: full send → resend → revoke → re-invite (revive) lifecycle with real rows; includes one known-user invitee (pre-existing `User`) and one unregistered invitee in the same run
- [x] `pnpm typecheck && pnpm lint && pnpm test` pass
- [x] Commit: `feat: invite lifecycle services — send, resend, revoke, token lookup (M1)`

---

## M2 — `respondToInvite` + `getBrunchById` extension

- [x] Implement `packages/core/src/invite/respondToInvite.ts`:
  - Input: `token`, `viewerId`, `response: 'yes' | 'no' | 'maybe'`
  - Validates token (not expired/revoked) → `kind: 'invalid_token'` otherwise
  - If a `BrunchAttendee` row already exists for this invite, update `rsvpStatusId`/`respondedAt`; otherwise create it (backfilling `BrunchInvite.invitedUserId` if it was null)
  - Always allowed — no "already responded" lock
  - Emit `attendee/rsvp.received` (first response) or `attendee/rsvp.changed` (subsequent)
- [x] Extend `BrunchDetail` (`getBrunchById.ts`) with `isHost: boolean` and `viewerRsvpStatus: string | undefined` (scoped `attendees` include filtered to the viewer, not a full attendee list)
- [x] Export `respondToInvite` (+ types) from `packages/core/src/index.ts`
- [x] Unit tests: create-branch (no prior attendee) vs. update-branch, invitedUserId backfill only when null, invalid token rejected, lookup-not-found and db-error mapping, emit-failure-still-Ok, correct event name on first vs. subsequent response
- [x] Updated `getBrunchById.test.ts` for the two new fields, plus a query-shape assertion for the viewer-scoped `attendees` include
- [x] Integration test: known invitee's eagerly-created attendee row gets updated; unregistered invitee's attendee row gets created on first response with `invitedUserId` backfilled; response can be changed with no lock; invalid token rejected
- [x] `pnpm typecheck && pnpm lint && pnpm test` pass
- [x] Commit: `feat: respondToInvite service and getBrunchById viewer fields (M2)`

---

## M3 — Invite suggestions: `suggestInvitee`, `reviewInviteSuggestion`

- [x] Added `InviteSuggestionId` branded type to `packages/shared` (consistent with `InviteId`/`BrunchId`)
- [x] Implement `reviewInviteSuggestion.ts` first (built before `suggestInvitee` since auto-approve calls into it): host-only; `decision: 'approve' | 'decline'`; rejects a suggestion that isn't currently `pending` (`kind: 'already_reviewed'`); approve calls `sendInvites` for the suggested email and sets `status = approved`, `reviewedById`/`reviewedAt`; decline just sets `status = declined` + review fields
- [x] Implement `suggestInvitee.ts`: reject if `Brunch.allowInviteSuggestions` is false (`kind: 'suggestions_disabled'`); reject if the suggester is neither the host nor a current attendee (`kind: 'not_attendee'`); reject a duplicate suggestion for the same `(brunchId, email)` (`kind: 'already_suggested'`, matches the model's existing `@@unique`); look up `User` by email to populate `suggestedUserId` when known; create `BrunchInviteSuggestion` (`status = pending`); if `requireHostApprovalToInvite` is false, calls `reviewInviteSuggestion` internally with `decision: 'approve'` — auto-approve is not a separate code path, it's the same review logic invoked with the host as reviewer; falls back to reporting `pending` (suggestion still created) if that internal call fails, rather than propagating an error for a side-effect that isn't the caller's fault
- [x] Export both (+ types) from `packages/core/src/index.ts`
- [x] Unit tests: suggestions disabled → rejected, non-attendee/non-host rejected, host can suggest without an attendee row, duplicate suggestion rejected, missing-lookup-row and db-error mapping, `suggestedUserId` populated when the email matches an existing user, auto-approve path creates a real invite via a mocked `reviewInviteSuggestion`, auto-approve-fails-still-reports-pending, host-only review enforced, decline creates no invite, double-review of an already-reviewed suggestion rejected
- [x] Integration test against local Postgres: full attendee-suggests → host-approves → real-invite-created flow; host-declines → no invite; `requireHostApprovalToInvite = false` → immediate real invite; duplicate suggestion rejected by the real unique constraint; non-attendee rejected; double-review rejected
- [x] `pnpm typecheck && pnpm lint && pnpm test` pass
- [x] Commit: `feat: invite suggestion services with auto-approve and host review (M3)`

---

## M4 — API routes

- [x] `POST /api/v1/brunches/[id]/invites` — body `{ emails: string[] }`; 201 with invite summaries; 403 non-host; 422 invalid emails; 404 malformed/unknown brunch id
- [x] `POST /api/v1/invites/[id]/resend` — host-only; 200; 403 non-host; 404 malformed/unknown invite id
- [x] `DELETE /api/v1/invites/[id]` — host-only; 204; 403 non-host; 404 malformed/unknown invite id
- [x] `GET /api/v1/invites/token/[token]` — **public**; 200 with brunch preview; 404 invalid/expired/revoked
- [x] `POST /api/v1/invites/token/[token]/respond` — body `{ response }`; requires auth; 200; 401 unauthenticated; 404 invalid token
- [x] `POST /api/v1/brunches/[id]/suggestions` — body `{ email }`; any attendee; 201; 403 suggestions disabled/non-attendee; 409 duplicate; 404 malformed/unknown brunch id
- [x] `POST /api/v1/suggestions/[id]/review` — body `{ decision }`; host-only; 200; 403 non-host; 409 already reviewed; 404 malformed/unknown suggestion id
- [x] Every `id`-shaped path param (`brunchId`, `inviteId`, `suggestionId`) is validated with `z.uuid()` before hitting the service — these columns are `@db.Uuid`, and an unvalidated garbage string reaches Postgres as an invalid UUID literal and throws, rather than returning a clean 404 (same rationale as the brunch detail page's UUID guard from spec 0003); `token` needs no such guard since it's a plain `String` column
- [x] Added `/api/v1/invites/token/` to `middleware.ts`'s `PUBLIC_PREFIXES` — the respond sub-route still enforces its own `auth()` check internally, so nesting it under the same public prefix as the preview route doesn't weaken it
- [x] Route handler unit tests for all 7 routes (auth/host checks, validation, success/error shapes) — same `vi.mock`-the-service pattern as `brunches`/`places` routes
- [x] Manual middleware check: `curl` the public token route unauthenticated → 404 for a bogus token (not 401); the respond route unauthenticated → 401; a still-gated route (send-invites) unauthenticated → 401
- [x] `pnpm typecheck && pnpm lint && pnpm test` pass
- [x] Commit: `feat: invite and suggestion API routes (M4)`

---

## M5 — Wizard step 4 + detail page invite panel

- [ ] `brunch/new` wizard: add `step: 4`, `emails: readonly Email[]` to `WizardState`, `ADD_EMAIL`/`REMOVE_EMAIL` actions, `StepFour` component (email input + list + remove, optional — "Create Brunch" works with zero emails)
- [ ] Submit flow: create brunch, then if `emails.length > 0` call `POST /api/v1/brunches/[id]/invites` before redirecting to `/brunch/[id]`
- [ ] `brunch/[id]` detail page: invite panel (host-only) listing `{ email, status }` from `getInvitesForBrunch`, resend/revoke buttons per row, "Invite more people" input+button calling the same send route
- [ ] `pnpm typecheck && pnpm lint` pass
- [ ] Manual browser test: create a brunch with 2 invited emails from the wizard; confirm both show "pending" on the detail page; resend one; revoke the other
- [ ] Commit: `feat: wizard invite step and detail page invite panel (M5)`

---

## M6 — Invitee-facing `/invite/[token]` page

- [ ] `apps/web/src/app/invite/[token]/page.tsx` (server component, public):
  - `getInviteByToken(token)` → `undefined` → render "This invite has expired or is invalid. Ask the host to resend it." (no brunch details)
  - Valid token + no session → render brunch preview (title, host name, status label) + "Sign in with Google" (`callbackUrl=/invite/${token}`)
  - Valid token + session → call `respondToInvite(token, viewerId, 'yes')`, redirect to `/brunch/[id]`
- [ ] `pnpm typecheck && pnpm lint` pass
- [ ] Manual browser test across all three entry points:
  - Existing signed-in user clicks link → lands on brunch detail immediately
  - Signed-out new user clicks link → sees preview → signs in with Google → account created → auto-accepted → lands on brunch detail
  - Expired/revoked token → friendly message, no brunch details leaked
- [ ] Commit: `feat: public invite landing page with auto-accept on auth (M6)`

---

## M7 — Suggestion UI + RSVP control

- [ ] `brunch/[id]`: RSVP control (yes/no/maybe buttons) for any attendee, calling `respondToInvite` via the same public respond route (works for authenticated re-visits too, not just first click)
- [ ] `brunch/[id]`: "Suggest someone" control (attendees, shown when `allowInviteSuggestions`) submitting to the suggestions route
- [ ] `brunch/[id]`: pending-suggestions list + approve/decline buttons (host-only, shown when any `pending` suggestions exist)
- [ ] `pnpm typecheck && pnpm lint` pass
- [ ] Full end-to-end browser test tying every milestone together:
  - Create a brunch with an invite from the wizard
  - Second account opens the link, signs up, lands on detail page, auto-accepted as `yes`
  - Second account changes RSVP to `maybe`
  - Second account suggests a third email
  - Host approves the suggestion → third invite appears in the panel
  - Host resends the third invite, then revokes it
- [ ] Commit: `feat: RSVP and invite-suggestion UI on brunch detail page (M7)`
- [ ] Open PR (draft while milestones are in progress, ready for review once M7 is done)

---

## Deferred / Known Gaps

- **Real email delivery.** `invite/sent`/`invite/resent` fire into the same `NoopEventBus` as `brunch/created`. Invites work today via the host copying the per-invitee link manually; real Resend delivery arrives with the Inngest spec.
- **Token-expiry recompute on time confirmation.** PLANNING §5 says tokens expire 7 days after the scheduled brunch date; this spec only ever sets a flat 30-day expiry because nothing in it confirms a time. The recompute (`scheduledAt + 7 days`) is a documented hook for whichever future spec adds time/location confirmation.
- **Full manage page** (RSVP list beyond the invite panel, votes, confirm/cancel) — later spec. This spec only adds an invite panel + RSVP control to the existing detail-page stub.
- **Rich RSVP fields** (`arrivingLate`, `leavingEarly`, `dietaryNote`, `decideBy`, `regretNote`, `inviteNextTime`) — plain `yes/no/maybe` only. Columns already exist for a later spec.
- **Confirmation lock.** PLANNING §5's "declined invitee can change mind until confirmed" is honored by having no lock at all yet, since confirmation doesn't exist. A future spec must add the lock when it adds confirmation.
- **Playwright E2E** — deferred, same rationale as spec 0003; manual browser verification covers this spec.
- **Push notifications, in-app realtime, notification rows** — later specs (Inngest + notifications spec).

---

## Testing Notes

_(Filled in after each milestone completes)_

### M1 — Invite lifecycle services

- **What was tested:** `sendInvites` — known-registered-user invitee (eager `BrunchAttendee` with `rsvpStatus = invited`) vs. unregistered invitee (no attendee row yet), duplicate-email resend delegation, soft-deleted-invite revival through the same resend path (the exact scenario the new `@@unique([brunchId, invitedEmail])` constraint makes necessary), self-invite rejection, non-host rejection, `draft`→`active` transition (and correctly skipped when already `active`), missing-lookup-row and unexpected-DB-error mapping, and emit-failure-still-Ok. `resendInvite`/`revokeInvite` — host-only enforcement, correct field mutations, not-found handling. `getInviteByToken` — valid token → minimal preview, invalid/expired/revoked → `undefined`, queries only non-expired tokens. `getInvitesForBrunch` — status derivation from the joined `BrunchAttendee.rsvpStatus` (including folding `invited`/no-attendee-row into `pending`), synthetic host invite excluded by email filter, host-only enforcement.
- **How:** 35 unit tests across the five services (mocked `DbClient`/`EventBus`) + 9 integration tests against local Supabase Postgres covering the full send → resend → revoke → re-invite (revive) lifecycle with two real invitees (one pre-existing `User`, one genuinely new), plus self-invite and non-host rejection against real rows. Mocked nothing in integration.
- **What's deferred:** No test exercises the actual token-expiry boundary (a real invite expiring after 30 days) — not practical to test without manipulating the clock; the expiry _value_ is asserted (`tokenExpiresAt: expect.any(Date)`) but not the boundary behavior itself. Real email delivery isn't tested since it isn't implemented (`invite/sent` fires into `NoopEventBus`).
- **How to run:** `pnpm --filter @brunchsters/core test` (unit); `supabase start && pnpm db:seed && pnpm --filter @brunchsters/core test:integration` (integration)

### M2 — `respondToInvite` + `getBrunchById` viewer fields

- **What was tested:** `respondToInvite` — first-response create path (with `invitedUserId` backfill only when it was null), subsequent-response update path (no lock — a decline can become an accept and vice versa), invalid/expired/revoked token rejection, missing-`RsvpStatus`-row and unexpected-DB-error mapping, emit-failure-still-Ok, and the correct event name (`rsvp.received` vs. `rsvp.changed`) on first vs. later responses. `getBrunchById`'s new `isHost`/`viewerRsvpStatus` fields — correct for host, attendee-with-a-response, and attendee-with-no-response-yet cases, plus a query-shape assertion confirming the `attendees` include is scoped to the viewer only (not a full attendee list — that stays `getInvitesForBrunch`'s, host-only, job).
- **How:** 11 unit tests on `respondToInvite` (mocked `DbClient`/`EventBus`) + 3 new/updated `getBrunchById` unit tests. 4 integration tests against local Supabase Postgres: updating a known invitee's eagerly-created attendee row, creating an unregistered invitee's attendee row for the first time (real second `User` row created mid-test to simulate signing up via the token, then responding) with `invitedUserId` backfill verified against a real row, changing a response, and an invalid-token rejection. Mocked nothing in integration.
- **What's deferred:** No test exercises what happens when the same viewer somehow already has a `BrunchAttendee` for the brunch via a _different_ invite — not reachable under the current invite model (one invite per email per brunch, one attendee per invite) so not worth a defensive test.
- **How to run:** `pnpm --filter @brunchsters/core test` (unit); `supabase start && pnpm db:seed && pnpm --filter @brunchsters/core test:integration` (integration)

### M3 — Invite suggestions

- **What was tested:** `reviewInviteSuggestion` — approve sends a real invite and marks `approved`, decline never touches `sendInvites` and marks `declined`, non-host rejected, already-reviewed (not `pending`) rejected, `sendInvites` failure on approve propagates as `db_error`. `suggestInvitee` — permission gating (`allowInviteSuggestions`), authorization (host or attendee only), duplicate-suggestion rejection, `suggestedUserId` backfill when the email matches an existing user, the auto-approve path (calls `reviewInviteSuggestion` internally with the host as reviewer) creating a real invite, and the auto-approve-fails-still-reports-pending fallback (the suggestion row isn't lost even if the internal approve call errors).
- **How:** 6 unit tests on `reviewInviteSuggestion` (mocked `DbClient`, `sendInvites` mocked via `vi.mock`) + 12 unit tests on `suggestInvitee` (mocked `DbClient`, `reviewInviteSuggestion` mocked via `vi.mock`) + 6 integration tests against local Supabase Postgres covering the full suggest → approve → real-invite, suggest → decline → no-invite, auto-approve, duplicate-rejection, non-attendee-rejection, and double-review-rejection paths with real rows. Mocked nothing in integration.
- **What's deferred:** No test covers a suggestion for an email that already has an active `BrunchInvite` (only the suggestion-level duplicate, via `@@unique([brunchId, suggestedEmail])`, is covered) — `sendInvites`'s own duplicate/resend handling (tested in M1) covers that case downstream regardless, so it's not a real gap, just not re-asserted here.
- **How to run:** `pnpm --filter @brunchsters/core test` (unit); `supabase start && pnpm db:seed && pnpm --filter @brunchsters/core test:integration` (integration)

### M4 — API routes

- **What was tested:** All 7 routes' auth gating (401 unauthenticated where required), UUID-param validation (malformed `id` → 404 without ever calling the service), request-body validation (real Zod schemas, only the services mocked), and the full success/error-kind-to-HTTP-status mapping for each route (403 for ownership failures, 404 for not-found, 409 for conflict states, 422 for validation, 500 for unexpected errors, with the underlying error logged before the 500 response per the M4-review-fix pattern from spec 0003). Manually verified against a running dev server: the public token-preview route returns 404 (not 401) for a bogus token while unauthenticated, the respond route on that same public prefix still independently 401s when unauthenticated, and an unrelated invite route stays gated by the blanket `/api/` 401.
- **How:** 39 new route handler unit tests across 7 files, `vi.mock`-ing only the core service being called per route (schemas kept real via `importOriginal` where a body is validated). `curl` against `pnpm dev` for the middleware/public-prefix behavior, since framework middleware routing isn't unit tested per policy.
- **What's deferred:** No test exercises a real authenticated end-to-end request through these routes (session cookie + real DB) — that lands with the M5/M6 browser flow once there's UI to drive it.
- **How to run:** `pnpm --filter @brunchsters/web test`; middleware check via curl against `pnpm dev`

### M5 — TBD

### M6 — TBD

### M7 — TBD
