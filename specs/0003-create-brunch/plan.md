# Plan 0003 — Create Brunch

**Spec:** [spec.md](./spec.md)

---

## Architecture

### Files introduced

```
packages/core/src/
  brunch/
    createBrunch.ts              # Service + createBrunchInputSchema (Zod, source of truth)
    createBrunch.test.ts         # Unit tests (mock DbClient + mock EventBus)
    createBrunch.integration.test.ts   # Integration tests (real local Postgres)
    getBrunchById.ts             # Service — authorized query for detail stub
    getBrunchById.test.ts
    getBrunchesForUser.ts        # Service — list for dashboard
    getBrunchesForUser.test.ts
  events/
    NoopEventBus.ts              # EventBus impl that resolves immediately (until Inngest spec)
  places/
    PlaceProvider.ts             # Updated: search/getDetails take object params w/ sessionToken

packages/database/src/
  seed.ts                        # Updated: add 4 missing NotificationType codes

apps/web/src/
  middleware.ts                  # Updated: 401 JSON for /api/* instead of redirect
  adapters/
    GooglePlacesProvider.ts      # Implements PlaceProvider via Places Autocomplete (New) (new)
  app/
    api/
      v1/
        brunches/
          route.ts               # POST (create), GET (list)
        places/
          search/
            route.ts             # GET — proxy to Places Autocomplete (New)
          [placeId]/
            route.ts             # GET — proxy to Place Details + Time Zone API
    (authenticated)/
      dashboard/
        page.tsx                 # Updated: brunch list + empty state + CTA
      brunch/
        new/
          page.tsx               # Create Brunch wizard (client component)
        [id]/
          page.tsx               # Brunch detail stub (server component)

docs/adrs/
  0005-defer-next-intl.md        # ADR: defer i18n plumbing to pre-launch (amends PLANNING §9.12)
```

---

## Key Design Decisions

### Input validation: Zod schema in core, inferred types

Per CLAUDE.md ("Zod schemas live next to the types they validate; infer types from schemas"), the request schema is the source of truth and lives in `packages/core/src/brunch/createBrunch.ts`:

```typescript
export const createBrunchRequestSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  locations: z.array(locationInputSchema).default([]),
  times: z.array(z.object({ scheduledAt: z.string().datetime() })).default([]),
  votingDeadline: z.string().datetime().optional(),
});

export type CreateBrunchRequest = z.infer<typeof createBrunchRequestSchema>;

export type CreateBrunchInput = CreateBrunchRequest & {
  readonly hostId: UserId; // from the session, never from the request body
};
```

The route handler imports `createBrunchRequestSchema`, parses the body, and adds `hostId` from the session. No duplicated types between core and the route (Constitution 14). Zod is framework-agnostic, so core stays clean.

`votingDeadline`, when present, must be in the future (`.refine`). The service stores it regardless of whether voting was triggered — the wizard only shows the field when 2+ options exist, but the service doesn't enforce that coupling (the host may add options later).

### `createBrunch` service

Signature:

```typescript
function createBrunch(
  input: CreateBrunchInput,
  ctx: { db: DbClient; eventBus: EventBus },
): Promise<Result<{ id: BrunchId }, CreateBrunchError>>;
```

All DB writes are wrapped in a single `prisma.$transaction`:

1. Look up `BrunchStatus` by code `'draft'`
2. Look up `RsvpStatus` by code `'yes'`
3. Look up `BrunchDecisionType` by codes `'host_decides'` and `'group_vote'`
4. Look up host `User` (need `email` for the synthetic invite)
5. Create `Brunch` record (including `votingDeadline` if provided)
6. Create synthetic `BrunchInvite` for host — `token = crypto.randomUUID()`, **`tokenExpiresAt = now`** (born expired: the host never redeems it, and Constitution 28 says tokens are least-privilege/expiring by default; §9.6 uniformity is about the row existing, not the token being live)
7. Create `BrunchAttendee` for host (`rsvpStatusId = yes.id`, `respondedAt = now`)
8. For each location: create `BrunchLocation` with `decisionTypeId` inferred from total location count
9. For each time: create `BrunchTime` with `decisionTypeId` inferred from total time count (independently of locations)

**Decision type inference rule:** exactly 1 item → `host_decides`; 2+ → `group_vote`. Empty collections create no records.

After the transaction commits, emit `brunch/created` via `ctx.eventBus` with `{ brunchId, hostId }`. The emit is wrapped in try/catch — a failed emit is logged but never fails the create (Constitution 12: the API response does not depend on side effects). `NoopEventBus` ships now; the Inngest spec later swaps the implementation without touching this service's signature — that's the point of injecting it today.

Lookup-not-found is surfaced as `CreateBrunchError` with `kind: 'lookup_not_found'`; anything else from the transaction as `kind: 'db_error'`.

### `getBrunchById` — authorized read

```typescript
function getBrunchById(
  input: { brunchId: BrunchId; viewerId: UserId },
  ctx: { db: DbClient },
): Promise<BrunchDetail | undefined>;
```

Returns `undefined` unless the brunch exists, is not soft-deleted, **and** the viewer is the host or a non-deleted attendee. The route renders 404 in all failure cases — no 403, don't leak existence. (The host always has an attendee row via the synthetic invite, but we check `hostId` too — belt and braces.) The invite-token access path is spec 0004's problem.

### `getBrunchesForUser` service

Queries `BrunchAttendee` where `userId = input.userId AND deletedAt IS NULL`, joins to `Brunch` (also filtering `deletedAt IS NULL`), includes `BrunchStatus` for the status label. Sorted by `createdAt DESC` on `Brunch`. Returns `BrunchSummary[]`.

```typescript
type BrunchSummary = {
  readonly id: BrunchId;
  readonly title: string;
  readonly statusCode: string;
  readonly statusLabel: string;
  readonly isHost: boolean;
  readonly goingCount: number;
  readonly createdAt: Date;
};
```

`isHost` is derived by comparing `brunch.hostId` to `input.userId`. `goingCount` counts attendees where `deletedAt IS NULL` **and** `rsvpStatus.countsAsAttendee = true` — that's what the flag exists for. On a fresh brunch this is 1 (the host), which reads correctly as "1 going".

### `GooglePlacesProvider` — Autocomplete (New) + session tokens

Implements the `PlaceProvider` interface. The interface is updated to carry the session token (object params per CLAUDE.md's 2+-param rule):

```typescript
export interface PlaceProvider {
  search(params: {
    readonly query: string;
    readonly sessionToken?: string;
  }): Promise<readonly PlaceResult[]>;
  getDetails(params: {
    readonly placeId: string;
    readonly sessionToken?: string;
  }): Promise<PlaceDetails | undefined>;
}
```

`PlaceResult` slims down to what autocomplete predictions provide — `placeId`, `name`, `address`. `placeUrl` moves to `PlaceDetails` only (predictions don't include a Maps URI; the details call does).

**`search`** — [Places Autocomplete (New)](https://developers.google.com/maps/documentation/places/web-service/place-autocomplete):

```
POST https://places.googleapis.com/v1/places:autocomplete
Headers: X-Goog-Api-Key
Body: { input: query, sessionToken, languageCode: "en" }
```

Maps `suggestions[].placePrediction` → `PlaceResult` (name = `structuredFormat.mainText.text`, address = `structuredFormat.secondaryText.text`).

**`getDetails`** — two sequential calls:

1. [Place Details (New)](https://developers.google.com/maps/documentation/places/web-service/place-details): `GET https://places.googleapis.com/v1/places/{placeId}?sessionToken={token}` with field mask `id,displayName,formattedAddress,googleMapsUri,location`. Passing the session token here **closes the billing session** — the autocomplete keystrokes + this call bill as one session instead of N requests.

2. [Time Zone API](https://developers.google.com/maps/documentation/timezone/requests-timezone): `GET https://maps.googleapis.com/maps/api/timezone/json?location={lat},{lng}&timestamp={unix_seconds}&key={apiKey}` — returns `timeZoneId` (IANA, e.g. `'America/Chicago'`).

Returns `PlaceDetails` with `timezone: timeZoneId as IanaTimezone`. Returns `undefined` on a 404 from Place Details; throws on other non-2xx (matches the interface contract — the route handler wraps in try/catch and maps to 502).

**Session token lifecycle (wizard side):** the wizard generates `crypto.randomUUID()` when the user starts typing into an empty search box, passes it on every search call and on the final details call, then discards it. Searching for another location starts a new session. Tokens are opaque pass-throughs for our proxy routes (`?sessionToken=` query param).

Both Google APIs use the same `GOOGLE_PLACES_API_KEY` — a Maps API key (Places API (New) + Time Zone API enabled), **not** the OAuth credentials.

### Middleware: 401 for APIs, redirect for pages

Today `middleware.ts` redirects every unauthenticated non-public request to `/sign-in` — including `/api/*`, which hands fetch clients a 307 to an HTML page instead of an error. Fix: if the path starts with `/api/` and there's no session, return `NextResponse.json({ error: 'Unauthorized' }, { status: 401 })`. Page routes keep the callbackUrl redirect. Route handlers still call `auth()` themselves (defense in depth; middleware matchers have gaps by design).

### API route auth pattern

All `/api/v1/` routes call `auth()` from `apps/web/src/auth.ts`. No session → 401. Session present → `userId` from `session.user.id` (set in the `session` callback from `token.userId`).

### Wizard state

Single client component (`'use client'`) at `/brunch/new/page.tsx`, three steps, state in `useReducer`:

```typescript
type WizardState = {
  step: 1 | 2 | 3;
  title: string;
  description: string;
  locations: readonly PlaceDetails[];
  times: readonly Date[];
  votingDeadline: Date | undefined;
};
```

**Deliberately local state, not Redux.** Redux Toolkit is in the stack for shared/app-level state; wizard state is ephemeral, single-screen, and dies on submit. Putting it in the store would be ceremony without benefit. Not a precedent question — just altitude.

On "Create Brunch": POSTs `{ title, description, locations, times, votingDeadline }` (dates as UTC ISO strings). On 201: `router.push('/brunch/[id]')`. On error: inline message, state preserved.

### Datetime input and timezone

Step 3 uses `<input type="datetime-local">`. The browser interprets the value in the user's local timezone; the wizard converts to UTC before submitting (`new Date(inputValue).toISOString()`). The service stores UTC. Display (later specs) converts back using `BrunchLocation.timezone` per PLANNING.md §9.3. Same handling for the optional "Voting closes by" field, which appears on step 3 when `locations.length > 1 || times.length > 1`.

### Places search debounce

Step 2 search fires `GET /api/v1/places/search` with a 300ms debounce and a 3-character minimum (enforced client-side for UX and server-side as a guard). Results in local component state; dropdown closes on selection or blur.

### Brunch detail stub

`/brunch/[id]/page.tsx` is a server component. It validates the `id` param is a well-formed UUID (Zod `z.string().uuid()`) before touching the DB — a malformed ID renders `notFound()`, not a Prisma error. Then calls `getBrunchById({ brunchId, viewerId }, { db })`; `undefined` → `notFound()`. Renders the title; full UI deferred.

### ADR: defer next-intl

PLANNING.md §9.12 prescribes next-intl "from day one." This spec is the first real UI, so the decision point is now. We're deferring: English-only, solo, pre-launch — i18n plumbing would tax every UI milestone for zero current user value. Per CLAUDE.md ("when implementation reveals a planning gap, fix the doc, don't silently diverge"), this ships as `docs/adrs/0005-defer-next-intl.md` plus a §9.12 amendment noting the deferral and the revisit trigger (pre-launch checklist).

---

## Milestones

### M1 — `createBrunch` service + integration test

Update `seed.ts` (4 missing `NotificationType` codes). Write the next-intl deferral ADR + PLANNING.md §9.12 note. Update `PlaceProvider` interface (object params + slimmer `PlaceResult`). Add `NoopEventBus`. Implement `createBrunch.ts` (schema + service) and `getBrunchById.ts`. Unit tests with mock `DbClient` + mock `EventBus`; integration test against local Postgres verifying all rows (brunch, born-expired synthetic invite, attendee, locations, times, votingDeadline) and decision-type inference.

**Done when:** All unit and integration tests pass. `pnpm typecheck && pnpm lint && pnpm test` green.

### M2 — `getBrunchesForUser` service + unit tests

Implement `getBrunchesForUser.ts` with `goingCount` via `countsAsAttendee`. Unit tests: no brunches, hosted, invited, soft-deleted filtering, goingCount excludes non-counting RSVPs.

**Done when:** Tests pass. `pnpm typecheck && pnpm lint && pnpm test` green.

### M3 — Brunch API routes + middleware fix

Fix `middleware.ts` (401 JSON for `/api/*`). Add `apps/web/src/app/api/v1/brunches/route.ts` — `POST` parses with `createBrunchRequestSchema` from core, calls `createBrunch`, returns 201; `GET` calls `getBrunchesForUser`, returns 200. Handler unit tests: 201, 422, 401, list.

**Done when:** Tests pass. `pnpm typecheck && pnpm lint && pnpm test` green.

### M4 — `GooglePlacesProvider` + places API routes

Implement `GooglePlacesProvider` (Autocomplete (New) + Place Details + Time Zone API, session-token pass-through). Add `GET /api/v1/places/search` and `GET /api/v1/places/[placeId]` proxy routes. Add `GOOGLE_PLACES_API_KEY` to `.env.local` and `.env.example`. Manual verification: search returns predictions; detail call returns IANA timezone.

`GooglePlacesProvider` is not unit tested (wraps live HTTP). The routes are thin proxies; manual verification only.

**Done when:** Both place routes return real data from Google. `pnpm typecheck && pnpm lint` green.

### M5 — Dashboard UI

Update `/dashboard/page.tsx`: server component calling `getBrunchesForUser` directly (no fetch hop), empty state with CTA, brunch cards with going count and host badge, past brunches in a secondary section.

**Done when:** Dashboard renders both empty and populated states in the browser. `pnpm typecheck && pnpm lint` green.

### M6 — Create Brunch wizard + brunch detail stub

Build the three-step wizard at `/brunch/new` (including session-token lifecycle and the conditional voting-deadline field) and the authorized detail stub at `/brunch/[id]`. Full browser test: sign in → empty dashboard → wizard steps 1-3 → create → redirect → detail shows title → dashboard shows the card. Also verify a second account gets a 404 on that brunch's URL.

**Done when:** Full flow works end-to-end in the browser. `pnpm typecheck && pnpm lint` green.

---

## Dependencies / Environment

| Variable                | Source                                                                   | Used by                |
| ----------------------- | ------------------------------------------------------------------------ | ---------------------- |
| `GOOGLE_PLACES_API_KEY` | Google Cloud Console → API key → enable Places API (New) + Time Zone API | `GooglePlacesProvider` |

Distinct from the OAuth credentials (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`) — this is a Maps API key. Restrict it to Places API (New) and Time Zone API.

New npm packages: `zod` (packages/core — first consumer in core; may already be present in apps/web). `neverthrow` already present.

---

## Testing Strategy

- **Unit (M1):** `createBrunch` — mock `DbClient` (Vitest `vi.fn()`) + mock `EventBus`. Cover: empty locations + times, 1 location (host_decides), 2+ locations (group_vote), independent inference for times, votingDeadline stored, votingDeadline in the past rejected by schema, event emitted after success, emit failure does not fail the create, DB error from transaction, lookup-not-found.
- **Integration (M1):** `createBrunch` against real local Postgres (same pattern as `signInWithProvider.integration.test.ts`). Verify all rows created, synthetic invite `tokenExpiresAt <= createdAt`; cleanup in `afterAll`. Requires `supabase start` + seeded lookups (`pnpm db:seed`).
- **Unit (M1):** `getBrunchById` — found as host, found as attendee, not found, soft-deleted, **non-member gets undefined**, malformed input never reaches here (route validates).
- **Unit (M2):** `getBrunchesForUser` — no brunches, hosted + invited mix, soft-deleted exclusion, goingCount counts only `countsAsAttendee` RSVPs.
- **Unit (M3):** Route handlers — mock services via `vi.mock`. Cover: 201, 422 on bad input, 401 on no session, list 200.
- **Manual (M4):** Places routes via browser dev tools / curl (live external API — no automated tests).
- **Manual (M5, M6):** Browser verification of the full happy path + the cross-account 404 check.
- **Not tested:** Next.js routing, React rendering, `GooglePlacesProvider` internals (live HTTP), middleware redirect mechanics (framework), E2E (Playwright harness not yet set up — deferral noted in spec.md).
