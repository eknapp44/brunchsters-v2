# Tasks 0010 — Redux Toolkit for UI State

Four milestones, each green on its own and ending in a commit. Branch: `feat/0010-redux-ui-state`, cut from `main` (no stacking needed). Close each milestone with `/milestone-done`, then **stop for review** before the next. Every milestone runs the full e2e sequence (dev run, stress run, CI mode) because each changes user-facing code, and **the existing journeys must pass unmodified**; a milestone that seems to need one edited stops and is discussed.

---

## M1 — Docs, dependencies and store plumbing

- [x] Commit ADR 0011, its README index row, the numbering updates and this spec folder (docs-only commit, before any code)
- [x] `pnpm --filter @brunchsters/web add @reduxjs/toolkit react-redux` (record the versions below); confirm `react-redux` supports the installed React 19
- [x] `src/store/makeStore.ts`, `StoreProvider.tsx`, `hooks.ts` (typed hooks and `createAppAsyncThunk`). `makeStore` takes the reducer map as a parameter with the app's map as the default; M1 has no real slice yet, so its tests use a throwaway reducer, and M2 adds the wizard to the app's map. The provider is not mounted in the layout until M2 has a slice to serve (an empty store would be dead code)
- [x] `makeStore.test.ts`: two stores share no state; the `extra.fetch` given is the one thunks receive
- [x] Flip the stack lines (README, root `CLAUDE.md`, `PLANNING.md` §3) from "planned" to "in use, see ADR 0011"
- [x] `apps/web/CLAUDE.md`: new short "State" section (UI state only; per-request store; serializable state; typed hooks; slice vs `useState`; reset or reseed on mount)
- [x] **Prove the test can fail:** replace `makeStore` with a module-level singleton; `makeStore.test.ts` fails
- [x] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` (stress run and CI mode skipped: nothing mounted in the app changed; M2 runs both)
- [x] Commit: `feat: add Redux Toolkit store plumbing for client UI state (M1)`

**Testing notes:**

- **What was tested:** the per-request guarantee and the thunk `extra` wiring. `makeStore.test.ts` (2 tests) builds two stores from `configureAppStore` with a throwaway counter reducer: changing one leaves the other at its initial state, and a thunk receives exactly the `fetch` it was given.
- **How:** unit, node vitest, no mocks beyond the injected fake `fetch`. Web 321 tests (2 new), core 429, shared 7, database 1; typecheck and lint clean; full e2e 135 passed, 2 skipped, all existing journeys unmodified.
- **Proving it can fail:** `configureAppStore` was changed to return a cached store; the isolation test failed ("expected 2 to be +0"); reverted.
- **What's deferred:** `makeStore` (the app's real reducer map) has no test of its own because the map is empty until M2 adds the wizard slice (an empty `combineReducers` warns at runtime). `StoreProvider` is written but not mounted in the layout until M2, so nothing runs it yet. Stress run and CI mode run from M2.
- **Findings:** `pnpm add` rewrote the lockfile in its own style; Prettier restored the committed style (120 added lines). react-redux 9.3 declares React 19 support. README's stack table was realigned by Prettier (a 20-line diff for a one-cell change).
- **How to run it:** `pnpm --filter @brunchsters/web exec vitest run src/store`.

---

## M2 — Wizard slice

- [x] `(authenticated)/layout.tsx` wraps children in `StoreProvider` and stays a Server Component; the wizard reducer joins the app's reducer map
- [x] `wizardSlice.ts`: state, reducers mirroring the current `wizardReducer` rule for rule (email cap and de-duplication included), `wizardReset`, times as ISO strings
- [x] `createBrunch` thunk with `extractErrorMessage`; best-effort invites; typed `rejectValue`
- [x] `brunch/new/page.tsx` reads the slice and dispatches; reset on unmount; `timeInput`, `emailInput` and place search stay local state; accessible names, roles and copy unchanged
- [x] `wizardSlice.test.ts`: every reducer rule; thunk: create fails (entries kept, server message, then the generic one on a network error), create succeeds with invites, invite fails (ignored, id still returned), no emails (no second request)
- [x] Journey **R1** in `e2e/journeys/redux-ui-state.spec.ts` (wizard draft does not survive leaving the page)
- [x] **Prove the tests can fail:** remove the reset-on-unmount → R1 fails; flip the email cap comparison → a reducer test fails; make the thunk throw on invite failure → the thunk test fails. Revert each
- [x] Existing C1, C2, F2 and the 50-invitee journey pass unmodified
- [x] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`, stress run, CI mode
- [x] Commit: `refactor: move the creation wizard's state into a Redux slice (M2)`

**Testing notes:**

- **What was tested:** every wizard reducer rule and the `createBrunch` thunk. Reducers: field and step changes, location removal by place id, time removal by index, duplicate email ignored, the 50-address cap, email removal, reset. Thunk: the request body (trimmed title, no description when empty, deadline as an ISO instant, times as sent), invites sent after a create, no invite request without emails, invite rejected or 500 still returns the id, a failed create keeps every entry and shows the server's message, an `errors` array is joined, an unreadable body and a network error fall back to "Failed to create brunch", and a retry clears the error and sets `submitting`. Journey **R1**: fill the wizard's title, description and a place, leave through the top bar to the dashboard, come back via "Plan a Brunch" (no reload): empty title and description, and no places.
- **How:** unit in node vitest with a fake `fetch` given through the thunk `extra` (18 new tests in `wizardSlice.test.ts`); R1 is a Playwright journey. Web 339 unit tests; full e2e 136 passed, 2 skipped on the dev server, stress run (`--workers=4 --repeat-each=3`) 408 passed, CI mode (production build, strict timeouts) 136 passed. Existing C1, C2, F2 and the 50-invitee journeys passed unmodified. Typecheck and lint clean.
- **Proving the tests can fail:** (1) removed the reset-on-unmount `useEffect` → R1 failed (`Title` expected "" but held the old draft); (2) changed the email cap from `>=` to `>` → "stops adding emails at the per-request cap" failed; (3) made the invite catch rethrow → "still returns the id when the invite request rejects" failed. Each reverted.
- **What's deferred:** `submitting` stays true after a successful create (as before; the page is navigating away) and is cleared by the unmount reset, which no test asserts directly. The place-search input's query and predictions and the per-step `timeInput`/`emailInput` stay local `useState` by design.
- **Findings:** the circular type worry (store state type ↔ thunk state type) did not occur; `RootState` is derived from the reducer map and the thunk takes it with no error. ESLint forbids `void` as a thunk argument type, so `createBrunch` uses `undefined` (the call site still passes no argument). Wizard step components now read the slice themselves instead of receiving `state`/`dispatch` props, which removed the prop plumbing. `NewBrunchPage` ignores the rejection from `unwrap()` because the thunk has already put the message in the store.
- **How to run it:** `pnpm --filter @brunchsters/web exec vitest run src/store`; `pnpm --filter @brunchsters/web exec playwright test redux-ui-state create-brunch failure-paths`.

---

## M3 — Ballot slice and the shared checklist hook

- [x] `ballotsSlice.ts`: state keyed by `${brunchId}:${kind}`, `ballotToggled`, `ballotReleased`, `selectEffectiveSelection` (stored or seeded, filtered to current option ids)
- [x] `saveBallot` thunk (PUT to `/votes/locations` or `/votes/times`), rollback to the exact previous selection, "Failed to save your vote" on a non-OK response or a network error
- [x] `useBallot` hook shared by `LocationBallotChecklist` and `TimeBallotChecklist`; the two components keep their markup, text, roles, the not-votable branch, the closed and no-RSVP notices, and the time-zone note; release on unmount
- [x] `ballotsSlice.test.ts`: seeded vs stored selection; stale ids dropped on every read; toggling to empty sets the warning and sends nothing; toggling ignored while submitting or read-only; rollback restores the exact previous selection (including after two quick toggles); network failure rolls back; success keeps the selection; release clears the entry; the location and time ballots of one brunch are independent
- [x] Journeys **R2** and **R3**
- [x] **Prove the tests can fail:** drop the stale-id filter → the reducer test fails (no journey does: see the testing note); make rollback a no-op → F1 fails; remove the release → R2 fails; drop the kind from the key → R3 fails. Revert each
- [x] Existing F1, V1–V6, same-person and timezone journeys pass unmodified
- [x] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`, stress run, CI mode
- [x] Commit: `refactor: move ballot state into a Redux slice and share the checklist logic (M3)`

**Testing notes:**

- **What was tested:** `effectiveSelection` (server-seeded vs stored, an empty stored selection still wins, stale ids dropped from both sources on every read) and `toggleBallotOption` (the optimistic selection is visible the moment the thunk starts, the PUT goes to the places or times endpoint with the whole ballot, unticking an existing tick, an empty ballot is never sent and only warns, the warning clears on the next tick, a read-only ballot is ignored, a click while a save is in flight is ignored and the first save still settles, a refused save and a network error each restore exactly the previous selection and set "Failed to save your vote", the error is cleared by the next save but not by unticking the last box, place and time ballots of one brunch are independent, ballots of two brunches are independent) and `ballotReleased`. Journeys: **R2** (uncheck the last option so the warning shows, go to the dashboard and back by clicking: the saved vote is checked again, no warning) and **R3** (a time vote saves, then the place save fails: only the place box rolls back and the error shows once).
- **How:** unit in node vitest with a fake `fetch` (16 new tests in `ballotsSlice.test.ts`, including a deferred `fetch` for the in-flight case); R2 and R3 are Playwright journeys. Web 355 unit tests; full e2e 138 passed, 2 skipped on the dev server; stress run (`--workers=4 --repeat-each=3`) 414 passed; CI mode 138 passed. F1, V1-V6, same-person, timezone and manage-options journeys passed unmodified. Typecheck and lint clean.
- **Proving the tests can fail:** (1) removed the stale-id filter → the `effectiveSelection` unit test failed, but **voting, same-person and manage-options journeys still passed**; (2) made the rollback a no-op → 3 reducer tests, F1 (all three tests) and R3 failed; (3) removed the release on unmount → R2 failed; (4) dropped the kind from the ballot key → R2 and R3 failed. Each reverted.
- **What's deferred / gap:** no journey covers the stale-id filter (spec 0005 review F2): it needs three places, a voter who has voted for one, the host removing that one, and the voter's page refreshing (for example after a time vote) before they tick another place. The reducer test is the only guard. Worth a journey if that bug class returns.
- **Findings:** the toggle is one `createAsyncThunk` with a `condition` (read-only or already saving means no action at all), and the optimistic update and the rollback are `pending`/`rejected` reducers that read `meta.arg`, so there is no flash of `submitting` on the empty-ballot case and the rules are pure. The old "seeded once on mount" comment's problem (state not noticing new props) is gone because the selection is derived on every render from the stored entry or the server's. While writing R3 a `` in a Python-written file became a literal backspace character and made an assertion silently wrong; fixed with the edit tool (the lesson: write regexes with the editor, not through a shell heredoc). Build output: `/brunch/[id]` 6.99 kB (122 kB first load), `/brunch/[id]/manage` 5.23 kB (111 kB); the baseline before this spec is measured in M4.
- **How to run it:** `pnpm --filter @brunchsters/web exec vitest run src/store`; `pnpm --filter @brunchsters/web exec playwright test redux-ui-state failure-paths voting`.

---

## M4 — Close-out: follow-ups recorded, docs final

- [x] `PLANNING.md` §17: new "Redux follow-ups" entry listing every deferred item (the remaining panels' shared mutation slice, toasts and the visible error surface with the server's real message, unread count and realtime, wizard draft persistence, RTK Query), pointing at ADR 0011
- [x] `specs/0003-create-brunch/plan.md`: the "local state" note points to ADR 0011
- [x] Spec status → Complete; build-order note in `PLANNING.md` §16 (Redux shipped; fidelity 0011; notifications 0012)
- [x] Bundle check: record the authenticated-route first-load JS before and after (`next build` output) in the testing note
- [x] Multi-lens review before merge (architecture/style, acceptance criteria, security, loose ends), as for earlier specs
- [x] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`, CI mode
- [x] Commit: `docs: close out spec 0010 and record the Redux follow-ups (M4)`

**Testing notes:**

- **What was tested:** nothing new except one regression test from the review: a create failure that arrives after the wizard was reset is ignored (found by reading the diff as a reviewer; before the fix a late failure wrote an error into the fresh state and the next visit to the wizard would have shown it).
- **How:** unit (web 356 tests); full e2e on the final tree 138 passed, 2 skipped, and CI mode 138 passed, 2 skipped. The fix has its own `fix:` commit (`c99976c`) per the repo's convention.
- **Proving it can fail:** removed the `if (!state.submitting) return;` guard; the new test failed; restored.
- **Review lenses:** _architecture/style_ — store, thunks and hooks follow the ADR (per-request store, injected `fetch`, typed hooks, serializable state, no business rules); components keep names, roles and copy. _Acceptance criteria_ — every box in `spec.md` is ticked against the code, with the deviations listed under "Outcome". _Security_ — no new server surface, no new route or permission path; the thunks call the same endpoints with the same ids as the components did, and nothing sensitive is kept in the store beyond the form the person typed. _Loose ends_ — the late-failure leak (fixed), the stale-option journey gap (recorded in PLANNING §17), and the unexplained fact that `/dashboard` did not grow although the provider is in the shared layout.
- **Bundle (`next build`, first-load JS):** `main` → this branch: `/brunch/[id]` 112 → 122 kB, `/brunch/new` 107 → 117 kB, `/dashboard` 107 → 107, `/brunch/[id]/manage` 111 → 111, shared 102 → 102.
- **What's deferred:** everything under PLANNING §17 "Redux follow-ups".
- **How to run it:** `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`.

---

## Versions

`@reduxjs/toolkit` ^2.13.0, `react-redux` ^9.3.0 (React 19 supported by react-redux 9).

## Feedback / findings log

_(empty)_
