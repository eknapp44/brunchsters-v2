# Spec 0004 — Invitations

**Status:** Complete  
**Branch:** `feat/0004-invitations` (merged)  
**PLANNING.md ref:** §5 Invitee Journey / Confirmation Lock Rules / Minimum Brunch Size, §6 Permissions Model, §7 Notifications, §8 Invites & Attendees schema, §9.5 Token Lifecycle, §9.6 Synthetic Invite for Host, §10 Async Event Architecture, Constitution 28 (least privilege for invite tokens), Constitution 29 (email is identity, not contact info)

---

## What

Build the end-to-end invitation flow: the host sends invites (from the create-brunch wizard's step 4, and from the brunch detail page for adding people after the fact), invitees respond via a public token-based link across all three PLANNING §5 entry points (existing user / new user via Google / unregistered user), and invitees can suggest additional people subject to host approval.

Real email delivery is **not** part of this spec — invites work today via a copyable per-invitee link the host shares themselves, consistent with `brunch/created`'s no-op `EventBus` from spec 0003. `invite/sent` fires the same way and will start actually sending email once the Inngest spec ships a real `EventBus` implementation; nothing about that swap requires touching this spec's code.

Also covered:

- **Brunch status transition:** `draft` → `active` on the first invite sent (PLANNING §8 / spec 0003's deferred note)
- **Token lifecycle:** flat 30-day expiry when the brunch has no scheduled time yet. When a time is later confirmed, expiry should recompute to `scheduledAt + 7 days` (PLANNING §5 Edge Cases) — that recompute is a **documented hook**, not implemented here, since nothing in this spec confirms a time (confirmation is a future spec)
- **Resend:** updates the _same_ `BrunchInvite` row — new token, new `tokenExpiresAt`, `lastResentAt = now`; the old token is invalidated immediately (single active token per invite)
- **Revoke:** soft-deletes the invite row (`deletedAt`/`deletedBy`)
- **Duplicate invites:** a new `@@unique([brunchId, invitedEmail])` constraint on `BrunchInvite`. Re-inviting an address that already has an active invite on that brunch transparently resends rather than erroring or duplicating. A host cannot invite their own email (already the synthetic host invite).
- **Reconsideration window:** a declined invitee can change their response until the brunch is confirmed (PLANNING §5 Edge Cases) — confirmation itself doesn't exist yet, so in practice this means "always, for now"
- **Invite suggestions:** an attendee can suggest someone else be invited; the host approves (creates a real invite) or declines. Gated by the existing `allowInviteSuggestions` / `requireHostApprovalToInvite` permission flags on `Brunch`

---

## User Flows

### Host sends invites — wizard step 4

1. After Step 3 (When?), the wizard shows **Step 4 — Who?**: an email input (add multiple, one at a time, with a running list + remove buttons)
2. Step is optional — "Create Brunch" (relabeled from "Send Invites" when the list is empty) works with zero invites, same as today
3. On submit, the brunch is created (as today) and, if any emails were added, `sendInvites` runs against the newly created brunch in the same request
4. Redirects to `/brunch/[id]` as today. If invites were sent, the detail page shows the invite list (email + status: pending/accepted/declined) and each entry's copyable link

### Host invites more people later — detail page

1. Host (only) sees an "Invite more people" control on `/brunch/[id]`
2. Same email-list input as the wizard step; submits to the same `sendInvites` service via its own route
3. New invitees appear in the existing invite list; brunch transitions to `active` if it was still `draft`

### Invitee — existing user (already signed in)

1. Clicks the invite link (`/invite/[token]`)
2. Already authenticated → token validated (not expired, not revoked) → immediately redirected to `/brunch/[id]`
3. If no explicit RSVP yet, first visit to `/brunch/[id]` should surface a lightweight yes/no/maybe prompt (a simple inline control on the stub detail page — not a modal, not a separate page)

### Invitee — new user via Google (unregistered)

1. Clicks the invite link while signed out
2. `/invite/[token]` (public route) validates the token and shows a **brunch preview**: title, host name, status label — no attendee list, no other PII (Constitution 29)
3. "Sign in with Google" button — `callbackUrl` set back to `/invite/[token]` (same mechanism `/sign-in` already uses)
4. Google sign-in completes → account auto-created via existing `signInWithProvider` → redirected back to `/invite/[token]`, now authenticated
5. Token is validated again and the invite is auto-accepted (`respondToInvite` with `yes`) → redirect to `/brunch/[id]`

### Invitee — expired or revoked token

1. Clicks the invite link → token lookup fails the validity check
2. Friendly message: "This invite has expired. Ask [host name] to resend it." No brunch details shown (don't leak existence to an invalid token)

### Invitee — suggests someone

1. On `/brunch/[id]`, an attendee (not just the host) sees a "Suggest someone" control when `Brunch.allowInviteSuggestions` is true
2. Submits an email → creates a `BrunchInviteSuggestion` (`status = pending`)
3. If `requireHostApprovalToInvite` is true (the default), the suggestion waits for host review
4. If false, the suggestion is auto-approved and immediately becomes a real invite (still routes through `sendInvites` for the uniqueness/resend handling)

### Host — reviews a suggestion

1. Host sees a pending-suggestions list on `/brunch/[id]` (host-only)
2. **Approve** → `sendInvites` runs for that email, suggestion marked `approved`, `reviewedBy`/`reviewedAt` set
3. **Decline** → suggestion marked `declined`, no invite created

---

## Acceptance Criteria

### Schema

- [ ] `@@unique([brunchId, invitedEmail])` added to `BrunchInvite`; migration generated and committed
- [ ] No other schema changes needed — `BrunchAttendee`, `BrunchInviteSuggestion`, `BrunchInviteSuggestionStatus`, permission flags on `Brunch` already exist from earlier specs

### Services (`packages/core`)

- [ ] `sendInvites({ brunchId, invitedById, emails }, ctx)`:
  - Rejects the host's own email (can't invite yourself)
  - For each email: if an active `BrunchInvite` already exists for `(brunchId, email)`, calls the resend path instead of creating a duplicate; otherwise creates a new row
  - New invites get `tokenExpiresAt` = 30 days from now (no `BrunchTime` confirmed yet — always true today, since nothing confirms a time in this spec)
  - Transitions `Brunch.status` from `draft` to `active` if this is the brunch's first-ever invite
  - Fires `invite/sent` via the injected `EventBus` per invite (best-effort, never fails the create — same pattern as `brunch/created`)
- [ ] `resendInvite({ inviteId, requestedById }, ctx)`: regenerates `token`, extends `tokenExpiresAt`, sets `lastResentAt = now`; only the host may resend; fires `invite/resent`
- [ ] `revokeInvite({ inviteId, requestedById }, ctx)`: soft-deletes the invite; only the host may revoke
- [ ] `getInviteByToken(token, ctx)`: returns invite + brunch preview (title, host name, status label) for a valid, non-expired, non-revoked token; `undefined` otherwise. No attendee list, no other invitees' emails.
- [ ] `respondToInvite({ token, viewerId, response }, ctx)` where `response` is `yes | no | maybe`:
  - Validates the token, creates or updates the `BrunchAttendee` row (upsert on `brunchId + userId`) with the chosen `RsvpStatus`
  - Allows re-responding (change of mind) — no "already responded" hard stop
  - Fires `attendee/rsvp.received` (first response) or `attendee/rsvp.changed` (subsequent)
- [ ] `suggestInvitee({ brunchId, suggestedById, email }, ctx)`: creates a `BrunchInviteSuggestion`; auto-approves (creates the invite via `sendInvites`) when `requireHostApprovalToInvite` is false, otherwise leaves `status = pending`; rejects if `allowInviteSuggestions` is false
- [ ] `reviewInviteSuggestion({ suggestionId, reviewedById, decision }, ctx)` where `decision` is `approve | decline`: only the host may review; approve calls `sendInvites` for the suggested email and sets `status = approved`; decline sets `status = declined`
- [ ] Unit tests for every service covering: happy path, permission/ownership checks (host-only actions), duplicate-email resend behavior, expired/revoked token rejection, and DB error mapping
- [ ] Integration test against local Postgres covering the full send → respond → resend → revoke lifecycle with real rows

### API routes

- [ ] `POST /api/v1/brunches/:id/invites` — body `{ emails: string[] }`; 201 with the created/updated invite summaries; 403 if requester isn't the host; 422 on invalid emails
- [ ] `POST /api/v1/invites/:id/resend` — host-only; 200 with updated invite; 403 for non-hosts; 404 for unknown invite
- [ ] `DELETE /api/v1/invites/:id` — host-only; 204; 403 for non-hosts
- [ ] `GET /api/v1/invites/:token` — **public** (no auth required, matches the existing `/invite/` middleware prefix); 200 with brunch preview; 404 for invalid/expired/revoked tokens
- [ ] `POST /api/v1/invites/:token/respond` — body `{ response: 'yes' | 'no' | 'maybe' }`; requires auth (token validity + session both checked); 200 on success; 404 for invalid tokens; 401 if unauthenticated
- [ ] `POST /api/v1/brunches/:id/suggestions` — body `{ email: string }`; any attendee (not just host); 201; 403 if suggestions disabled for the brunch
- [ ] `POST /api/v1/suggestions/:id/review` — body `{ decision: 'approve' | 'decline' }`; host-only; 200; 403 for non-hosts
- [ ] Route handler unit tests cover auth/ownership checks and validation for every route
- [ ] `pnpm typecheck` and `pnpm lint` pass

### UI

- [ ] Wizard step 4 added to `/brunch/new`: email list input, add/remove, optional (submits with zero invites same as today)
- [ ] `/brunch/[id]` grows: invite list (email + status) for the host, "Invite more people" control (host-only), inline yes/no/maybe RSVP control for the viewer if unresponded, "Suggest someone" control (attendees, when permitted), pending-suggestions list + approve/decline (host-only)
- [ ] `/invite/[token]` public page: brunch preview for signed-out visitors, "Sign in with Google" with correct `callbackUrl`; authenticated visitors get auto-accepted and redirected to `/brunch/[id]`
- [ ] Expired/revoked token shows a friendly message, no brunch details
- [ ] `pnpm typecheck` and `pnpm lint` pass
- [ ] Full browser test: send an invite from the wizard, open the link in a private/second browser session, sign in as a different Google account, land on the brunch detail page, RSVP, verify the host's invite list reflects the response

### Docs

- [ ] `tasks.md` testing notes per milestone (same cadence as spec 0003)
- [ ] `PLANNING.md` §8 Invites & Attendees updated if the unique constraint or any field changes during implementation

---

## What This Spec Does Not Cover

- **Full manage page** (RSVP list beyond the invite panel, votes, confirm/cancel brunch) — a later spec; this spec only adds an invite panel to the existing detail-page stub
- **Rich RSVP fields** (`arrivingLate`, `leavingEarly`, `dietaryNote`, `decideBy`, `regretNote`, `inviteNextTime`) — plain `yes/no/maybe` only; columns already exist for a later spec to light up
- **Real email delivery** — `invite/sent`/`invite/resent` fire into the same no-op `EventBus` as `brunch/created`; real Resend delivery arrives with the Inngest spec
- **Time/location confirmation and the resulting token-expiry recompute** — confirming a brunch (locking mode, computing `scheduledAt + 7 days`) is a future spec; this spec only documents the hook
- **Voting UI, realtime updates, in-app notifications** — later specs
- **Push notifications** — deferred to v2 per PLANNING §7
- **Playwright E2E** — same rationale as spec 0003; manual browser verification covers this spec
- **Host transfer, undo-cancel, running late** — later specs
