# Plan 0014 — Feedback Surfaces

Spec: [spec.md](./spec.md). Decision record: [ADR 0016](../../docs/adrs/0016-feedback-surfaces.md). Every file path below is a plan, re-verified with a grep at the start of its milestone; the grep wins.

## Files introduced

| File                                                                                      | What                                                                                                                          |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/apiError.ts` (+ test)                                                | `API_ERROR_CODES` (a `const` tuple), the `ApiErrorCode` union, `ApiErrorBody`, a Zod schema that reads either shape           |
| `apps/web/src/lib/apiErrorResponse.ts` (+ test)                                           | `apiError({ code, message, status })` → `NextResponse`; the one way a route builds an error                                   |
| `apps/web/src/lib/errorCopy.ts` (+ test)                                                  | `errorCopy(code)`, `copyForFailure({ status, body })`; pure; the only place error wording lives                               |
| `apps/web/src/lib/voiceCopy.test.ts`                                                      | the banned-word scan                                                                                                          |
| `apps/web/src/lib/readApiError.ts` (+ test)                                               | reads a `Response` into `{ code, rateLimit? }`, wrapping `readRateLimit`; tolerates the old shape, non-JSON and an empty body |
| `apps/web/src/store/mutationsSlice.ts` (+ test)                                           | `runMutation` thunk, per-key entries, `selectMutation`                                                                        |
| `apps/web/src/store/toastsSlice.ts` (+ test)                                              | the queue, `toastDismissed`, `selectToasts`; extraReducers on `runMutation`                                                   |
| `apps/web/src/store/useMutation.ts`                                                       | `useMutation(key)` → `{ run, pending, errorCopy }` (calls `router.refresh()` where the caller asks)                           |
| `apps/web/src/components/ui/ToastHost.tsx` + `.module.css`                                | the status region; mounted once in `app/(authenticated)/layout.tsx`                                                           |
| `apps/web/src/components/ui/Skeleton.tsx` + `.module.css`                                 | the placeholder primitive                                                                                                     |
| `apps/web/src/app/(authenticated)/{dashboard,brunch/[id],brunch/[id]/manage}/loading.tsx` | skeletons (M6; may become a `Suspense` boundary, see Risks)                                                                   |
| `apps/web/src/app/api/v1/apiErrors.test.ts`                                               | the scanning test: every route's error returns a code                                                                         |
| `apps/web/e2e/journeys/feedback.spec.ts`                                                  | journeys T1 to T9                                                                                                             |

Changed: the ten controls; `ballotsSlice`, `wizardSlice`, `makeStore`; `PlaceSearchInput`; `InvitePanel` (the wizard's note); about 28 route files; the ~10 journeys named in the spec; `eslint.config.mjs` (a rule against a bare `fetch` in a component); `docs/*` and `CLAUDE.md` files per the spec.

## Key design

### Error codes

`ApiErrorBody = { error: { code: ApiErrorCode; message: string } }`. The server builds it only through `apiError()`, which takes the status and the code, so a route cannot send a code with the wrong status class (`apiError` has a table of allowed statuses per code, unit-tested). `message` stays human English for logs and other clients; it is never rendered (the client does not read it, and `errorCopy` has no parameter for it).

The reader (`readApiError`) accepts, in order: the rate-limit body (`policy`, `retryAfterSeconds`; read by `readRateLimit`, unchanged), the new body, the old `{ error: string }`, the 422 `{ errors: [...] }`, and anything else. For the old shapes it picks a code by status (401 `signed_out`, 403 `forbidden`, 404 `not_found`, 409 `brunch_changed`, 422/400 `invalid`, 429 `rate_limited`, 502/503 `unavailable`, else `internal`), so a half-migrated app is correct, only less specific. The 404 mapping ignores the body entirely.

The order of checks in a route is not touched: the membership check still comes first, so the code a caller gets is the code a made-up id gets. T5 and the API-authorization journey assert it.

### The thunk

```ts
runMutation({
  key: MutationKey,                 // `${controlName}:${subject}` e.g. `rsvp:${brunchId}`
  request: { url: string; method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown },
  success?: ToastCopyKey,           // a toast on 2xx, from a copy table (never a free string)
  failure: 'toast' | 'inline',
})
// fulfilled: { status, body }   rejected (rejectWithValue): { code, rateLimit? }
```

- `condition`: refuses when the key is already pending, so a second tap does nothing (the `wizardSlice` rule).
- Entries: `{ status: 'pending' | 'failed' | 'idle', requestId, code?: ApiErrorCode }`. A result whose `requestId` is not the entry's is ignored; an entry is released when its control unmounts (`mutationReleased`), as ballots are.
- The 429 case: the entry stores `rateLimit`; a control that has a wait surface reads it and calls its `useWait.start`, then `router.refresh()` (the spec 0012 behavior, moved, not changed). One without a wait surface gets the `rate_limited` toast.
- Everything serializable (codes and numbers; no `Response`, no `Error`).
- The caller does `router.refresh()` after `.unwrap()`, as `useBallot` does; the thunk never touches the router (ADR 0011 (3)).

`useMutation(key)` returns `{ run(request, options), pending, failedWith }`. `failedWith` is the code for an inline failure; the component renders `<InlineAlert tone="error" role="alert"><p>{errorCopy(code)}</p></InlineAlert>` where its `error` state used to render, so the line sits in the same place.

### Toasts

`toastsSlice` state: `{ queue: Toast[] }` with `Toast = { id, key, tone: 'success' | 'error' | 'info', text, createdAt: number }` (numbers, not `Date`). The id is the thunk's `requestId`; the key is the mutation key plus the code (de-duplication: a repeated failure replaces its earlier toast instead of stacking). A fourth toast drops the oldest. Text comes from `errorCopy` or the success table at dispatch time, so the slice holds text, not codes (a toast must say what it said when it was shown).

`ToastHost` is a client component reading `selectToasts`: one wrapper with `role="status"` and `aria-live="polite"`, present and empty from first paint (so the first message is announced), each toast a `<div>` with its text and a dismiss `<button>` named "Dismiss". Timers are owned by each toast (`useEffect`, cleared on unmount, paused on `pointerenter`/`focusin`, resumed on leave/blur). Position: fixed, bottom, above the safe-area inset and above the wizard footer (a CSS variable the footer sets; see M2's `/ui-screen` pass). The only animation is a fade/slide behind `prefers-reduced-motion: no-preference`. Colors are tokens; the pairs go in `tokenContrast.test.ts`.

### Skeletons

`Skeleton` is a block with a token background, a gentle pulse behind `no-preference`, and no text. A page's skeleton is the same grid the page uses (`Container`, the two-column `.columns` from 60rem) with blocks at the sizes of the heading, the cards and the rows. The region carries `aria-busy="true"` and a visually hidden "Loading" in a `role="status"`. See Risks for the 404 interplay.

### The wizard

`createBrunch` becomes: create; then, if there are emails, `POST .../invites` through the same reader; resolve `{ id, invitesFailed: boolean }` (`true` when the batch was refused for any reason other than a 429, which the page's counters already show). The wizard component navigates as today. `wizardSlice` resets on unmount, so the flag cannot live there: it goes in a small `notices` entry in `mutationsSlice` keyed `invites-failed:${brunchId}` (the provider outlives the page), released once the panel has shown it or an invite is sent. `InvitePanel` reads it and renders a persistent `InlineAlert tone="info" role="status"` above the form: "Your brunch is up, but the invites didn't go out. Add the addresses again below." (draft; `errorCopy`).

### Place search

The effect keeps a `controller = new AbortController()` per run, passes `signal` to `fetch`, and aborts it in the cleanup next to `clearTimeout`; an aborted request is not an error and sets nothing. `selectPlace` takes a counter (a `useRef` incremented on each query change); a details response for an older counter is dropped. The 429 reading stays.

## Order of work and why

1. **M1 builds the vocabulary** (codes, copy, banned-word test) before any code uses it, and proves the voice test can fail.
2. **M2 proves the whole path on one control** (RSVP): route returns a code, thunk, toast host, mounted in the layout, one journey. Everything after is repetition.
3. **M3 takes the controls with rules** (ballots, invites with waits, voting controls); the rate-limit behavior moves onto the thunk without changing.
4. **M4 takes the rest** and turns the guards on (scanning test for routes, lint rule for `fetch`).
5. **M5 the two bug fixes** (wizard, place search): both are "ignored response" bugs and share the reader.
6. **M6 skeletons** last, with the spike first, because it is the riskiest for the 404 rule and changes the most layout; docs finish.

## Copy

The copy table (what was adopted and what is new) goes in this file when M1 settles it, as spec 0011's and 0013's do. Draft rules: every error line is one or two short sentences; it says what happened to the _thing_ ("Your vote didn't save"), not the system; no "failed", "error", "unable", "invalid"; no apology theatre; a toast for a success is a few words. A line never mentions an id, a status code or a role the person does not hold.

## Test strategy

- **Unit (node, no DOM):** `apiError` (statuses allowed per code), `readApiError` (every shape, 404 ignoring the body, a body that is not JSON), `errorCopy` (every code has copy; unknown falls back; no copy contains a banned word), the thunk (success, each failure kind, `condition`, a late `requestId`, 429 storing facts), both slices' reducers and selectors, the scanning tests.
- **Route handler tests:** each migrated route asserts `error.code` for each of its error branches, and that a made-up id and an outsider get the same code and body.
- **Integration:** none new (no schema, no service change).
- **E2E:** journeys T1 to T9 and the edited ones; run on a production build (`CI=true pnpm build && CI=true pnpm test:e2e`) as the quick gate, and in dev mode before the PR.
- **Proof a regression test can fail:** at each milestone, put the old behavior back (generic string, ignored response, no abort, route without a code) and watch the named test fail; record the result in the testing note.
- **No component render tests** (root `CLAUDE.md`); the toast host and skeletons are covered by journeys and axe.

## Risks and mitigations

| Risk                                                                                        | Mitigation                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loading.tsx` changes a 404's HTTP status or reopens the "empty error shell" bug            | M6 spike on a production build before building; fallback is a `Suspense` boundary after the membership check; P9, H4, the API-authorization journey and T9 are the guards               |
| A route's code leaks by being specific (`brunch_called_off` to someone who is not a member) | The guard order is unchanged (membership first); T5 and the API-authorization journey check real vs made-up ids; `errorCopy` has no route-specific text for a code a non-member can get |
| Toasts pile up or steal attention                                                           | Cap of 3, de-duplication, polite region, no focus move; T2 counts them                                                                                                                  |
| Half-migrated state for several milestones                                                  | The reader tolerates the old body; each milestone migrates a control with its routes; the scanning test is turned on at the end of M4 only                                              |
| ~10 journeys change wording                                                                 | Listed per milestone with a grep at its start; each is proved to fail without the change, per the root rule                                                                             |
| The thunk becomes a kitchen sink                                                            | One arg shape, no per-control branches inside it; rules with state (ballots, wizard) keep their own thunks and only reuse the reader and the copy                                       |
