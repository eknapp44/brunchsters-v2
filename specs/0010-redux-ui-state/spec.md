# Spec 0010 — Redux Toolkit for UI State

**Status:** Complete (implemented 2026-10-19/20 across M1–M4; awaiting review and merge)  
**Branch:** `feat/0010-redux-ui-state`  
**PLANNING.md ref:** §3 (Tech Stack: State Management), §16 Build Order, §17 (new "Redux follow-ups" entry)  
**ADRs:** [0011 — Redux Toolkit for client UI state](../../docs/adrs/0011-redux-toolkit-for-client-ui-state.md)

> **Numbering note.** `PLANNING.md` and spec 0008 reserved "spec 0010" for the notifications follow-up. The owner chose the order **Redux (0010) → design fidelity (0011) → notifications (named, not numbered: security hardening took 0012; see spec 0012's numbering note)**. The docs commit that adds this spec renumbers those references.

---

## What

Install Redux Toolkit and use it for the client UI state that exists today, **without changing anything a person can see or do**. The docs have claimed Redux since the start; this makes the claim true, with a pattern and tests in place before the features that need shared UI state (toasts, an unread count, realtime) arrive.

Grounded in the current code:

- **Nothing is shared between components today.** Every piece of client state is local to one component. The wizard reducer (`brunch/new/page.tsx:76`, ten actions, `useReducer`) plus `submitting`/`submitError` in `useState` live in the page and die on submit. About ten controls (`RsvpControl`, `InvitePanel`, `SuggestionsPanel`, `OptionSuggestionControl`, `OptionManager`, `VotingControls`, `ConfirmControl`, `OptionSuggestionReview`, the two checklists) each own `submitting`/`error`/`pending` flags, a `fetch`, and a `router.refresh()`.
- **The two ballot checklists are duplicates.** `LocationBallotChecklist` and `TimeBallotChecklist` (`BallotChecklist.tsx`) differ only in the endpoint and how an option is drawn. Both seed `selected` once from props, filter stale ids against the current options on every render (spec 0005 review F2), roll the checkbox back on a failed save, and show an "unchecking your last option" warning that blocks the save. That logic is the most valuable thing to put under unit test.
- **Spec 0003 chose local state for the wizard** ("ceremony without benefit", `specs/0003-create-brunch/plan.md:206`). This spec reverses that on purpose, to give the store a low-risk first user whose behavior is already pinned by journeys (C1, C2, F2); ADR 0011 records the reversal.
- **Pages are Server Components; mutations end in `router.refresh()`.** There is no client data cache to replace, so the store holds only state the server does not know.
- **`apps/web` runs vitest in node only** (`vitest.config.ts`, `environment: 'node'`); nothing tests React rendering. Reducers, selectors and thunks fit that.
- **17 distinct generic error strings** ("Failed to save your vote", "Failed to update RSVP", …) exist across the components, and the server's error body is discarded in all of them. The journeys assert some of them. They stay exactly as they are.

### Principles for this spec

1. **Behavior-preserving.** No change to routes, copy, accessible names, roles, or what happens on failure. The existing journeys pass **unmodified**; if one needs editing, stop and raise it.
2. **UI state only.** `packages/core` stays framework-free; no business rule moves into the store (Constitution 6, 15).
3. **Per-request store, never a module singleton.** Server Components do not touch Redux.
4. **Everything left out is written down** (ADR 0011, "What this spec does not cover" below, and PLANNING §17) so the follow-ups are not lost.

---

## User flows

No flow changes. For reference, the flows whose state moves into the store:

1. **Host creates a brunch (wizard).** Four steps; entries kept going back and forward; on a failed create the entries are kept, the error shown, and creating again works; on success the host lands on `/brunch/[id]`. Leaving the wizard and coming back in the app starts empty, as today.
2. **A voter ticks places and times.** A tick is shown at once and saved; a failed save (or a vote racing a close) rolls the box back and shows "Failed to save your vote"; unchecking the last option shows the warning and sends nothing; an option the host removed drops out of the selection silently.
3. **Anyone revisiting a brunch** sees their saved vote from the server, not an unsaved selection left over from an earlier visit.

---

## Acceptance Criteria

### Dependencies and plumbing

- [x] `@reduxjs/toolkit` and `react-redux` added to `apps/web` (versions recorded in `tasks.md`); nothing else imports them (`packages/*` unchanged)
- [x] `makeStore()` (via `configureAppStore`) builds a fresh store each call (a test proves two stores share no state); no module-level store exists (`configureStore` is called in one place, and lint forbids it elsewhere)
- [x] `StoreProvider` (client component) creates the store once per mount with `useRef` and sits in the `(authenticated)` layout (mounted in M2, with the first slice); the layout stays a Server Component
- [x] Typed `useAppDispatch`, `useAppSelector` and a typed `createAppAsyncThunk`; `fetch` is supplied through the thunk `extra` argument (`useAppStore` was not added: nothing needs it yet)
- [x] RTK's serializable and immutable checks stay on; no `Date`, `Set` or class instance in state
- [x] The boundaries are lint errors: components cannot import the bare `useDispatch` / `useSelector` / `useStore`, and nothing outside `store/makeStore.ts` and `store/hooks.ts` can call `configureStore` or `createAsyncThunk`; selectors live beside their slice
- [x] `createBrunch` has a `condition`: a second create while the first is in flight sends nothing
- [x] Redux DevTools on in development only

### Wizard slice

- [x] `wizardSlice` holds `step`, `title`, `description`, `locations`, `times` (ISO strings), `votingDeadline`, `emails`, `submitting`, `submitError`, `requestId`; its actions preserve every current reducer rule (the 50-address cap and de-duplication on add, removal by place id, time by index, exhaustive handling)
- [x] An action resets the wizard; the page dispatches it **on unmount** (a reset on mount would paint one frame of the old draft), so leaving and returning starts empty; a create failure that arrives after the reset (or belongs to an earlier submission) is ignored
- [x] `createBrunch` thunk performs the create request, then the best-effort invite request (its failure ignored, as today), and returns the new id; `router.push` stays in the component
- [x] Failure keeps all entries and sets `submitError` to the same strings as today ("Failed to create brunch" or the server's message from `extractErrorMessage`)
- [x] `brunch/new/page.tsx` loses its reducer; steps read the store through the typed hooks. Per-step transient inputs (`timeInput`, `emailInput`, `PlaceSearchInput`'s query and predictions) stay local `useState`

### Ballot slice

- [x] One `ballotsSlice`, keyed by brunch and kind (`location` | `time`), holding `selected: string[]`, `previous`, `requestId`, `submitting`, `error`, `emptyWarning` for each ballot that has been touched; a result from any request other than the one the entry waits on is ignored
- [x] `effectiveSelection` (a pure function over the stored entry) returns the effective selection: the stored one, or the server-seeded `viewerVoted` ids when nothing is stored, **filtered against the current option ids on every call** (the F2 behavior)
- [x] `toggleBallotOption` (one thunk; its `pending` reducer applies the toggle optimistically): an empty selection sets `emptyWarning` and sends nothing; otherwise it PUTs to `/votes/locations` or `/votes/times`; a click on a read-only ballot or while a save is in flight is ignored (the thunk's `condition`)
- [x] A rejected save (non-OK response or network error) restores the previous selection and sets `error` to "Failed to save your vote"; a successful save leaves the selection and the component calls `router.refresh()`
- [x] Entries are released when the checklist unmounts, so a later visit reseeds from the server
- [x] `LocationBallotChecklist` and `TimeBallotChecklist` share one hook/component for the logic and keep their own rendering, markup, text and roles; the "not votable" branch, the closed and no-RSVP notices, and the time-zone note are unchanged

### Docs

- [x] README, root `CLAUDE.md` and `PLANNING.md` §3 say Redux Toolkit is in use (not "planned")
- [x] `apps/web/CLAUDE.md` gains a short "State" section: the store rules (UI state only, per-request, serializable, typed hooks, when to add a slice vs keep `useState`)
- [x] `specs/0003-create-brunch/plan.md` "local state" note points to ADR 0011
- [x] `PLANNING.md` §17 "Redux follow-ups" lists everything deferred (below), and §16/§17 and spec 0008 use the new numbers (design fidelity 0011, notifications later, unnumbered)
- [x] `tasks.md` testing notes complete per milestone

---

## E2E Journeys

The existing journeys are the safety net and must pass **unmodified**: F1 (ballot rolled back, places and times, and a vote racing a close), F2 (a failed create keeps entries and retries), C1/C2 (wizard happy path, back/next keeps data, place search), the voting journeys (V1–V6) and the same-person, timezone and keyboard/motion journeys. New journeys cover only the places a provider that outlives the page could change behavior. Identity key: **host** is the signed-in owner, **voter** an invited attendee.

| ID  | Who         | What is asserted                                                                                                                                                                                                                                                                    |
| --- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | host        | Fill in the wizard's title and add a place, leave through the top bar to the dashboard, come back through "Plan a Brunch": the wizard is on step 1 with an empty title and no places (the store does not keep a draft)                                                              |
| R2  | voter       | Uncheck the last option of a ballot so the "unchecking your last option" warning shows, navigate away in the app and return to that brunch: the earlier saved vote is checked again and no warning shows (an unsaved selection does not survive; the server's vote is reseeded)     |
| R3  | voter       | On a brunch with several places and several times, make the place save fail (route intercepted): only the place checkbox rolls back and shows the error; the time ballot, ticked and saved in the same session, keeps its tick and shows no error (the two ballots are independent) |
| R4  | voter, host | Three places; the voter ticked one, then ticks another; the host removes the first; a time vote refreshes the page and the removed place is gone; ticking a remaining place saves with no error (the removed id is not resubmitted)                                                 |
| R5  | voter       | A place save is held back; the voter leaves and returns in the app and ticks another place (saved); the held save now fails: the new tick stays and no error shows                                                                                                                  |

**Proving they can fail** (each run and reverted; see the testing notes): R1 — remove the reset-on-unmount; the draft reappears. R2 — remove the release-on-unmount; the stale empty selection reappears. R3 — key the ballots slice by brunch only; a failure on places overwrites the times ballot. R4 — remove the stale-id filter; the removed id is resubmitted and refused. R5 — remove the request-id guard; the held failure rolls back the new tick.

---

## What This Spec Does Not Cover

Each of these is recorded in ADR 0011 and PLANNING §17.

- **The other panels' state** (RSVP, invites, suggestions, option management, voting controls, confirmation, suggestion review): they keep local `submitting`/`error`/`pending`. A later spec migrates them to a shared mutation slice once there is a reason (toasts).
- **Toasts, a visible error surface, and showing the server's real error text** (the "silent failures" input in PLANNING §17). Error strings stay exactly as they are.
- **The unread-notifications count and realtime updates** (the notifications spec, numbered when it is written).
- **Persisting the wizard draft** across reloads: a product decision about stale drafts.
- **RTK Query.** Server Components plus `router.refresh()` remain the data path.
- **Moving any business rule into the store.** Option validity, vote rules and close rules stay on the server and in `packages/core`.
- **Any visual change.** Design fidelity is spec 0011.

---

## Outcome — where the build differs from the draft

- **Reset on unmount, not on mount** (wizard), to avoid a one-frame flash of the old draft; R1 proves it, and a review fix (`c99976c`) makes the slice ignore a create failure that lands after the reset.
- **One thunk for ballots**, not a toggle action plus a `saveBallot` thunk: the optimistic update and the rollback are the thunk's `pending` and `rejected` reducers, which read the arguments, so the rules are pure and there is no flash of `submitting` on the empty-ballot case.
- **`effectiveSelection` is a pure function**, not a store selector; the hook passes it the stored entry and the server's props.
- **`useAppStore` not added**; the Redux DevTools question is settled as development only.
- **Bundle:** `next build` first-load JS, `main` → this branch: `/brunch/[id]` 112 → 122 kB, `/brunch/new` 107 → 117 kB, `/dashboard` 107 → 107, `/brunch/[id]/manage` 111 → 111, shared 102 → 102. The table under-reports: the Redux chunk (about 9 kB gzipped) is listed under the shared `(authenticated)` layout in `.next/app-build-manifest.json`, so every signed-in route most likely loads it. Accepted (small, cached, and the toast and unread-count work needs the store app-wide); not confirmed in a browser network panel.
- **Stale-request race (found in the pre-merge review):** the ballot key is the same on every visit to a brunch, so a save still in flight when the voter left and came back could unlock, roll back or flag the new ballot; the wizard had the same hole after a reset. Both entries now keep the id of the request they wait on and ignore any other (unit tests for each, and journey R5 with a held request; each fails without the guard).
- **Hardening before merge (owner asked for the feature to be complete):** journey R4 now guards the stale-option filter (it fails with the filter removed); `createBrunch` got a `condition` against double submits; selectors moved beside their slices; ESLint now enforces the store boundaries; the State rules, a migration recipe, a root rule and a `/spec-grill` prompt tell the next spec where UI state goes. A sign-out leak journey was considered and dropped: signing in again is a full-page redirect through Google, which discards the store anyway, so the test would pass trivially. The protection is the provider's placement in the `(authenticated)` layout, written down as a rule in `apps/web/CLAUDE.md`.

## Known gaps (accepted, not hidden)

Each is also in PLANNING §17 "Redux follow-ups" where a later spec could act on it.

| Gap                                                                                                                                                                                                                                                                                                                                                       | Why it is accepted                                                                                                                                                                             | Guarded by                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **That signing out drops the store** (the `(authenticated)` layout unmounting on the move to `/`) is not tested. It is the protection against one person's draft reaching the next person to sign in on the same browser.                                                                                                                                 | Signing in again is a full-page redirect through Google, which discards the store anyway, so a sign-out journey would pass trivially. The placement is a written rule in `apps/web/CLAUDE.md`. | The rule in the docs only. Add a test if the provider is ever moved or sign-in becomes client-side.                                                 |
| **Two saves from different visits can reach the server out of order** (the client ignores the stale result, but the server applies whichever arrives last).                                                                                                                                                                                               | Needs two overlapping requests for the same ballot across a navigation; the server-side result is a valid ballot either way.                                                                   | Nothing; would need request sequencing or an `If-Match` style check on the vote endpoints.                                                          |
| **A late create failure after a reset, a second create click while one is in flight, and a click on a read-only or saving ballot** are guarded by unit tests only.                                                                                                                                                                                        | The UI already disables the buttons and checkboxes; these are defense in depth. A journey would need fine timing control.                                                                      | `wizardSlice.test.ts`, `ballotsSlice.test.ts` (each proven to fail without its guard).                                                              |
| **`submitting` stays true after a successful create** and is cleared by the unmount reset, which no test asserts directly.                                                                                                                                                                                                                                | Same as before the refactor; the page is navigating away.                                                                                                                                      | Journeys C1/F2 (the page navigates); no direct assertion.                                                                                           |
| **One unexplained intermittent dev-mode e2e failure**: journey V2 on the `mobile` project timed out once (19 s) in a full run on the final tree. It did not reproduce in 12 targeted repeats, two further full runs, the earlier 420-run stress pass, or CI mode (140 passed). Same class as the two unexplained dev-mode failures recorded in spec 0009. | No error was captured, so no cause is claimed. V2 exercises the read-only ballot, so a ballot regression was considered; nothing found.                                                        | CI mode (production build, strict timeouts) is the gate. If it recurs, run with `trace: 'retain-on-failure'` (proposed in spec 0009, not yet done). |
| **The bundle cost on routes other than the two measured** is inferred from the build manifest, not measured in a browser.                                                                                                                                                                                                                                 | About 9 kB gzipped, cached.                                                                                                                                                                    | The build output in this spec.                                                                                                                      |

## Open Questions

- **Redux DevTools in production?** Assumed off (development only). Revisit only if debugging a deployed build needs it.
- **`useAppStore`.** Add it when a component outside React needs to read state (a future realtime subscriber would).
- Resolved during the build: ballots seed from server props at render with no effect, and React 19 strict-mode double mounting is harmless for both the ballot release and the wizard reset (the dev e2e runs pass).
