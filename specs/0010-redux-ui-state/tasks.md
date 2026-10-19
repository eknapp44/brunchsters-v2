# Tasks 0010 — Redux Toolkit for UI State

Four milestones, each green on its own and ending in a commit. Branch: `feat/0010-redux-ui-state`, cut from `main` (no stacking needed). Close each milestone with `/milestone-done`, then **stop for review** before the next. Every milestone runs the full e2e sequence (dev run, stress run, CI mode) because each changes user-facing code, and **the existing journeys must pass unmodified**; a milestone that seems to need one edited stops and is discussed.

---

## M1 — Docs, dependencies and store plumbing

- [x] Commit ADR 0011, its README index row, the numbering updates and this spec folder (docs-only commit, before any code)
- [ ] `pnpm --filter @brunchsters/web add @reduxjs/toolkit react-redux` (record the versions below); confirm `react-redux` supports the installed React 19
- [ ] `src/store/makeStore.ts`, `StoreProvider.tsx`, `hooks.ts` (typed hooks and `createAppAsyncThunk`). `makeStore` takes the reducer map as a parameter with the app's map as the default; M1 has no real slice yet, so its tests use a throwaway reducer, and M2 adds the wizard to the app's map. The provider is not mounted in the layout until M2 has a slice to serve (an empty store would be dead code)
- [ ] `makeStore.test.ts`: two stores share no state; the `extra.fetch` given is the one thunks receive
- [ ] Flip the stack lines (README, root `CLAUDE.md`, `PLANNING.md` §3) from "planned" to "in use, see ADR 0011"
- [ ] `apps/web/CLAUDE.md`: new short "State" section (UI state only; per-request store; serializable state; typed hooks; slice vs `useState`; reset or reseed on mount)
- [ ] **Prove the test can fail:** replace `makeStore` with a module-level singleton; `makeStore.test.ts` fails
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`, stress run, CI mode
- [ ] Commit: `feat: add Redux Toolkit store plumbing for client UI state (M1)`

**Testing notes:** _(fill on completion)_

---

## M2 — Wizard slice

- [ ] `(authenticated)/layout.tsx` wraps children in `StoreProvider` and stays a Server Component; the wizard reducer joins the app's reducer map
- [ ] `wizardSlice.ts`: state, reducers mirroring the current `wizardReducer` rule for rule (email cap and de-duplication included), `wizardReset`, times as ISO strings
- [ ] `createBrunch` thunk with `extractErrorMessage`; best-effort invites; typed `rejectValue`
- [ ] `brunch/new/page.tsx` reads the slice and dispatches; reset on unmount; `timeInput`, `emailInput` and place search stay local state; accessible names, roles and copy unchanged
- [ ] `wizardSlice.test.ts`: every reducer rule; thunk: create fails (entries kept, server message, then the generic one on a network error), create succeeds with invites, invite fails (ignored, id still returned), no emails (no second request)
- [ ] Journey **R1** in `e2e/journeys/redux-ui-state.spec.ts` (wizard draft does not survive leaving the page)
- [ ] **Prove the tests can fail:** remove the reset-on-unmount → R1 fails; flip the email cap comparison → a reducer test fails; make the thunk throw on invite failure → the thunk test fails. Revert each
- [ ] Existing C1, C2, F2 and the 50-invitee journey pass unmodified
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`, stress run, CI mode
- [ ] Commit: `refactor: move the creation wizard's state into a Redux slice (M2)`

**Testing notes:** _(fill on completion)_

---

## M3 — Ballot slice and the shared checklist hook

- [ ] `ballotsSlice.ts`: state keyed by `${brunchId}:${kind}`, `ballotToggled`, `ballotReleased`, `selectEffectiveSelection` (stored or seeded, filtered to current option ids)
- [ ] `saveBallot` thunk (PUT to `/votes/locations` or `/votes/times`), rollback to the exact previous selection, "Failed to save your vote" on a non-OK response or a network error
- [ ] `useBallot` hook shared by `LocationBallotChecklist` and `TimeBallotChecklist`; the two components keep their markup, text, roles, the not-votable branch, the closed and no-RSVP notices, and the time-zone note; release on unmount
- [ ] `ballotsSlice.test.ts`: seeded vs stored selection; stale ids dropped on every read; toggling to empty sets the warning and sends nothing; toggling ignored while submitting or read-only; rollback restores the exact previous selection (including after two quick toggles); network failure rolls back; success keeps the selection; release clears the entry; the location and time ballots of one brunch are independent
- [ ] Journeys **R2** and **R3**
- [ ] **Prove the tests can fail:** drop the stale-id filter → reducer test and the manage-options/voting journeys that remove a voted option fail; make rollback a no-op → F1 fails; remove the release → R2 fails; drop the kind from the key → R3 fails. Revert each
- [ ] Existing F1, V1–V6, same-person and timezone journeys pass unmodified
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`, stress run, CI mode
- [ ] Commit: `refactor: move ballot state into a Redux slice and share the checklist logic (M3)`

**Testing notes:** _(fill on completion)_

---

## M4 — Close-out: follow-ups recorded, docs final

- [ ] `PLANNING.md` §17: new "Redux follow-ups" entry listing every deferred item (the remaining panels' shared mutation slice, toasts and the visible error surface with the server's real message, unread count and realtime, wizard draft persistence, RTK Query), pointing at ADR 0011
- [ ] `specs/0003-create-brunch/plan.md`: the "local state" note points to ADR 0011
- [ ] Spec status → Complete; build-order note in `PLANNING.md` §16 (Redux shipped; fidelity 0011; notifications 0012)
- [ ] Bundle check: record the authenticated-route first-load JS before and after (`next build` output) in the testing note
- [ ] Multi-lens review before merge (architecture/style, acceptance criteria, security, loose ends), as for earlier specs
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`, CI mode
- [ ] Commit: `docs: close out spec 0010 and record the Redux follow-ups (M4)`

**Testing notes:** _(fill on completion)_

---

## Versions

_(filled in M1: `@reduxjs/toolkit`, `react-redux`)_

## Feedback / findings log

_(empty)_
