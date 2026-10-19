# 0011 — Redux Toolkit for client UI state

**Date:** 2026-10-19  
**Status:** Accepted  
**Deciders:** Evan Knapp

## Context

`README.md`, `CLAUDE.md` and `PLANNING.md` §3 have named Redux as the state manager since the project began, but nothing was ever installed. Every screen keeps its client state locally:

- The creation wizard has a reducer inside `brunch/new/page.tsx` (`useReducer`), plus `submitting` and `submitError` in `useState`. It dies when the page unmounts.
- The two ballot checklists (`BallotChecklist.tsx`, one for places and one for times) are near-identical copies of about 150 lines each. Each holds the voter's optimistic selection, seeded once on mount, filters stale option ids on every render (the spec 0005 review fix F2), and rolls back on a failed save.
- About ten other controls (RSVP, invites, suggestions, option management, voting controls, confirmation) each keep their own `submitting` and `error` pair, their own `fetch`, and a `router.refresh()` afterwards. 17 distinct generic error strings exist, and the server's error body is discarded in all of them.

Nothing is shared between components today, so Redux is not fixing a present bug. Spec 0003's plan (§ "Deliberately local state, not Redux") correctly kept the wizard local at the time: "ceremony without benefit". What changed is the road ahead. A toast and error surface, an unread-notifications count, realtime updates and shared optimistic state are all coming (the Claude Design prototype shows them), and each needs state that several components read. Adopting the store now, behind features that already exist and are covered by journeys, is cheaper than introducing it under the first feature that needs it. The owner prefers Redux for UI state and decided to adopt it.

Constitution 6 and 15 apply: business logic stays in `packages/core`, which stays framework-free.

## Decision

Adopt **Redux Toolkit** (`@reduxjs/toolkit`) and **`react-redux`** in `apps/web` for **client UI state only**.

1. **UI state only.** Business rules stay in `packages/core`. The store lives in `apps/web/src/store/`; `packages/core` and `packages/shared` never import Redux.
2. **A store per request**, made by `makeStore()` and held in a client `StoreProvider` with `useRef`. Never a module-level singleton, because the App Router renders on the server and a shared module store would leak one visitor's state to another. Server Components do not touch the store. The provider sits in the `(authenticated)` layout.
3. **The server stays the source of truth for brunch data.** Pages stay Server Components, and mutations still end in `router.refresh()`, called from the component. The store holds only what the server does not know: a half-filled wizard, a not-yet-saved ballot selection, in-flight and error flags.
4. **Each mutation is a `createAsyncThunk`** that receives `fetch` through the thunk's `extra` argument, so thunks unit-test in node with a fake. Components dispatch and read; they no longer own the `fetch`, the rollback, or the flags for the screens in scope.
5. **Typed hooks and small slices.** `useAppDispatch` / `useAppSelector` (and `withTypes`) are the only way components touch the store. State is serializable: the wizard keeps times as ISO strings and ballots keep selections as `string[]`, so RTK's serializability check stays on.
6. **First slices, behavior-preserving:** the plumbing, the **ballot** slice (replaces the two duplicated checklists) and the **wizard** slice. This supersedes spec 0003's "stay local" note for the wizard. The wizard slice resets when the page mounts, so nothing a person can observe changes. The other panels keep their local state until a later spec (see Consequences).
7. **Tests:** reducer, selector and thunk unit tests in node. No component render tests (Constitution 16). The existing journeys must pass unmodified; new journeys cover only the places the store could change behavior.

**Not decided here (left out deliberately):** RTK Query; persisting any state across reloads; a shared mutation/toast slice; surfacing the server's real error text.

## Consequences

**Easier**

- Cross-component UI state (toasts, an unread count, realtime patches) has a home and a pattern.
- The duplicated ballot logic becomes one tested reducer and thunk. Optimistic update and rollback are testable without a browser.
- Copy-pasted `submitting`/`error`/`fetch`/`refresh` blocks in the remaining panels have an obvious target to migrate to.

**Harder / accepted costs**

- Two new dependencies, and a pattern to learn (slices, thunks, selectors) that is heavier than `useState` for a single control. This is why most panels are _not_ migrated in this spec: where state is local to one component and nothing else will read it, the store adds ceremony.
- A provider that outlives a page means state can outlive a page. Each slice must say how it is reset or reseeded on mount; the wizard resets, and ballot entries are released on unmount and reseeded from server props.
- Redux DevTools is enabled in development only.

**Deferred, to be picked up as their own specs**

- Migrating the remaining panels' `submitting`/`error`/`pending` to a shared mutation slice (RSVP, invites, suggestions, option management, voting controls, confirmation, suggestion review).
- Toasts and a visible error surface, and showing the server's real error message (PLANNING §17 "silent failures").
- The unread-notifications count and realtime updates (notifications spec).
- Draft persistence for the wizard (needs a product decision on stale drafts).
- RTK Query (revisit only if Server Components plus `router.refresh()` stops being enough).

These are also listed in `PLANNING.md` §17 so they are not lost.

## Alternatives considered

- **Keep `useState` / `useReducer` and drop Redux from the docs.** Honest and cheapest today, and what spec 0003 chose. Rejected because the shared UI state it will need soon (toasts, unread count, realtime) would then arrive inside the first feature that needs it, with no pattern and no tests. The owner chose to put the pattern in first.
- **React Context + `useReducer`.** No dependency, but every consumer re-renders on any change, and there are no selectors, devtools or thunks. It would be replaced the moment the state grows.
- **Zustand / Jotai.** Lighter, and fine technology. Rejected because the project already named Redux as its choice, and Redux Toolkit's slice/thunk conventions are explicit and teach well (a stated goal of the project).
- **RTK Query for the mutations.** Its cache would sit beside server-rendered data and `router.refresh()`, giving two sources of truth. Left out unless a client-heavy screen needs it.
- **Migrate every panel in this spec.** Largest dedupe, but touches about ten components at once with accessible names and roles at risk (the contract with ~20 journeys). Split into a later spec.
