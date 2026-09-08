# Plan 0004 — Invitations

**Companion to:** `spec.md`

---

## Architecture

### Files introduced

```
packages/database/prisma/migrations/<ts>_invite_email_unique/migration.sql   (new)
packages/database/prisma/schema.prisma                                        (updated — BrunchInvite unique constraint)

packages/core/src/invite/sendInvites.ts                                       (new)
packages/core/src/invite/sendInvites.test.ts                                  (new)
packages/core/src/invite/sendInvites.integration.test.ts                      (new)
packages/core/src/invite/resendInvite.ts                                      (new)
packages/core/src/invite/resendInvite.test.ts                                 (new)
packages/core/src/invite/revokeInvite.ts                                      (new)
packages/core/src/invite/revokeInvite.test.ts                                 (new)
packages/core/src/invite/getInviteByToken.ts                                  (new)
packages/core/src/invite/getInviteByToken.test.ts                             (new)
packages/core/src/invite/getInvitesForBrunch.ts                               (new)
packages/core/src/invite/getInvitesForBrunch.test.ts                         (new)
packages/core/src/invite/respondToInvite.ts                                   (new)
packages/core/src/invite/respondToInvite.test.ts                              (new)
packages/core/src/invite/suggestInvitee.ts                                    (new)
packages/core/src/invite/suggestInvitee.test.ts                               (new)
packages/core/src/invite/reviewInviteSuggestion.ts                            (new)
packages/core/src/invite/reviewInviteSuggestion.test.ts                       (new)
packages/core/src/brunch/getBrunchById.ts                                     (updated — viewerRsvpStatus, isHost)
packages/core/src/brunch/getBrunchById.test.ts                                (updated)
packages/core/src/index.ts                                                    (updated — new exports)

apps/web/src/app/api/v1/brunches/[id]/invites/route.ts                        (new — POST sendInvites)
apps/web/src/app/api/v1/brunches/[id]/invites/route.test.ts                   (new)
apps/web/src/app/api/v1/brunches/[id]/suggestions/route.ts                    (new — POST suggestInvitee)
apps/web/src/app/api/v1/brunches/[id]/suggestions/route.test.ts              (new)
apps/web/src/app/api/v1/invites/[id]/route.ts                                 (new — DELETE revokeInvite)
apps/web/src/app/api/v1/invites/[id]/route.test.ts                            (new)
apps/web/src/app/api/v1/invites/[id]/resend/route.ts                          (new — POST resendInvite)
apps/web/src/app/api/v1/invites/[id]/resend/route.test.ts                     (new)
apps/web/src/app/api/v1/invites/token/[token]/route.ts                        (new — GET getInviteByToken, public)
apps/web/src/app/api/v1/invites/token/[token]/route.test.ts                   (new)
apps/web/src/app/api/v1/invites/token/[token]/respond/route.ts                (new — POST respondToInvite)
apps/web/src/app/api/v1/invites/token/[token]/respond/route.test.ts           (new)
apps/web/src/app/api/v1/suggestions/[id]/review/route.ts                      (new — POST reviewInviteSuggestion)
apps/web/src/app/api/v1/suggestions/[id]/review/route.test.ts                 (new)

apps/web/src/app/(authenticated)/brunch/new/page.tsx                          (updated — step 4)
apps/web/src/app/(authenticated)/brunch/[id]/page.tsx                         (updated — invite panel, RSVP, suggestions)
apps/web/src/app/invite/[token]/page.tsx                                     (new — public invitee landing page)
```

### Route identifier separation (important)

Both `BrunchInvite.id` and `BrunchInvite.token` are random UUID-shaped strings. To avoid ever confusing "the internal row id, authorized via session + host check" with "the public capability token, authorized by mere possession," they live under **structurally different URL paths**:

- `/api/v1/invites/[id]` and `/api/v1/invites/[id]/resend` — host-authenticated, looked up by `id`. Never accept a bare token here.
- `/api/v1/invites/token/[token]` and `.../respond` — public/invitee-facing, looked up by `token` only. Never accept a bare `id` here.

Next.js App Router resolves these as distinct route trees (`invites/[id]/...` matches exactly one segment after `/invites/`; `invites/token/[token]/...` is a separate two-segment path), so there's no runtime ambiguity — but the _service layer_ also never exposes a lookup-by-either-field function, to keep the two identifier spaces from ever merging by accident.

---

## Key Design Decisions

### `BrunchAttendee` creation: eager for known users, lazy for unregistered ones

This follows directly from the existing schema, not a new choice: `BrunchAttendee.userId` is required (`NOT NULL`), but `BrunchInvite.invitedUserId` is nullable ("null until user signs up via token," PLANNING §9.5). So a `BrunchAttendee` row cannot exist before we know the invitee's `User.id`.

- **Invitee email already belongs to a registered `User`:** `sendInvites` looks up that `User` by email (`User.email` is `@unique`), creates the `BrunchInvite` with `invitedUserId` already set, **and** creates the `BrunchAttendee` row eagerly with `rsvpStatus = invited`, `respondedAt = null` — mirroring exactly how the host's synthetic invite is created in `createBrunch` (spec 0003), just with a real 30-day token instead of a born-expired one.
- **Invitee email has no account yet:** `sendInvites` creates only the `BrunchInvite` (`invitedUserId = null`). No `BrunchAttendee` exists yet. Once they sign up via the token and `respondToInvite` runs for the first time, it **creates** the `BrunchAttendee` row (rather than updating one) and backfills `BrunchInvite.invitedUserId`.

`respondToInvite` therefore has two branches: update the existing `BrunchAttendee` (known-user path) or create it for the first time (new-user path). Both end up in the same place — a `BrunchAttendee` row with the chosen `rsvpStatus`.

The invite panel (`getInvitesForBrunch`) reflects this with a `LEFT JOIN`-shaped query: an invite with no attendee row yet displays as "pending" the same way an invite with `rsvpStatus = invited` does — the UI doesn't need to distinguish "hasn't signed up" from "signed up, hasn't responded," only the host's mental model does, and that distinction isn't worth a spec note beyond this one.

### `sendInvites` — duplicate handling and validation

```typescript
async function sendInvites(
  input: { brunchId: BrunchId; invitedById: UserId; emails: readonly Email[] },
  ctx: { db: DbClient; eventBus: EventBus },
): Promise<Result<readonly InviteSummary[], SendInvitesError>>;
```

- Rejects if `invitedById` isn't the brunch's host (`kind: 'not_host'`)
- Rejects any email matching the host's own (`kind: 'cannot_invite_self'`) — the host already has the synthetic invite
- Per email, inside one transaction:
  - `BrunchInvite.findFirst({ brunchId, invitedEmail: email, deletedAt: null })` — if found, delegate to the same regenerate-token logic `resendInvite` uses (extracted as a shared internal helper so the two entry points share one code path) instead of creating a duplicate row
  - If not found, create per the eager/lazy rule above
- Sets `tokenExpiresAt` = now + 30 days for every **new** invite (no `BrunchTime` confirmation exists anywhere in this spec, so the "recompute to `scheduledAt + 7 days`" branch from PLANNING §5 never actually triggers here — documented as a hook for whichever future spec adds time confirmation, not implemented)
- If this is the brunch's first invite ever (no prior `BrunchInvite` rows besides the synthetic host one), updates `Brunch.status` from `draft` to `active`
- Fires `invite/sent` per invite via the injected `EventBus`, best-effort (same never-fail-the-create pattern as `brunch/created`)

### `resendInvite` / `revokeInvite` — host-only, single-row mutation

Both take `{ inviteId, requestedById }`, verify `requestedById` matches the brunch's `hostId` (loaded via the invite's `brunchId` relation), and mutate exactly one row. `resendInvite`: new `token` (`crypto.randomUUID()`), new `tokenExpiresAt` (30 days out — same rule as above), `lastResentAt = now`. `revokeInvite`: `deletedAt`/`deletedBy` set (soft delete, consistent with the rest of the schema).

### `getInviteByToken` — public preview, minimal surface

Returns only `{ brunchTitle, hostName, brunchStatusLabel }` for a valid token — deliberately **not** the full `BrunchDetail` shape, and never the attendee list or other invitees' emails (Constitution 29 — email is identity, not contact info; also don't leak who else is invited to someone who hasn't joined yet). `undefined` for any invalid state: expired, revoked (soft-deleted), or nonexistent token — the caller renders the same "expired or invalid" message regardless of which, so a bad token can't be used to distinguish "never existed" from "was revoked."

### `respondToInvite` — always allowed, no lock

Per PLANNING §5 ("declined invitee: allow them to change mind until confirmed"), there's no "already responded" hard stop in this spec — a brunch-confirmation lock is a future spec's job, so today `respondToInvite` simply always accepts a new response and updates `respondedAt`. Fires `attendee/rsvp.received` on first response, `attendee/rsvp.changed` on any subsequent one (mirrors the `invite/sent` vs `invite/resent` split).

### Invite suggestions — auto-approve short-circuits through `sendInvites`

`suggestInvitee` checks `Brunch.allowInviteSuggestions` (reject if false) and creates a `BrunchInviteSuggestion` (`status = pending`). If `Brunch.requireHostApprovalToInvite` is false, it immediately calls `sendInvites` for that email and marks the suggestion `approved` in the same transaction — "auto-approve" is not a separate code path, it's `reviewInviteSuggestion`'s approve logic invoked internally. `reviewInviteSuggestion` (host-only) does the same `sendInvites` call on approve, or just sets `status = declined` with no invite created.

### `getBrunchById` extended, not replaced

Spec 0003's `getBrunchById` already joins the viewer's `BrunchAttendee` row for authorization (`OR: [{ hostId }, { attendees: { some: { userId, deletedAt: null } } }]`) — it just doesn't currently _return_ anything from that join. This spec adds two fields to `BrunchDetail`: `isHost: boolean` and `viewerRsvpStatus: string | undefined` (the code of the viewer's own `RsvpStatus`, absent if they're the host viewing before... they always have `yes` immediately, so this is really only ever absent for an attendee who hasn't been given a `BrunchAttendee` row yet — the lazy-creation case above, which shouldn't be able to reach this page anyway since `getBrunchById`'s authorization requires an existing attendee or host row). This is an additive change to an already-tested function — existing M1 tests are unaffected; new assertions cover the two new fields.

### Wizard step 4

Reuses the exact `useReducer`/step-component pattern from spec 0003 (no new state management approach). Adds `step: 4`, an `emails: readonly Email[]` field to `WizardState`, `ADD_EMAIL`/`REMOVE_EMAIL` actions, and a `StepFour` component (email input + list + remove, same shape as the Step 2 locations list). On submit, if `emails.length > 0`, the same request that creates the brunch also includes the email list; the route handler calls `createBrunch` then `sendInvites` in sequence (not the same DB transaction as brunch creation — `sendInvites` has its own transactional boundary per invite; if invite-sending partially fails after the brunch is created, the brunch still exists and the host can retry from the detail page's "Invite more people" control, which is why that control exists rather than making step 4 an all-or-nothing gate).

### Detail page growth

The stub from spec 0003 (`<h1>{title}</h1>` + status + back link) grows, still deliberately not a "full manage page":

- Invite panel (host-only): list of `{ email, status }` from `getInvitesForBrunch`, resend/revoke buttons per row, "Invite more people" input
- RSVP control (any attendee without a terminal response conceptually "set" — in practice, always shown since there's no lock yet): three buttons, yes/no/maybe, calling `respondToInvite`
- Suggestion control (any attendee, when `allowInviteSuggestions`): email input, submits to `suggestInvitee`
- Pending suggestions list (host-only, when any exist): approve/decline buttons

### `/invite/[token]` public page

Server component. `getInviteByToken(token)` — `undefined` → render the "expired or invalid" message, no further data fetched. Otherwise: if `auth()` returns a session, immediately call `respondToInvite` with `yes` (auto-accept-on-click, per the Invitee Journey's "invisible handoff" requirement) and `redirect('/brunch/[id]')`; if no session, render the brunch preview + "Sign in with Google" button with `callbackUrl=/invite/[token]` (same mechanism `/sign-in` already uses — no new auth plumbing).

---

## Milestones

### M1 — Invite lifecycle: `sendInvites`, `resendInvite`, `revokeInvite`, `getInviteByToken`, `getInvitesForBrunch`

- Migration: `@@unique([brunchId, invitedEmail])` on `BrunchInvite`
- All five services implemented per the design above
- Unit tests (mocked `DbClient`/`EventBus`) covering: known-user vs unregistered-user branch, duplicate-email resend delegation, self-invite rejection, non-host rejection, `draft`→`active` transition on first invite, expired/revoked token returns `undefined`
- Integration test against local Postgres: full send → resend → revoke lifecycle with real rows, plus one known-user and one unregistered-user invite in the same run
- **Done when:** typecheck/lint/test green; committed

### M2 — `respondToInvite` + `getBrunchById` extension

- `respondToInvite` implemented (create-or-update branch, `rsvp.received` vs `rsvp.changed` emission)
- `getBrunchById` extended with `isHost`/`viewerRsvpStatus`
- Unit + integration tests (the create-branch case needs a real unregistered-invitee scenario, which the integration test from M1 already sets up test users for — reuse that fixture pattern)
- **Done when:** typecheck/lint/test green; committed

### M3 — Invite suggestions: `suggestInvitee`, `reviewInviteSuggestion`

- Both services implemented, including the auto-approve-through-`sendInvites` path
- Unit tests: permission-flag gating (`allowInviteSuggestions`, `requireHostApprovalToInvite`), auto-approve creates a real invite, host-only review, decline creates no invite
- **Done when:** typecheck/lint/test green; committed

### M4 — API routes

- All 7 routes listed in Architecture above, each a thin wrapper over its M1–M3 service (matches the existing `brunches`/`places` route pattern — session/host checks in the route, business logic in the service)
- `/invites/token/[token]` and its `respond` route are the only ones reachable while unauthenticated (already covered by the existing `/invite/` middleware public prefix — note the prefix is `/invite/` singular for the _page_, while the API path is `/api/v1/invites/` plural; middleware's `/api/` branch already 401s any unlisted API path, so **the public prefix list needs `/api/v1/invites/token/` added** — this is a real, easy-to-miss gap worth calling out explicitly since forgetting it would 401 the one API route that's supposed to be public)
- Route handler unit tests per route: auth/host checks, validation, success/error shapes
- **Done when:** typecheck/lint/test green; committed

### M5 — Wizard step 4 + detail page invite panel

- `brunch/new` wizard gains step 4 (email list, optional)
- `brunch/[id]` gains: invite panel (host), "invite more people" control (host), resend/revoke buttons (host)
- Manual browser verification: create a brunch with invites from the wizard, confirm the detail page shows them
- **Done when:** typecheck/lint pass; committed

### M6 — Invitee-facing `/invite/[token]` page

- Public landing page per the design above (preview, sign-in, auto-accept-on-auth)
- Manual browser verification across all three entry-point flows from spec.md's User Flows: existing signed-in user, brand-new Google sign-up, and an expired-token message
- **Done when:** typecheck/lint pass; committed

### M7 — Suggestion UI + RSVP control

- RSVP control on `brunch/[id]` (any attendee, yes/no/maybe)
- Suggestion control (attendees) + pending-suggestions review list (host)
- Full end-to-end browser test tying every milestone together: wizard → invites sent → second account opens link → signs up → RSVPs → suggests a third person → host approves → third invite appears
- **Done when:** typecheck/lint pass; full flow verified; committed; PR opened

---

## Dependencies / Environment

No new external services or API keys. `invite/sent`/`invite/resent` route through the existing `NoopEventBus` — real email delivery is explicitly out of scope (see spec.md). No new env vars.

---

## Testing Strategy

Same conventions as spec 0003: unit tests for every `packages/core` service and every route handler; one integration test suite against local Postgres covering the invite lifecycle end-to-end with real rows (including at least one known-user and one unregistered-user invitee, since that branch is the one piece of real complexity in this spec and is exactly the kind of thing that looks right in a mock but silently breaks against a real FK constraint). No new automated coverage for the two public-facing pages (`/invite/[token]`) beyond typecheck/lint — framework rendering isn't tested per CLAUDE.md, and Playwright E2E remains deferred; the multi-account browser walkthrough in M6/M7 is the verification for those.
