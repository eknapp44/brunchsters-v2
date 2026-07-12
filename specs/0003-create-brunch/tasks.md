# Tasks 0003 — Create Brunch

**Spec:** [spec.md](./spec.md) | **Plan:** [plan.md](./plan.md)  
**Branch:** `feat/0003-create-brunch`

---

## M1 — `createBrunch` service + integration test

- [ ] Update `packages/database/src/seed.ts` — add 4 missing `NotificationType` codes:
  - `brunch.cancelled` ("Brunch Cancelled", sortOrder 9)
  - `vote.autoclose.prompted` ("Vote Auto-Close Prompted", sortOrder 10)
  - `running.late` ("Running Late", sortOrder 11)
  - `host.transferred` ("Host Transferred", sortOrder 12)
- [ ] Run `pnpm db:seed` and verify `NotificationType` row count is 12; run again to confirm idempotency
- [ ] Write `docs/adrs/0005-defer-next-intl.md` — defer i18n plumbing to pre-launch; amend PLANNING.md §9.12 with a pointer to the ADR
- [ ] Update `packages/core/src/places/PlaceProvider.ts`:
  - `search(params: { query: string; sessionToken?: string })` / `getDetails(params: { placeId: string; sessionToken?: string })`
  - `PlaceResult` slims to `{ placeId, name, address }`; `placeUrl` moves to `PlaceDetails`
- [ ] Add `packages/core/src/events/NoopEventBus.ts` — implements `EventBus`, `emit` resolves immediately; export from index
- [ ] Add `zod` as a dependency of `packages/core`
- [ ] Implement `packages/core/src/brunch/createBrunch.ts`:
  - `createBrunchRequestSchema` (Zod) — title 1–100, description ≤500 optional, locations/times arrays defaulting to `[]`, `votingDeadline` optional ISO datetime with future-only `.refine`
  - `CreateBrunchRequest = z.infer<...>`; `CreateBrunchInput = CreateBrunchRequest & { hostId: UserId }`
  - Wrap all DB writes in `prisma.$transaction`:
    - Look up `BrunchStatus(draft)`, `RsvpStatus(yes)`, `BrunchDecisionType(host_decides, group_vote)` by code
    - Look up host `User` (email needed for synthetic invite) — `lookup_not_found` error if any missing
    - Create `Brunch` (incl. `votingDeadline` when provided)
    - Create synthetic `BrunchInvite` for host: `token = crypto.randomUUID()`, **`tokenExpiresAt = now` (born expired)**, `invitedEmail = host.email`, `invitedById = hostId`
    - Create `BrunchAttendee` for host (`rsvpStatusId = yes.id`, `respondedAt = now`)
    - Locations: `decisionTypeId` = `host_decides` if exactly 1 else `group_vote`
    - Times: same rule on `times.length`, independent of locations
  - After commit: `ctx.eventBus.emit('brunch/created', { brunchId, hostId })` in try/catch — emit failure logged, never fails the create
  - Return `Ok({ id })`; `Err({ kind: 'db_error' | 'lookup_not_found', ... })` on failure
- [ ] Implement `packages/core/src/brunch/getBrunchById.ts`:
  - `getBrunchById(input: { brunchId: BrunchId; viewerId: UserId }, ctx)` → `BrunchDetail | undefined`
  - Returns `undefined` unless brunch exists, `deletedAt IS NULL`, **and viewer is host or non-deleted attendee**
- [ ] Export `createBrunch`, `getBrunchById`, `createBrunchRequestSchema`, `NoopEventBus`, and types from `packages/core/src/index.ts`
- [ ] Write `packages/core/src/brunch/createBrunch.test.ts` — unit tests (mock `DbClient` + mock `EventBus`):
  - No locations + no times
  - 1 location → `host_decides`; 2 locations → `group_vote`
  - 1 time → `host_decides`; 2 times → `group_vote`
  - Locations and times inferred independently
  - `votingDeadline` stored when provided; past deadline rejected by schema
  - Synthetic invite `tokenExpiresAt` is not in the future
  - `brunch/created` emitted with `{ brunchId, hostId }` on success
  - Emit throwing does **not** fail the create (still `Ok`)
  - `Err({ kind: 'db_error' })` on transaction failure
  - `Err({ kind: 'lookup_not_found' })` on missing lookup row
- [ ] Write `packages/core/src/brunch/createBrunch.integration.test.ts` — against local Postgres:
  - 0 locations + 0 times: `Brunch`, `BrunchInvite`, `BrunchAttendee` rows created; invite already expired
  - 1 location → `host_decides`; 2 locations → both rows `group_vote`
  - Same for times
  - `afterAll` cleanup by brunchId; requires `supabase start` + seeded lookups
- [ ] Write `packages/core/src/brunch/getBrunchById.test.ts` — found as host, found as attendee, not found, soft-deleted → undefined, **non-member viewer → undefined**
- [ ] `pnpm typecheck && pnpm lint && pnpm test --filter @brunchsters/core` pass
- [ ] Commit: `feat: createBrunch and getBrunchById services with unit and integration tests (M1)`

---

## M2 — `getBrunchesForUser` service + unit tests

- [ ] Implement `packages/core/src/brunch/getBrunchesForUser.ts`:
  - Query `BrunchAttendee` where `userId = input.userId AND deletedAt IS NULL`
  - Include `Brunch` (`deletedAt IS NULL`) + `BrunchStatus`
  - `goingCount`: `_count` of attendees where `deletedAt: null` **and** `rsvpStatus.countsAsAttendee = true`
  - Sort by `brunch.createdAt DESC`
  - Map to `BrunchSummary[]`; `isHost = brunch.hostId === input.userId`
- [ ] Export `getBrunchesForUser` + `BrunchSummary` from `packages/core/src/index.ts`
- [ ] Write `packages/core/src/brunch/getBrunchesForUser.test.ts` — mock DbClient:
  - No attendee records → `[]`
  - Host of one brunch → `isHost = true`
  - Attendee (not host) → `isHost = false`
  - Soft-deleted `BrunchAttendee` / `Brunch` rows excluded
  - `goingCount` excludes `invited`/`no`/`maybe` RSVPs (only `countsAsAttendee = true`)
- [ ] `pnpm typecheck && pnpm lint && pnpm test --filter @brunchsters/core` pass
- [ ] Commit: `feat: getBrunchesForUser service with unit tests (M2)`

---

## M3 — Brunch API routes + middleware fix

- [ ] Update `apps/web/src/middleware.ts` — unauthenticated request to a path starting with `/api/` returns `NextResponse.json({ error: 'Unauthorized' }, { status: 401 })`; page routes keep the `/sign-in?callbackUrl=` redirect
- [ ] Verify manually: unauthenticated `curl http://localhost:3000/api/v1/brunches` → 401 JSON (not 307)
- [ ] Create `apps/web/src/app/api/v1/brunches/route.ts`:
  - **POST:**
    - `auth()` → 401 if no session
    - Parse body with `createBrunchRequestSchema` **imported from `@brunchsters/core`** (no local schema)
    - 422 on validation failure with `{ errors: zodError.flatten() }`
    - `createBrunch({ ...parsed, hostId: session.user.id as UserId }, { db, eventBus: new NoopEventBus() })`
    - `Err` → 500; `Ok` → 201 `{ id, title, status: 'draft' }`
  - **GET:**
    - `auth()` → 401 if no session
    - `getBrunchesForUser({ userId }, { db })` → 200 `{ brunches: BrunchSummary[] }`
- [ ] Write `apps/web/src/app/api/v1/brunches/route.test.ts` — mock services via `vi.mock`:
  - POST 201 on valid input
  - POST 422 on missing title
  - POST 401 on no session
  - GET 200 returns brunch list
  - GET 401 on no session
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass
- [ ] Commit: `feat: brunch API routes and 401 middleware handling for API paths (M3)`

---

## M4 — `GooglePlacesProvider` + places API routes

- [ ] Create a Maps API key in Google Cloud Console; enable **Places API (New)** and **Time Zone API**; restrict the key to those APIs
- [ ] Add `GOOGLE_PLACES_API_KEY=` to `apps/web/.env.local`
- [ ] Add `GOOGLE_PLACES_API_KEY=your_maps_api_key_here` to `.env.example` with comment: `# Google Maps API key (Places API (New) + Time Zone API) — NOT the OAuth client credentials`
- [ ] Implement `apps/web/src/adapters/GooglePlacesProvider.ts` (`implements PlaceProvider`, constructor takes `apiKey`):
  - `search({ query, sessionToken })`: POST `https://places.googleapis.com/v1/places:autocomplete`, body `{ input: query, sessionToken, languageCode: 'en' }`; map `suggestions[].placePrediction` → `PlaceResult` (name = `structuredFormat.mainText.text`, address = `structuredFormat.secondaryText.text`)
  - `getDetails({ placeId, sessionToken })`:
    - GET `https://places.googleapis.com/v1/places/${placeId}?sessionToken=...`, field mask `id,displayName,formattedAddress,googleMapsUri,location` (token closes the billing session)
    - GET Time Zone API with `location.latitude,longitude` + current unix timestamp → `timeZoneId`
    - Return `PlaceDetails` (incl. `placeUrl = googleMapsUri`, `timezone = timeZoneId as IanaTimezone`)
    - `undefined` on 404 from Place Details; throw on other non-2xx
- [ ] Create `apps/web/src/app/api/v1/places/search/route.ts`:
  - GET: `q` required and ≥3 chars → 400 otherwise; `sessionToken` optional pass-through
  - `new GooglePlacesProvider(process.env.GOOGLE_PLACES_API_KEY!)` → `search()` → 200 `{ places }`
  - Catch → 502 `{ error: 'Place search unavailable' }`
- [ ] Create `apps/web/src/app/api/v1/places/[placeId]/route.ts`:
  - GET: `getDetails()`; 404 if `undefined`; 200 `PlaceDetails`; catch → 502
- [ ] Manual verification (curl or browser dev tools):
  - `GET /api/v1/places/search?q=brunch+chicago` returns predictions
  - `GET /api/v1/places/[placeId]` returns details with `timezone: 'America/Chicago'`
  - `q=ab` (2 chars) returns 400
- [ ] `pnpm typecheck && pnpm lint` pass
- [ ] Commit: `feat: GooglePlacesProvider with Autocomplete sessions and places proxy routes (M4)`

---

## M5 — Dashboard UI

- [ ] Update `apps/web/src/app/(authenticated)/dashboard/page.tsx` (server component):
  - `auth()` for session; call `getBrunchesForUser({ userId }, { db })` directly (no fetch hop)
  - Split into `upcoming` (draft, active, confirmed) and `past` (completed, cancelled, archived)
  - Empty state when both lists empty: "No brunches yet" + "Plan a Brunch" button → `/brunch/new`
  - Brunch cards: title, status label, going count, "(Host)" badge when `isHost`
  - Past brunches in a secondary section below
- [ ] `pnpm typecheck && pnpm lint` pass
- [ ] Browser test (manual): fresh account sees empty state with CTA; populated state verified after M6
- [ ] Commit: `feat: dashboard with brunch list empty state and Plan a Brunch CTA (M5)`

---

## M6 — Create Brunch wizard + brunch detail stub

- [ ] Create `apps/web/src/app/(authenticated)/brunch/new/page.tsx` (client component):
  - `useReducer` wizard state: `{ step: 1|2|3, title, description, locations: PlaceDetails[], times: Date[], votingDeadline?: Date }`
  - **Step 1:** title input (required) + description textarea. "Next" disabled until title non-empty.
  - **Step 2:**
    - Session token: `crypto.randomUUID()` generated when user starts typing into an empty search box; passed on search + details calls; discarded after selection; regenerated on next search
    - Search box, 300ms debounce, min 3 chars → `GET /api/v1/places/search?q=...&sessionToken=...` → predictions dropdown
    - On select: `GET /api/v1/places/[placeId]?sessionToken=...` → add `PlaceDetails` to `locations`
    - Selected-locations list with remove buttons
    - Hint "Multiple locations will be put to a vote" when `locations.length > 1`
    - Step optional (can proceed with no locations)
  - **Step 3:**
    - `<input type="datetime-local">` + "Add Time" → adds `new Date(inputValue)` to `times`
    - Selected-times list with remove buttons
    - Hint "Multiple times will be put to a vote" when `times.length > 1`
    - **"Voting closes by" optional datetime field appears when `locations.length > 1 || times.length > 1`**
    - Step optional; "Create Brunch" button with loading state during POST
  - Submit: `POST /api/v1/brunches` with dates as UTC ISO strings (`.toISOString()`); on 201 → `router.push('/brunch/${id}')`; on error → inline message, state preserved
- [ ] Create `apps/web/src/app/(authenticated)/brunch/[id]/page.tsx` (server component):
  - Validate `params.id` is a UUID (Zod) → `notFound()` if malformed (no Prisma error on garbage input)
  - `getBrunchById({ brunchId, viewerId }, { db })` → `notFound()` if `undefined` (covers non-existent, soft-deleted, **and non-member**)
  - Render `<h1>{title}</h1>` + status label + "← Back to Dashboard" link
- [ ] `pnpm typecheck && pnpm lint` pass
- [ ] Full flow browser test:
  - Sign in → dashboard empty state → "Plan a Brunch"
  - Step 1: title "Weekend Brunch" → Next
  - Step 2: search a place → select → appears in list → Next
  - Step 3: add a datetime → "Create Brunch"
  - Redirect to `/brunch/[id]` showing "Weekend Brunch"
  - Dashboard shows the brunch card ("1 going", Host badge)
  - Add a second location on a new brunch → voting hint + "Voting closes by" field appear
  - **Second account visits the first brunch's URL → 404**
- [ ] Commit: `feat: Create Brunch wizard and brunch detail page stub (M6)`

---

## Deferred / Known Gaps

- **Wizard state is not persisted.** Navigating away mid-wizard loses progress. Acceptable for v1.
- **Place search has no rate limiting or response caching.** Debounce + min-length + session tokens keep costs sane; add caching/rate limiting if usage warrants (PLANNING §9.11 says defer until abuse appears).
- **`GooglePlacesProvider` is not unit tested** — wraps live HTTP. A `MockPlaceProvider` can substitute in tests when a consumer needs it.
- **Playwright E2E deferred.** Create-brunch is the critical flow and should get E2E coverage, but no Playwright harness exists in the repo yet. Manual browser verification covers this spec; E2E harness is its own future setup task.
- **`NoopEventBus` is a placeholder.** `brunch/created` is emitted into the void until the Inngest spec ships a real `EventBus` implementation. The injection point exists so that spec is a swap, not a refactor. AuditLog rows for brunch creation ride on that same event (Constitution 12 — side effects via queue), so they're deferred with it.
- **`votingDeadline` semantics enforcement.** The service stores it even if no voting was triggered (host may add options later). Deadline-driven vote closing is the voting spec's job.
- **Invitations (step 4) deferred** to spec 0004. The wizard ends after step 3.
- **Brunch created with status `draft`.** Transitions to `active` when invites are sent (spec 0004). Dashboard shows `draft` brunches.
- **i18n (next-intl) deferred** per `docs/adrs/0005-defer-next-intl.md` — revisit at pre-launch.

---

## Testing Notes

_(Filled in after each milestone completes)_

### M1 — Unit + integration tests for `createBrunch` / `getBrunchById`

- **What was tested:** TBD
- **How:** TBD
- **What's deferred:** TBD
- **How to run:** `pnpm --filter @brunchsters/core test` (unit); `supabase start && pnpm --filter @brunchsters/core test:integration` (integration)

### M2 — Unit tests for `getBrunchesForUser`

- **What was tested:** TBD
- **How:** TBD
- **What's deferred:** TBD
- **How to run:** `pnpm --filter @brunchsters/core test`

### M3 — Route handler unit tests + middleware 401

- **What was tested:** TBD
- **How:** TBD
- **What's deferred:** TBD
- **How to run:** `pnpm test`

### M4 — Manual verification of places routes

- **What was tested:** TBD
- **How:** TBD
- **What's deferred:** TBD
- **How to run:** `pnpm dev` → curl or browser dev tools

### M6 — Full browser flow

- **What was tested:** TBD
- **How:** TBD
- **What's deferred:** TBD
- **How to run:** `supabase start && pnpm dev` → http://localhost:3000
