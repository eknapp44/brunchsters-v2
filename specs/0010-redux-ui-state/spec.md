# Spec 0010 — Redux Toolkit for UI State

**Status:** Complete (implemented 2026-10-19/20 across M1–M4; awaiting review and merge)  
**Branch:** `feat/0010-redux-ui-state`  
**PLANNING.md ref:** §3 (Tech Stack: State Management), §16 Build Order, §17 (new "Redux follow-ups" entry)  
**ADRs:** [0011 — Redux Toolkit for client UI state](../../docs/adrs/0011-redux-toolkit-for-client-ui-state.md)

> **Numbering note.** `PLANNING.md` and spec 0008 reserved "spec 0010" for the notifications follow-up. The owner chose the order **Redux (0010) → design fidelity (0011) → notifications (0012)**. The docs commit that adds this spec renumbers those references.

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
- [x] `makeStore()` builds a fresh store each call (a test proves two stores share no state); no module-level store exists
- [x] `StoreProvider` (client component) creates the store once per mount with `useRef` and sits in the `(authenticated)` layout (mounted in M2, with the first slice); the layout stays a Server Component
- [x] Typed `useAppDispatch`, `useAppSelector` and a typed `createAppAsyncThunk`; `fetch` is supplied through the thunk `extra` argument (`useAppStore` was not added: nothing needs it yet)
- [x] RTK's serializable and immutable checks stay on; no `Date`, `Set` or class instance in state
- [x] Redux DevTools on in development only

### Wizard slice

- [x] `wizardSlice` holds `step`, `title`, `description`, `locations`, `times` (ISO strings), `votingDeadline`, `emails`, `submitting`, `submitError`; its actions preserve every current reducer rule (the 50-address cap and de-duplication on add, removal by place id, time by index, exhaustive handling)
- [x] An action resets the wizard; the page dispatches it **on unmount** (a reset on mount would paint one frame of the old draft), so leaving and returning starts empty; a create failure that arrives after the reset is ignored
- [x] `createBrunch` thunk performs the create request, then the best-effort invite request (its failure ignored, as today), and returns the new id; `router.push` stays in the component
- [x] Failure keeps all entries and sets `submitError` to the same strings as today ("Failed to create brunch" or the server's message from `extractErrorMessage`)
- [x] `brunch/new/page.tsx` loses its reducer; steps read the store through the typed hooks. Per-step transient inputs (`timeInput`, `emailInput`, `PlaceSearchInput`'s query and predictions) stay local `useState`

### Ballot slice

- [x] One `ballotsSlice`, keyed by brunch and kind (`location` | `time`), holding `selected: string[]`, `submitting`, `error`, `emptyWarning` for each ballot that has been touched
- [x] `effectiveSelection` (a pure function over the stored entry) returns the effective selection: the stored one, or the server-seeded `viewerVoted` ids when nothing is stored, **filtered against the current option ids on every call** (the F2 behavior)
- [x] `toggleBallotOption` (one thunk; its `pending` reducer applies the toggle optimistically): an empty selection sets `emptyWarning` and sends nothing; otherwise it PUTs to `/votes/locations` or `/votes/times`; a click on a read-only ballot or while a save is in flight is ignored (the thunk's `condition`)
- [x] A rejected save (non-OK response or network error) restores the previous selection and sets `error` to "Failed to save your vote"; a successful save leaves the selection and the component calls `router.refresh()`
- [x] Entries are released when the checklist unmounts, so a later visit reseeds from the server
- [x] `LocationBallotChecklist` and `TimeBallotChecklist` share one hook/component for the logic and keep their own rendering, markup, text and roles; the "not votable" branch, the closed and no-RSVP notices, and the time-zone note are unchanged

### Docs

- [x] README, root `CLAUDE.md` and `PLANNING.md` §3 say Redux Toolkit is in use (not "planned")
- [x] `apps/web/CLAUDE.md` gains a short "State" section: the store rules (UI state only, per-request, serializable, typed hooks, when to add a slice vs keep `useState`)
- [x] `specs/0003-create-brunch/plan.md` "local state" note points to ADR 0011
- [x] `PLANNING.md` §17 "Redux follow-ups" lists everything deferred (below), and §16/§17 and spec 0008 use the new numbers (design fidelity 0011, notifications 0012)
- [x] `tasks.md` testing notes complete per milestone

---

## E2E Journeys

The existing journeys are the safety net and must pass **unmodified**: F1 (ballot rolled back, places and times, and a vote racing a close), F2 (a failed create keeps entries and retries), C1/C2 (wizard happy path, back/next keeps data, place search), the voting journeys (V1–V6) and the same-person, timezone and keyboard/motion journeys. New journeys cover only the places a provider that outlives the page could change behavior. Identity key: **host** is the signed-in owner, **voter** an invited attendee.

| ID  | Who   | What is asserted                                                                                                                                                                                                                                                                    |
| --- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | host  | Fill in the wizard's title and add a place, leave through the top bar to the dashboard, come back through "Plan a Brunch": the wizard is on step 1 with an empty title and no places (the store does not keep a draft)                                                              |
| R2  | voter | Uncheck the last option of a ballot so the "unchecking your last option" warning shows, navigate away in the app and return to that brunch: the earlier saved vote is checked again and no warning shows (an unsaved selection does not survive; the server's vote is reseeded)     |
| R3  | voter | On a brunch with several places and several times, make the place save fail (route intercepted): only the place checkbox rolls back and shows the error; the time ballot, ticked and saved in the same session, keeps its tick and shows no error (the two ballots are independent) |

**Proving they can fail:** R1 — delete the dispatch of the reset action on mount; the draft reappears and R1 fails. R2 — delete the release-on-unmount; the stale empty selection reappears and R2 fails. R3 — key the ballots slice by brunch only (drop the kind from the key); a failure on places overwrites the times ballot and R3 fails. Each proof is run and reverted in the milestone that adds the journey, and written in its testing note.

---

## What This Spec Does Not Cover

Each of these is recorded in ADR 0011 and PLANNING §17.

- **The other panels' state** (RSVP, invites, suggestions, option management, voting controls, confirmation, suggestion review): they keep local `submitting`/`error`/`pending`. A later spec migrates them to a shared mutation slice once there is a reason (toasts).
- **Toasts, a visible error surface, and showing the server's real error text** (the "silent failures" input in PLANNING §17). Error strings stay exactly as they are.
- **The unread-notifications count and realtime updates** (the notifications spec, now 0012).
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
- **Bundle:** `/brunch/[id]` first-load JS 112 kB → 122 kB and `/brunch/new` 107 kB → 117 kB; `/dashboard` (107 kB) and `/brunch/[id]/manage` (111 kB) unchanged; the shared bundle stays 102 kB (measured with `next build` on `main` and on this branch). Why the layout's provider adds nothing to the other routes was not investigated.
- **Journey gap:** no journey guards the ballots' stale-option filter; recorded in PLANNING §17 "Redux follow-ups".

## Open Questions

- **Redux DevTools in production?** Assumed off (development only). Revisit only if debugging a deployed build needs it.
- **`useAppStore`.** Add it when a component outside React needs to read state (a future realtime subscriber would).
- Resolved during the build: ballots seed from server props at render with no effect, and React 19 strict-mode double mounting is harmless for both the ballot release and the wizard reset (the dev e2e runs pass).
