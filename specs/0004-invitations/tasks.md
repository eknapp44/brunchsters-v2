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

- [ ] Implement `packages/core/src/invite/respondToInvite.ts`:
  - Input: `token`, `viewerId`, `response: 'yes' | 'no' | 'maybe'`
  - Validates token (not expired/revoked) → `kind: 'invalid_token'` otherwise
  - If a `BrunchAttendee` row already exists for this invite, update `rsvpStatusId`/`respondedAt`; otherwise create it (backfilling `BrunchInvite.invitedUserId` if it was null)
  - Always allowed — no "already responded" lock
  - Emit `attendee/rsvp.received` (first response) or `attendee/rsvp.changed` (subsequent)
- [ ] Extend `BrunchDetail` (`getBrunchById.ts`) with `isHost: boolean` and `viewerRsvpStatus: string | undefined`
- [ ] Export `respondToInvite` from `packages/core/src/index.ts`
- [ ] Unit tests: create-branch (no prior attendee) vs. update-branch, invalid token rejected, correct event name on first vs. subsequent response
- [ ] Update `getBrunchById.test.ts` for the two new fields
- [ ] Integration test: unregistered invitee responds for the first time → `BrunchAttendee` created and `BrunchInvite.invitedUserId` backfilled
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass
- [ ] Commit: `feat: respondToInvite service and getBrunchById viewer fields (M2)`

---

## M3 — Invite suggestions: `suggestInvitee`, `reviewInviteSuggestion`

- [ ] Implement `suggestInvitee.ts`: reject if `Brunch.allowInviteSuggestions` is false; create `BrunchInviteSuggestion` (`status = pending`); if `requireHostApprovalToInvite` is false, immediately run the approve path (calls `sendInvites`, sets `status = approved`) in the same call
- [ ] Implement `reviewInviteSuggestion.ts`: host-only; `decision: 'approve' | 'decline'`; approve calls `sendInvites` for the suggested email and sets `status = approved`, `reviewedById`/`reviewedAt`; decline just sets `status = declined` + review fields
- [ ] Export both from `packages/core/src/index.ts`
- [ ] Unit tests: suggestions disabled → rejected, auto-approve path creates a real invite, host-only review enforced, decline creates no invite, double-review of an already-reviewed suggestion is rejected (`kind: 'already_reviewed'`)
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass
- [ ] Commit: `feat: invite suggestion services with auto-approve and host review (M3)`

---

## M4 — API routes

- [ ] `POST /api/v1/brunches/[id]/invites` — body `{ emails: string[] }`; 201 with invite summaries; 403 non-host; 422 invalid emails
- [ ] `POST /api/v1/invites/[id]/resend` — host-only; 200; 403 non-host; 404 unknown invite
- [ ] `DELETE /api/v1/invites/[id]` — host-only; 204; 403 non-host
- [ ] `GET /api/v1/invites/token/[token]` — **public**; 200 with brunch preview; 404 invalid/expired/revoked
- [ ] `POST /api/v1/invites/token/[token]/respond` — body `{ response }`; requires auth; 200; 401 unauthenticated; 404 invalid token
- [ ] `POST /api/v1/brunches/[id]/suggestions` — body `{ email }`; any attendee; 201; 403 suggestions disabled
- [ ] `POST /api/v1/suggestions/[id]/review` — body `{ decision }`; host-only; 200; 403 non-host
- [ ] **Add `/api/v1/invites/token/` to `middleware.ts`'s `PUBLIC_PREFIXES`** — without this, the one route meant to be reachable while signed out gets 401'd by the existing `/api/` auth branch
- [ ] Route handler unit tests for all 7 routes (auth/host checks, validation, success/error shapes) — same `vi.mock`-the-service pattern as `brunches`/`places` routes
- [ ] Manual middleware check: `curl` the public token route unauthenticated → 200/404 (not 401); the respond route unauthenticated → 401
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass
- [ ] Commit: `feat: invite and suggestion API routes (M4)`

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

### M2 — TBD

### M3 — TBD

### M4 — TBD

### M5 — TBD

### M6 — TBD

### M7 — TBD
