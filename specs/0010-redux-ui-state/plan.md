# Plan 0010 — Redux Toolkit for UI State

Why Redux, what is in and out, and the alternatives are in [ADR 0011](../../docs/adrs/0011-redux-toolkit-for-client-ui-state.md). This plan is the how.

## Files

**New** (all under `apps/web/src/store/`)

| File                                  | Purpose                                                                                                                                              |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `makeStore.ts`                        | `makeStore({ fetch })` → configured store (`configureStore`, thunk `extra: { fetch }`); exports `AppStore`, `RootState`, `AppDispatch`, `ThunkExtra` |
| `StoreProvider.tsx`                   | `'use client'`; `useRef` creates one store per mount; wraps `Provider`                                                                               |
| `hooks.ts`                            | `useAppDispatch`, `useAppSelector` via `.withTypes`; `createAppAsyncThunk` (typed `state`, `dispatch`, `extra`, `rejectValue`)                       |
| `wizardSlice.ts` (+ `.test.ts`)       | wizard state and actions, `createBrunch` thunk                                                                                                       |
| `ballotsSlice.ts` (+ `.test.ts`)      | ballot state, `selectEffectiveSelection`, `saveBallot` thunk                                                                                         |
| `makeStore.test.ts`                   | two stores share no state; extra `fetch` is the one given                                                                                            |
| `e2e/journeys/redux-ui-state.spec.ts` | R1–R3                                                                                                                                                |

**Changed**

- `apps/web/package.json`, `pnpm-lock.yaml` — `@reduxjs/toolkit`, `react-redux`
- `app/(authenticated)/layout.tsx` — wraps children in `StoreProvider` (stays a Server Component; the provider is the client boundary), added in M2 with the first slice
- `app/(authenticated)/brunch/new/page.tsx` — reducer and `submitting`/`submitError` leave; reads the slice; dispatches reset on mount
- `app/(authenticated)/brunch/[id]/BallotChecklist.tsx` — shared logic hook; two thin renderers stay
- Docs: `README.md`, root `CLAUDE.md`, `docs/PLANNING.md`, `apps/web/CLAUDE.md`, `specs/0003-create-brunch/plan.md`, `specs/0008-email-notifications/{spec,tasks}.md`, `specs/0009-styling-foundation/spec.md` (numbering)

`packages/*` do not change.

## Key design

### Store, per request

```ts
// makeStore.ts (shape, not final code)
export type ThunkExtra = { readonly fetch: typeof fetch };

export function makeStore(extra: ThunkExtra) {
  return configureStore({
    reducer: { wizard: wizardReducer, ballots: ballotsReducer },
    middleware: (getDefault) => getDefault({ thunk: { extraArgument: extra } }),
    devTools: process.env.NODE_ENV !== 'production',
  });
}
```

`StoreProvider` calls `makeStore({ fetch: (...args) => fetch(...args) })` once in a `useRef`. Wrapping `fetch` instead of passing the global keeps `this`-binding safe in browsers. Tests pass a fake. No export of a ready-made store exists, which is what keeps the singleton out.

### Serializable state

| In the component today          | In the store                                                                                                                             |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `times: readonly Date[]`        | `times: readonly string[]` (ISO). Step three builds `new Date(iso).toLocaleString()` at render; the submit sends the strings as they are |
| `selected: ReadonlySet<string>` | `selected: readonly string[]`                                                                                                            |
| `PlaceDetails`                  | stays: plain object of strings and numbers (checked against core's type before M2)                                                       |

Dedupe keys: the wizard list item key moves from `time.toISOString()` to the ISO string itself (same value).

### Wizard slice

State = today's `WizardState` + `submitting: boolean` + `submitError: string | undefined`. Reducers mirror the current `wizardReducer` one for one (`titleChanged`, `descriptionChanged`, `stepChosen`, `locationAdded/Removed`, `timeAdded/Removed`, `votingDeadlineChanged`, `emailAdded/Removed`), plus `wizardReset`. The email cap (`MAX_INVITES_PER_REQUEST`) and de-duplication stay in the reducer, which is where they are now.

`createBrunch` thunk (`createAppAsyncThunk`):

1. `pending`: `submitting = true`, `submitError = undefined`.
2. POST `/api/v1/brunches` with the same body building as today (including the conditional `description` and `votingDeadline`).
3. Not OK → `rejectWithValue(await extractErrorMessage(response))`; network error → `'Failed to create brunch'`.
4. OK → if emails exist, POST `/invites` inside a `try/catch` that ignores any failure (comment kept: best-effort, retry from the invite panel); return `{ id }`.
5. `rejected`: `submitting = false`, `submitError = payload`. `fulfilled`: leave `submitting` true until navigation (today `setSubmitting(false)` is not called on success either; the page is leaving).

The component does `dispatch(createBrunch()).unwrap().then(({ id }) => router.push(...))`. `extractErrorMessage` moves with the thunk (it is request parsing, not UI).

Reset rule: a reset on _mount_ would paint one frame of the old draft before the effect runs, so the page resets on **unmount** instead (`useEffect` cleanup dispatching `wizardReset()`), which leaves the store clean for the next visit and is flash-free. The rule is documented in the slice and verified by R1. See risks 1 and 2 for the strict-mode double-mount case.

### Ballot slice

```ts
type BallotKey = `${string}:${'location' | 'time'}`;   // `${brunchId}:${kind}`
type BallotState = {
  readonly selected: readonly string[];
  readonly submitting: boolean;
  readonly error: string | undefined;
  readonly emptyWarning: boolean;
};
state: { readonly byKey: Readonly<Record<BallotKey, BallotState | undefined>> }
```

- **No entry until the first toggle.** `selectEffectiveSelection(state, { key, seeded, optionIds })` returns `entry?.selected ?? seeded`, **filtered to `optionIds`**. This is the F2 behavior as a pure function, evaluated on every render, so a removed option drops out whether or not the voter has toggled yet.
- `ballotToggled({ key, optionId, current })`: computes the next selection from `current` (the effective selection the component passes, so the reducer does not need the options) and stores it with `previous` kept for rollback (`previous: readonly string[]`). Empty next → `emptyWarning = true`, no request. Otherwise `emptyWarning = false` and the component (or a listener) dispatches `saveBallot`.
- `saveBallot` thunk: `pending` → `submitting = true`, `error = undefined`; PUT `{ optionIds }`; non-OK or network error → `rejected` → restore `previous`, `error = 'Failed to save your vote'`, `submitting = false`; OK → `fulfilled` → `submitting = false`. The component calls `router.refresh()` after `unwrap()` succeeds, as today.
- `ballotReleased(key)` deletes the entry. A `useEffect` cleanup in the shared hook dispatches it.
- The two components share one `useBallot({ brunchId, kind, options, canVote, closed })` hook returning `{ selection, submitting, error, emptyWarning, toggle, readOnly }`. Rendering, text, roles and `Badge`/`VoterNames`/`ConfirmedMark` stay in the components.

The "toggle ignored while submitting or read-only" rule moves into the hook, with `readOnly = closed || !canVote`.

### Order of checks / permissions

No server permission changes; all client calls hit the existing routes, so the 404/403 rule and the API-authorization journeys are untouched. No new route.

## Decisions already made (grill, 2026-10-19)

- Scope: plumbing + ballots + wizard; the rest deferred and documented.
- `createAsyncThunk` per mutation; `router.refresh()` stays in the component.
- No persistence; no RTK Query; no copy or role changes.
- Times as ISO strings; selections as arrays; per-request store; provider in the `(authenticated)` layout.

## Risks and mitigations

1. **A store that outlives the page leaks draft state.** The wizard cleanup reset and the ballot release are the only things preventing it. _Mitigation:_ R1 and R2, each proven to fail with the line removed. If a reset in a cleanup proves wrong under React strict mode (the dev double-mount runs the cleanup once with nothing entered yet, which is harmless), or the draft survives some navigation path, fall back to resetting in a `useEffect` keyed on the pathname, and re-prove R1.
2. **Strict-mode double mount in development** runs release-then-remount. Harmless for ballots (no entry exists before the first toggle) and for the wizard if the reset runs on cleanup only after a real unmount. Checked in M2/M3 with the dev server and CI mode.
3. **Accidental behavior change in the ballots.** The checklists are the most-tested client logic (F1, V1–V6, same-person, timezone). _Mitigation:_ port with reducer tests that restate each current rule (stale-id filter, empty-ballot warning blocks the save, rollback to the exact previous selection, ignored while submitting, ignored when read-only), then run the full e2e unmodified.
4. **Typing the thunks.** Branded IDs are not used in these components today (props are `string`); this spec does not introduce them to the UI. `createAppAsyncThunk` carries the `rejectValue: string` type so `unwrap()` errors are typed.
5. **Serializability warnings.** Any non-plain value fails the check in dev. _Mitigation:_ the check stays on; the `PlaceDetails` shape is confirmed plain in M2 before it goes in state.
6. **Bundle weight.** RTK + react-redux add roughly 15–20 kB gzipped to the authenticated bundle. Accepted; the landing and sign-in pages are outside the provider.

## Test strategy

- **Unit (node vitest):** `makeStore` isolation; every wizard reducer rule and the `createBrunch` thunk (create fails → entries kept and message set; create succeeds → invites sent best-effort, invite failure ignored, id returned; network error message); every ballot reducer rule, `selectEffectiveSelection` (seeded, stored, stale-id filtering) and `saveBallot` (success, non-OK rollback, network rollback, previous restored exactly). A fake `fetch` is passed through the thunk `extra`; no module mocking.
- **Not tested:** that React renders or that `Provider` provides (framework guarantees).
- **E2E:** all existing journeys unmodified; R1–R3 new. Full `/milestone-done` e2e sequence each milestone (dev run, stress run, CI mode) since every milestone touches user-facing code.
- **Proving tests can fail:** per milestone in `tasks.md`.
