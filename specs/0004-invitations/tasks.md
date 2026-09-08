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

- [x] `brunch/new` wizard: added `step: 4`, `emails: readonly string[]` to `WizardState`, `ADD_EMAIL`/`REMOVE_EMAIL` actions, `StepFour` component (email input + list + remove, optional — "Create Brunch" works with zero emails); Step 3's old submit button became a plain "Next" to step 4
- [x] Submit flow: create brunch, then if `emails.length > 0` call `POST /api/v1/brunches/[id]/invites` before redirecting to `/brunch/[id]` — best-effort, a failure here doesn't block the redirect since the brunch already exists and invites can be retried from the detail page
- [x] `brunch/[id]` detail page: invite panel (host-only) listing `{ email, status }` from `getInvitesForBrunch`, resend/revoke buttons per row, "Invite more people" input+button calling the same send route — implemented as a new client component (`InvitePanel.tsx`) rendered from the server-component page, using `router.refresh()` after each mutation rather than duplicating server-fetched list state on the client
- [x] `pnpm typecheck && pnpm lint` pass
- [x] Manual browser test: created a brunch with 2 invited emails from the wizard; both showed "pending" on the detail page; resent one; revoked the other; added a third via "Invite more people" — all confirmed working
- [x] **Bug found during manual testing, fixed in this milestone:** `sendInvites` rejected its _entire_ batch if any single email matched the host's own — so a host who included themselves (an easy, natural mistake) silently lost every other invite in that submission too, with zero feedback (the wizard's invite-send step is intentionally best-effort/non-blocking). Changed `sendInvites` to filter out the host's own email and process the rest instead of erroring; removed the now-impossible `cannot_invite_self` error kind from `SendInvitesError`, the route's switch, and updated the M1 tests (unit + integration) accordingly. A second red herring during the same testing session — a stale Turbopack dev-server cache from before these routes existed — was ruled out separately by calling `sendInvites` directly against a real row, which succeeded, isolating the actual bug to the service logic rather than the routes or wizard.
- [x] Commit: `feat: wizard invite step and detail page invite panel (M5)`

---

## M6 — Invitee-facing `/invite/[token]` page

- [x] `apps/web/src/app/invite/[token]/page.tsx` (server component, public — `/invite/` was already in `middleware.ts`'s `PUBLIC_PREFIXES` from spec 0003, no middleware change needed):
  - `getInviteByToken(token)` → `undefined` → render "This invite has expired or is invalid. Ask the host to resend it." (no brunch details)
  - Valid token + no session → render brunch preview (title, host name, status label) + "Sign in with Google" (`callbackUrl=/invite/${token}`, reusing `/sign-in`'s existing mechanism — no new auth plumbing)
  - Valid token + session → call `respondToInvite(token, viewerId, 'yes')`, redirect to `/brunch/[id]`; on failure, show a generic error rather than the sign-in prompt (they're already authenticated, so that prompt would be confusing)
- [x] **Fix found before testing began:** `spec.md` calls for "each entry's copyable link" on the invite panel, but M5's `InvitePanel` only showed email + status — no way to actually get the link to share. Added `token` to `InviteListItem`/`getInvitesForBrunch`, and a "Copy link" button (clipboard write + brief "Copied!" feedback) per row.
- [x] `pnpm typecheck && pnpm lint` pass
- [x] Manual browser test across all three entry points:
  - Existing signed-in user clicks link → lands on brunch detail immediately
  - Signed-out new user clicks link (second Google account, added as an OAuth consent screen test user) → sees preview → signs in with Google → auto-accepted → lands on brunch detail
  - Expired/invalid token → friendly message, no brunch details leaked
- [x] **Real bug found during testing, fixed in this milestone:** clicking a still-pending invite link while already signed in as a _different_ user who already belongs to the brunch (most naturally: the host, testing their own invite links) crashed with a generic error. `respondToInvite` only checked for an existing attendee row _for that invite_, then tried to create a new one — colliding with `BrunchAttendee`'s `@@unique([brunchId, userId])` since the viewer already had a row from being the host. Fixed by checking brunch-level membership before creating a row; if the viewer already belongs to the brunch some other way, it's now a no-op (redirect them in, don't touch their existing RSVP or emit an event) instead of an error.
- [x] Commit: `feat: public invite landing page with auto-accept on auth (M6)`

---

## Testing audit (between M6 and M7)

Two real bugs slipping through ~130 existing tests (found by manual testing in M5/M6) prompted a deliberate audit pass before continuing, rather than just moving on. The pattern behind both bugs was the same: every test asked "does this work for the expected caller," never "what if a _different_ actor — one who already has some relationship to this data — is the one calling this." Re-read every M1–M3 service line-by-line specifically looking for that blind spot, plus confirmed the route layer has no identity-smuggling surface (every `invitedById`/`suggestedById`/`requestedById`/`viewerId`/`reviewedById` comes from the session; none of the Zod request schemas even have an identity field to smuggle through).

**Two more real bugs found by this audit (not manual testing) and fixed:**

- [x] `sendInvites`: the same email appearing twice in one batch created the invite on the first pass, then "revived" that same just-created row on the second (`findUnique` sees uncommitted writes within the same transaction) — producing a duplicate entry in the returned summaries for one underlying row. Fixed by de-duplicating the email list before the loop.
- [x] `suggestInvitee`: suggesting the host's own email wasn't rejected — it created a suggestion that, on approval, called `sendInvites` with the host's email, which silently filters host-self-invites (per the M5 fix) and returns `ok([])`. The suggestion still got marked `approved` even though zero invites were actually created — a confusing inconsistent state. Fixed by rejecting `cannot_suggest_host` upfront, mirroring `sendInvites`'s own self-invite handling.

**Test additions (no code bug, closing missing multi-actor coverage):**

- [x] `sendInvites`: duplicate email within one batch → single result, single `create` call (unit)
- [x] `suggestInvitee`: rejects suggesting the host's own email (unit + integration); suggesting an _already-invited_ email is allowed and approval just resends the existing invite rather than erroring (integration — documents intended behavior, not a bug)
- [x] `respondToInvite`: the `already_member` fix generalized to a genuinely different setup path — a non-host attendee (membership via their own real invite, not the synthetic host one) clicking a different pending invite link (integration; the unit-level code path was already generic and didn't need a redundant mock-level test)
- [x] `resendInvite` + `revokeInvite`: explicit test confirming both report `invite_not_found` for an already-revoked invite against the _real_ soft-delete extension, not just a mock that can't distinguish "revoked" from "never existed" (integration)
- [x] Suggestions route: `cannot_suggest_host` → 422 (unit)

**Result:** 103 unit + 34 integration tests in `packages/core` (up from ~85/30), 68 unit tests in `apps/web` (up from 67). `pnpm typecheck && pnpm lint && pnpm test` and `pnpm --filter @brunchsters/core test:integration` all green.

- [x] Commit: `test: audit for missing cross-actor scenarios, fix two real bugs found (sendInvites duplicate email, suggestInvitee self-suggestion)`

---

## M7 — Suggestion UI + RSVP control

- [x] **Deviation from the plan, documented here:** the task as originally written said the RSVP control should call `respondToInvite` "via the same public respond route." That doesn't work for the host: a host's invite is a synthetic, born-expired token (Constitution 28 — least privilege for invite tokens), so routing the host's own RSVP changes through the token-based flow would break for them specifically. Built a new token-less `updateRsvp.ts` service instead — it works directly off the viewer's existing `BrunchAttendee` row (guaranteed to exist, since `getBrunchById`'s own access rule requires either host or attendee membership), with its own `not_attendee` error instead of `invalid_token`. `respondToInvite` remains exactly as built in M2, unchanged, used only for the initial token-based join.
- [x] `packages/core/src/invite/updateRsvp.ts`: `not_attendee` when no `BrunchAttendee` row exists for `(brunchId, viewerId)`; otherwise updates `rsvpStatusId`/`respondedAt` and emits `attendee/rsvp.changed` (best-effort, per Constitution 12)
- [x] `packages/core/src/invite/getPendingSuggestionsForBrunch.ts`: host-only; returns pending `BrunchInviteSuggestion` rows with `suggestedByName` (approved/declined ones are done and don't need review UI — approved ones are already visible as real invites via `getInvitesForBrunch`)
- [x] Extended `getBrunchById.ts`'s `BrunchDetail` with `allowInviteSuggestions: boolean` so the client knows whether to show the "Suggest someone" control
- [x] Exported both new services (+ types) from `packages/core/src/index.ts`
- [x] `brunch/[id]`: `RsvpControl.tsx` — yes/no/maybe buttons for any attendee (including the host), posting to the new RSVP route, `router.refresh()` after
- [x] `POST /api/v1/brunches/[id]/rsvp` — body `{ response }` via `updateRsvpRequestSchema`; 200; 403 `not_attendee`; 422 invalid response value; 404 malformed brunch id; 401 unauthenticated
- [x] `brunch/[id]`: `SuggestionsPanel.tsx` — "Suggest someone" control submitting to the suggestions route, and (host-only) the pending-suggestions list with approve/decline buttons calling the review route
- [x] **UX fix found during manual testing:** the "Suggest someone" input was showing on the host's own brunch detail view, which doesn't make sense — the host can just invite directly via the invite panel below it; suggesting only makes sense for non-host attendees who don't have that direct path. `suggestInvitee` itself still technically permits a host to suggest (no code changed there — out of scope for this UI-only fix), but the page now only passes `canSuggest={!brunch.isHost && brunch.allowInviteSuggestions}`, so the input itself is hidden for hosts. The host still sees the pending-suggestions review list, which is exactly the piece that does make sense for them.
- [x] `pnpm typecheck && pnpm lint` pass
- [x] Full end-to-end browser test tying every milestone together:
  - Create a brunch with an invite from the wizard
  - Second account opens the link, signs up, lands on detail page, auto-accepted as `yes`
  - Second account changes RSVP to `maybe`
  - Second account suggests a third email
  - Host approves the suggestion → third invite appears in the panel
  - Host resends the third invite, then revokes it
  - Confirmed working end-to-end; only the host-facing suggestion-input UX issue above was found, fixed in this milestone
- [x] Commit: `feat: RSVP and invite-suggestion UI on brunch detail page (M7)`
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

- **What was tested:** `sendInvites` — known-registered-user invitee (eager `BrunchAttendee` with `rsvpStatus = invited`) vs. unregistered invitee (no attendee row yet), duplicate-email resend delegation, soft-deleted-invite revival through the same resend path (the exact scenario the new `@@unique([brunchId, invitedEmail])` constraint makes necessary), non-host rejection, `draft`→`active` transition (and correctly skipped when already `active`), missing-lookup-row and unexpected-DB-error mapping, and emit-failure-still-Ok. `resendInvite`/`revokeInvite` — host-only enforcement, correct field mutations, not-found handling. `getInviteByToken` — valid token → minimal preview, invalid/expired/revoked → `undefined`, queries only non-expired tokens. `getInvitesForBrunch` — status derivation from the joined `BrunchAttendee.rsvpStatus` (including folding `invited`/no-attendee-row into `pending`), synthetic host invite excluded by email filter, host-only enforcement.
- **Amended in M5:** the original self-invite behavior (reject the whole batch with `cannot_invite_self`) turned out to be a real bug once exercised by hand — see the M5 note below. `sendInvites` now filters the host's own email out of the batch instead; the tests here reflect that.
- **How:** 35 unit tests across the five services (mocked `DbClient`/`EventBus`) + 9 integration tests against local Supabase Postgres covering the full send → resend → revoke → re-invite (revive) lifecycle with two real invitees (one pre-existing `User`, one genuinely new), plus self-invite and non-host rejection against real rows. Mocked nothing in integration.
- **What's deferred:** No test exercises the actual token-expiry boundary (a real invite expiring after 30 days) — not practical to test without manipulating the clock; the expiry _value_ is asserted (`tokenExpiresAt: expect.any(Date)`) but not the boundary behavior itself. Real email delivery isn't tested since it isn't implemented (`invite/sent` fires into `NoopEventBus`).
- **How to run:** `pnpm --filter @brunchsters/core test` (unit); `supabase start && pnpm db:seed && pnpm --filter @brunchsters/core test:integration` (integration)

### M2 — `respondToInvite` + `getBrunchById` viewer fields

- **What was tested:** `respondToInvite` — first-response create path (with `invitedUserId` backfill only when it was null), subsequent-response update path (no lock — a decline can become an accept and vice versa), invalid/expired/revoked token rejection, missing-`RsvpStatus`-row and unexpected-DB-error mapping, emit-failure-still-Ok, and the correct event name (`rsvp.received` vs. `rsvp.changed`) on first vs. later responses. `getBrunchById`'s new `isHost`/`viewerRsvpStatus` fields — correct for host, attendee-with-a-response, and attendee-with-no-response-yet cases, plus a query-shape assertion confirming the `attendees` include is scoped to the viewer only (not a full attendee list — that stays `getInvitesForBrunch`'s, host-only, job).
- **How:** 11 unit tests on `respondToInvite` (mocked `DbClient`/`EventBus`) + 3 new/updated `getBrunchById` unit tests. 4 integration tests against local Supabase Postgres: updating a known invitee's eagerly-created attendee row, creating an unregistered invitee's attendee row for the first time (real second `User` row created mid-test to simulate signing up via the token, then responding) with `invitedUserId` backfill verified against a real row, changing a response, and an invalid-token rejection. Mocked nothing in integration.
- **Correction from M6:** this note originally claimed the "viewer already has a `BrunchAttendee` via a different invite" case was unreachable and not worth testing — that was wrong. It's exactly what happens when an already-signed-in user (most commonly the host) clicks an invite link that isn't theirs, and it crashed in manual testing. See M6's notes for the fix and the tests that now cover it.
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

### M6 — Public invite landing page

- **What was tested:** All three Invitee Journey entry points from `spec.md`, manually in the browser with two real Google accounts: (1) an already-authenticated user clicking a valid invite link redirects straight to the brunch detail page with no intermediate screen; (2) a signed-out visitor sees the minimal brunch preview and a "Sign in with Google" link, and after signing in with a second account (added as a Google OAuth consent-screen test user, since the app is still in Testing publishing status) lands on the brunch detail page auto-accepted; (3) an invalid/nonexistent token shows a generic "expired or invalid" message with no brunch details leaked. Also manually verified the new "Copy link" button on the host's invite panel.
- **How:** Manual browser walkthrough only — no automated tests for this page beyond typecheck/lint, consistent with the rest of this spec's UI milestones (framework rendering isn't unit tested per CLAUDE.md; Playwright E2E remains deferred). The two real bugs this walkthrough caught were fixed with proper automated coverage in `packages/core` (see below), since the bugs were in service logic, not framework rendering.
- **What's deferred:** Playwright E2E for the full multi-account flow (no harness yet). No test for a token that becomes invalid _between_ the preview fetch and the `respondToInvite` call (a race too narrow to be worth manufacturing).
- **How to run:** `supabase start && pnpm dev` → sign in, get an invite link from a brunch's invite panel, open it in a second browser/incognito session

**Two real bugs found and fixed during this milestone's manual testing** (both now have unit + integration coverage):

1. **Missing invite link.** `spec.md` calls for "each entry's copyable link" on the invite panel; M5 only rendered email + status. Fixed by adding `token` to `getInvitesForBrunch`'s `InviteListItem` and a "Copy link" button.
2. **Crash when an already-signed-in brunch member clicks someone else's pending invite link.** `respondToInvite` only checked for an attendee row tied to _that invite_; if none existed yet, it tried to create one for the viewer — colliding with `BrunchAttendee`'s `(brunchId, userId)` unique constraint when the viewer (typically the host) already had a row from a different relationship. Fixed by checking brunch-level membership first and treating an existing membership as a no-op (redirect in, don't touch their RSVP or emit an event) rather than an error. This also corrects a wrong claim in M2's testing notes that called this case unreachable.

### M7 — RSVP control + invite-suggestion UI

- **What was tested:** `updateRsvp` — existing attendee (including the host, via their synthetic attendee row) can change their RSVP, `not_attendee` for a viewer with no attendee row on the brunch, missing-`RsvpStatus`-row and unexpected-DB-error mapping, emit-failure-still-Ok, correct event payload. `getPendingSuggestionsForBrunch` — `brunch_not_found`, `not_host`, empty list, and a mapped list that correctly excludes declined suggestions and includes `suggestedByName`. The new `POST /api/v1/brunches/[id]/rsvp` route — 401/404/422/403/500/200 status mapping, same pattern as every other route this spec added. `getBrunchById`'s new `allowInviteSuggestions` field. Full end-to-end browser walkthrough across every milestone in this spec in one session (wizard invite → second-account join+auto-accept → RSVP change → suggestion → host approve → resend/revoke).
- **How:** 8 unit tests on `updateRsvp` + 4 on `getPendingSuggestionsForBrunch` (mocked `DbClient`/`EventBus`) + 6 on the new `getBrunchById` test (extended, not new) + 6 on the new RSVP route (mocked service, real Zod schema) = 24 new unit tests. 3 integration tests for `updateRsvp` + 4 for `getPendingSuggestionsForBrunch` against local Supabase Postgres = 7 new integration tests. Manual browser walkthrough for the two new client components (`RsvpControl.tsx`, `SuggestionsPanel.tsx`) and the full cross-milestone flow, since framework rendering isn't unit tested per CLAUDE.md.
- **What's deferred:** Playwright E2E for the full multi-account flow remains deferred (no harness yet, consistent with M6). No test covers a suggestion made by the host being auto/manually approved and then reviewed via the pending-suggestions UI specifically — `suggestInvitee` still technically permits a host-authored suggestion at the service level (unchanged, out of scope here); only the UI's "Suggest someone" input is hidden for hosts. If a host suggestion existed (e.g. created directly via the API), it would still appear correctly in the host's own pending-suggestions review list — that path isn't specifically exercised but follows the same code as any other pending suggestion.
- **How to run:** `pnpm --filter @brunchsters/core test` + `pnpm --filter @brunchsters/web test` (unit); `supabase start && pnpm db:seed && pnpm --filter @brunchsters/core test:integration` (integration); `supabase start && pnpm dev` for the manual walkthrough

**Result:** 115 unit + 41 integration tests in `packages/core` (up from 103/34), 74 unit tests in `apps/web` (up from 68). `pnpm typecheck && pnpm lint && pnpm test` and `pnpm --filter @brunchsters/core test:integration` all green.

### PR review fixes (before merge)

Code review of PR #5 (the full spec 0004 diff) surfaced three issues, all fixed on the same branch:

- **`revokeInvite` wasn't revoking access for known-user invitees.** `sendInvites` eagerly creates a `BrunchAttendee` row for invitees who are already registered users, before they ever click the link. `revokeInvite` only soft-deleted the `BrunchInvite` row, leaving that `BrunchAttendee` row (and therefore the invitee's `getBrunchById` access and ability to call `updateRsvp`) untouched — a host revoking a known user's invite silently failed to actually revoke anything for them. Fixed by wrapping the invite update and an `updateMany` soft-delete of the linked attendee row in one `$transaction`. New unit test + a real-Postgres integration test confirming both the attendee row's `deletedAt` and the loss of `findFirst`-visible membership.
- **`reviewInviteSuggestion`'s approve path wasn't atomic.** It called `sendInvites` (its own separate transaction) and then updated the suggestion's status as a second, unrelated write — if the second write failed after the first succeeded, a real invite would exist while the suggestion stayed stuck at `pending`. Fixed by extracting the invite create-or-revive loop out of `sendInvites` into an exported `sendInvitesInTransaction(tx, input)` helper that both `sendInvites` (opens its own transaction) and `reviewInviteSuggestion` (runs it and the suggestion-status update in one shared transaction) call. `sendInvites`'s own external behavior and test suite are unchanged; `reviewInviteSuggestion`'s tests updated to mock the new helper instead of `sendInvites` directly, plus a test asserting the suggestion-status update never runs if invite creation fails in the same transaction.
- **Minor UX nit:** `getBrunchById`'s `viewerRsvpStatus` could surface the internal `'invited'` placeholder status (assigned eagerly by `sendInvites` before a known-user invitee ever responds) verbatim through the RSVP control's "Current: …" display. Folded into `undefined` alongside "no attendee row at all," same as any other not-yet-responded state.

**Result after fixes:** 118 unit + 42 integration tests in `packages/core` (up from 115/41), 74 unit tests in `apps/web` (unchanged). `pnpm typecheck && pnpm lint && pnpm test` and `pnpm --filter @brunchsters/core test:integration` all green.

### Second review pass (before merge)

A follow-up `/code-review` of the full spec 0004 diff (8 finder angles + verification) surfaced one more real bug plus several convention/robustness gaps, all fixed on the same branch:

- **The revoke → re-invite → respond flow still crashed for known users.** The previous fix made `revokeInvite` soft-delete the `BrunchAttendee` row correctly, but `sendInvitesInTransaction`'s revive branch (re-inviting an email with an existing, possibly soft-deleted, `BrunchInvite` row) only revived the `BrunchInvite` — it never checked for or revived the paired soft-deleted `BrunchAttendee` row. Re-inviting a previously-revoked known user (via `sendInvites` directly, or via `reviewInviteSuggestion`'s approve path, which shares the same helper) produced a valid new token, but clicking it hit `respondToInvite`'s `create()` call, which violated the `BrunchAttendee.inviteId`/`[brunchId, userId]` unique constraints against the still-present soft-deleted row — a 500 and a permanently unusable invite. Fixed by having the revive branch look up the attendee row via `findUnique` (bypasses the soft-delete extension, same pattern already used for the invite lookup) and, if it's soft-deleted, revive it: reset to the `invited` status and clear the RSVP-specific fields (`respondedAt`, `arrivingLate`, `leavingEarly`, `dietaryNote`, `decideBy`, `regretNote`, `inviteNextTime`) alongside `deletedAt`/`deletedBy`. New unit tests covering revive-with-existing-attendee, revive-with-no-attendee (unregistered invitee), and resend-of-a-still-active-invite (no-op), plus a real-Postgres integration test exercising the full revoke → re-invite → `respondToInvite` path end to end.
- **Host self-invite/self-suggestion filters were case-sensitive.** `sendInvites`'s self-filter, `getInvitesForBrunch`'s exclusion query, and `suggestInvitee`'s `cannot_suggest_host` check all compared emails with `===`/exact-match, so a differently-cased address matching the host's own email (e.g. `Host@Example.com` vs. the stored `host@example.com`) slipped through as a real self-invite or self-suggestion. Normalized all three comparisons with `.toLowerCase()` (`getInvitesForBrunch`'s Prisma query now uses `NOT: { invitedEmail: { equals, mode: 'insensitive' } }`, since `mode` isn't available on the nested `not` filter). New unit tests for each.
- **`InvitePanel`'s resend/revoke and `SuggestionsPanel`'s approve/decline silently ignored failed requests.** Unlike the sibling `sendInvite`/`suggest` handlers in the same files, they didn't check `response.ok` or surface an error, so a failed resend/revoke/review (403, 404, 409 on a double-click, 500) looked identical to success in the UI. Brought in line with the sibling handlers: error state on failure, and a per-item `disabled` guard to prevent double-submission.
- **Brunch detail page silently dropped unexpected `Err` results.** `getInvitesForBrunch`/`getPendingSuggestionsForBrunch` are only ever called when `isHost` was just established, so their `Err` branches are believed unreachable — but the page omitted the panel with no logging at all if that invariant were ever violated, unlike every route handler in this spec. Added `console.error` on both `Err` branches, and switched the two independent host-only fetches from sequential `await`s to `Promise.all`.
- **Convention gaps flagged by the Conventions/Reuse review angles**, all fixed: `InviteSummary.invitedEmail`, `InviteListItem.invitedEmail`, and `SuggestionListItem.suggestedEmail` now use the branded `Email` type (matching `EmailService`'s existing `to: Email`) instead of raw `string`; added a new branded `InviteToken` type (`packages/shared`) and applied it to `getInviteByToken`, `respondToInvite`, and `InviteListItem.token`; `getBrunchById`'s `viewerRsvpStatus` is now `'yes' | 'no' | 'maybe' | undefined` instead of `string | undefined`; `createBrunch.ts`'s local `LookupNotFoundError` class (a duplicate of the shared one added earlier this spec, with a different class identity) was removed in favor of importing the shared class from `packages/core/src/errors`.
- **Not fixed, left as noted debt:** the "is requester the host" check, the invite-validity (token expiry) predicate, and the auth/param-parsing/`Result`→HTTP-status boilerplate are each duplicated across 5-8 files in `packages/core/src/invite` and `apps/web/src/app/api/v1` rather than factored into shared helpers; `sendInvitesInTransaction`'s per-email loop does 2-4 sequential Prisma calls per invitee instead of batching. All real but higher-risk/higher-scope than a review-fix pass — candidates for a dedicated refactor milestone, not folded in here.

**Result after this pass:** 123 unit + 43 integration tests in `packages/core` (up from 118/42), 74 unit tests in `apps/web` (unchanged). `pnpm typecheck && pnpm lint && pnpm test` all green. Integration suite (`pnpm --filter @brunchsters/core test:integration`) not re-run in this environment (no local Supabase instance available) — the new revive-flow integration test needs to be run against local Postgres before merge.

**Result after fixes:** 118 unit + 42 integration tests in `packages/core` (up from 115/41), 74 unit tests in `apps/web` (unchanged). `pnpm typecheck && pnpm lint && pnpm test` and `pnpm --filter @brunchsters/core test:integration` all green.
