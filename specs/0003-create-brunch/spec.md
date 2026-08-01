# Spec 0003 — Create Brunch

**Status:** Draft  
**Branch:** `feat/0003-create-brunch`  
**PLANNING.md ref:** §5 Host Journey, §6 Permissions Model, §8 Brunch / Location & Time / Invites & Attendees schema, §9.3 Timezone Handling, §9.6 Synthetic Invite for Host, §9.7 Voting Close Rule, §10 Async Event Architecture

---

## What

Build the end-to-end "create a brunch" flow: the dashboard as the entry point, the `createBrunch` service, the API routes, and a three-step creation wizard (title/description → where → when). Covers the host's brunch creation journey through step 3; invitations (step 4 — Who?) are deferred to spec 0004.

Also covered:

- `GooglePlacesProvider` — concrete implementation of the `PlaceProvider` interface using **Places Autocomplete (New) with session tokens** (cost-efficient search-as-you-type) plus the Time Zone API for IANA timezone resolution
- Host auto-attendee: on creation the host is added as an attendee with `rsvpStatus = yes` via a synthetic invite (PLANNING.md §9.6); the synthetic token is created **already expired** (Constitution 28 — least privilege; the host never redeems it)
- `decisionType` inference from behavior: 1 location/time → `host_decides`; 2+ → `group_vote` (Constitution Principle 4)
- Optional **voting deadline**: when the host adds 2+ locations or times, the wizard offers a "Voting closes by" field (PLANNING.md §9.7 — voting closes on `votingDeadline`)
- `brunch/created` **event emission** through the `EventBus` interface (no-op implementation for now; Inngest lands in a later spec without changing service signatures)
- **Middleware fix**: unauthenticated requests to `/api/*` return 401 JSON instead of a 307 redirect to the sign-in page
- **ADR deferring next-intl** (PLANNING.md §9.12 says "from day one"; we are deliberately deferring to pre-launch — documented, not silent divergence)
- Seed update: four `NotificationType` codes missing from the existing seed script

---

## User Flows

### Create Brunch — host

1. Authenticated user visits `/dashboard`
2. Sees empty state ("No brunches yet") with a prominent "Plan a Brunch" CTA
3. Clicks CTA → navigates to `/brunch/new`
4. **Step 1 — What?** Title (required, max 100 chars) + description (optional, max 500 chars) → Next
5. **Step 2 — Where?** Types in a search box → autocomplete predictions appear → selects a place (full details, including timezone, fetched on selection). Can add more (a second place triggers a hint: "Multiple locations will be put to a vote"). Can remove. → Next
6. **Step 3 — When?** Picks a date + time → added to the list. Can add more (same multi-option hint). If 2+ locations **or** 2+ times exist, an optional "Voting closes by" datetime field appears. → Create Brunch
7. Wizard POSTs to `POST /api/v1/brunches`. On success → redirect to `/brunch/[id]`
8. Brunch detail page shows the title (placeholder; full UI in later specs)
9. `/dashboard` now shows the new brunch in the list

Locations and times are optional — the host can create a brunch and add them later. A brunch with no locations or times starts in `draft` status.

### Dashboard — returning user

1. Authenticated user visits `/dashboard`
2. Sees a list of brunches where they are the host or an attendee, sorted by `createdAt DESC`
3. Each card shows: title, status label, going count (attendees whose `rsvpStatus.countsAsAttendee = true`)
4. Past brunches (status = `completed`, `cancelled`, `archived`) shown below upcoming ones

### Place search detail — step 2

- When the user starts typing, the wizard generates a **session token** (`crypto.randomUUID()`)
- User types → debounced `GET /api/v1/places/search?q=<query>&sessionToken=<token>` (server-side proxy to Places Autocomplete (New); API key never reaches the browser)
- Predictions dropdown: place name + secondary text (address)
- User selects → `GET /api/v1/places/[placeId]?sessionToken=<token>` fetches full details including IANA timezone; passing the token closes the billing session
- Selected place appears in the "Locations" list below the search box; session token is discarded (a new one is generated if the user searches again)
- User can remove any selected place
- Adding a second place shows the voting hint
- Queries shorter than 3 characters do not fire a search

### Brunch detail — access rule

Only the host or a (non-deleted) attendee can view `/brunch/[id]`. Anyone else — including other authenticated users — gets a 404 (not 403; don't leak existence). The invite-token entry path arrives in spec 0004 with its own access rule.

---

## Acceptance Criteria

### Seed data

- [ ] Seed is updated to add missing `NotificationType` codes: `brunch.cancelled`, `vote.autoclose.prompted`, `running.late`, `host.transferred`
- [ ] `pnpm db:seed` is idempotent (run twice, row counts unchanged)

### Service

- [ ] `createBrunchInputSchema` (Zod) lives in `packages/core` next to the service; `CreateBrunchInput` is inferred from it — no hand-written duplicate type in the route
- [ ] `createBrunch` in `packages/core` creates `Brunch` with `status = draft`
- [ ] Host `BrunchAttendee` created with `rsvpStatus = yes` and `respondedAt = now`
- [ ] Synthetic `BrunchInvite` created for host with `tokenExpiresAt = createdAt` (born expired — never redeemable)
- [ ] `BrunchLocation` records created with correct `decisionTypeId`: 1 location → `host_decides`; 2+ → `group_vote`
- [ ] `BrunchTime` records created with same `decisionTypeId` inference, independently of locations
- [ ] Empty `locations` or `times` arrays are accepted (fields/times can be added later)
- [ ] Optional `votingDeadline` is validated (must be in the future) and stored on `Brunch`
- [ ] `brunch/created` event is emitted via the injected `EventBus` after the transaction commits; emit failure does not fail the create
- [ ] `getBrunchesForUser` returns all active brunches (hosted and attended) for the given `UserId`
- [ ] `getBrunchById` requires a `viewerId` and returns `undefined` unless the viewer is the host or a non-deleted attendee
- [ ] Unit tests cover all `createBrunch` code paths (new brunch, 0/1/2+ locations, 0/1/2+ times, votingDeadline, event emission, DB error)
- [ ] Integration test for `createBrunch` verifies all DB rows are created correctly against local Postgres

### API routes

- [ ] Middleware returns **401 JSON** (not a 307 redirect) for unauthenticated requests to `/api/*` paths; page routes keep the sign-in redirect
- [ ] `POST /api/v1/brunches` returns 201 with `{ id, title, status }` on success
- [ ] `POST /api/v1/brunches` returns 422 when title is missing or invalid
- [ ] `POST /api/v1/brunches` returns 401 for unauthenticated requests
- [ ] `GET /api/v1/brunches` returns 200 with the user's brunch list
- [ ] `GET /api/v1/brunches` returns 401 for unauthenticated requests
- [ ] `GET /api/v1/places/search?q=&sessionToken=` returns 200 with `{ places: PlaceResult[] }`; 400 when `q` is missing or under 3 characters
- [ ] `GET /api/v1/places/[placeId]?sessionToken=` returns 200 with `PlaceDetails` including `timezone`
- [ ] Route handler unit tests cover validation and auth checks
- [ ] `pnpm typecheck` and `pnpm lint` pass

### UI

- [ ] `/dashboard` shows empty state with "Plan a Brunch" CTA when the user has no brunches
- [ ] `/dashboard` shows a brunch card list when brunches exist; past brunches separated from upcoming
- [ ] `/brunch/new` wizard renders step 1 with title/description inputs
- [ ] Step navigation: Next is disabled until the step's required fields are filled
- [ ] Step 2 place search fires on keystroke (debounced 300ms, min 3 chars); predictions appear in a dropdown
- [ ] Selecting a place fetches full details (including timezone) before adding to the list; session token lifecycle handled per flow above
- [ ] Adding a second location or time shows the "will be put to a vote" hint
- [ ] "Voting closes by" optional field appears when 2+ locations or 2+ times are present
- [ ] Step 3 datetime picker uses `<input type="datetime-local">`; value sent to API as UTC ISO string
- [ ] Submit button shows a loading state during the POST
- [ ] On success, user is redirected to `/brunch/[id]`
- [ ] `/brunch/[id]` displays the brunch title (stub — full detail page in later spec); 404 for non-members and malformed IDs
- [ ] `pnpm typecheck` and `pnpm lint` pass
- [ ] Full browser test: create a brunch with 1 location + 1 time; verify it appears on the dashboard

### Docs

- [ ] ADR `docs/adrs/0005-defer-next-intl.md` written; PLANNING.md §9.12 updated to reference it

---

## What This Spec Does Not Cover

- Step 4 — invitations (Who?) → spec 0004
- Brunch detail / manage page beyond the title stub → later spec
- RSVP flow, voting UI, realtime updates, notifications → later specs
- Inngest — the `EventBus` interface is injected now, but the real queue-backed implementation is a later spec; v1 of this spec ships a no-op
- Editing or deleting a brunch → later spec
- Host transfer, undo-cancel, running late → later spec
- Playwright E2E — create-brunch is the critical flow and will get E2E coverage when the Playwright harness is set up (no E2E infra in the repo yet); manual browser verification covers this spec
- Dish/ingredient preference display in the wizard (v1 schema-only; no UI)
- User profile editing, account settings
- Apple Sign-In
