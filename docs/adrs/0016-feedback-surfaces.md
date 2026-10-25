# 0016 — Feedback surfaces: one mutation thunk, error codes, toasts

**Date:** 2026-10-24  
**Status:** Accepted  
**Deciders:** Evan Knapp

## Context

Ten client components (`RsvpControl`, `InvitePanel`, `SuggestionsPanel`, `OptionSuggestionControl`, `OptionManager`, `OptionSuggestionReview`, `VotingControls`, `ConfirmControl`, `EndOfTheRoad`, `HideControl`) each own a `submitting`/`error` pair, a `fetch` and a `router.refresh()`. They show about twenty generic strings ("Failed to update RSVP"), none in the Brand Voice, and throw the server's answer away. Two thunks already do the same (`ballotsSlice` returns a constant for any failure; `wizardSlice` ignores the invite request's response entirely). ADR 0011 deferred all of this on purpose: it put the store in first and left "a shared mutation slice, toasts and a visible error surface, and the server's real error text" for the spec that needed them. That spec is 0014.

What the code shows today:

- The routes answer with real English (`{ error: 'Only the host can call it off' }`, about 200 messages in 28 route files), but the shape is not uniform (a Zod failure is `422 { errors: issues }`) and none of it is worded as the brand voice would. Showing those strings would put the server's wording on the screen.
- Only four controls read a 429 (`readRateLimit` + `limitedMessage`); every other mutating route also spends `enforceWriteLimit`, so a heavy user gets a generic failure with no wait shown.
- The wizard sends the invites after the brunch exists and drops the response. A 429 is recovered by the page asking the counters (spec 0012); a 500, a 409 or being offline is silent.
- `PlaceSearchInput` can show an older response over a newer one.
- There is no toast, no `loading.tsx` and no `Suspense`; every error is `role="alert"` inline, and the voice doc (rule 7) forbids promising a retry the app does not make.

The 404/403 rule (root `CLAUDE.md`) constrains the answer: a message must never tell a real brunch from a made-up id.

## Decision

1. **The route answers with a code, the client words it.** A failing route returns `{ error: { code, message } }`. `code` is a short stable string from one list in `packages/shared` (`signed_out`, `not_found`, `forbidden`, `brunch_called_off`, `brunch_changed`, `rate_limited`, `invalid`, `unavailable`, `internal`, and the few specific ones a person can act on). `message` is for logs and other clients, never rendered. The client maps `code` to Brand-Voice copy in one pure, unit-tested `apps/web/src/lib/errorCopy.ts`; an unknown code, or an old-shape body, gets one generic voiced line per status. `network` (a `fetch` that rejected) is made on the client. A scanning test fails when a route returns an error without a code. Because the client can only show what the table says, a route cannot leak by wording.
2. **One mutation thunk with per-key status.** `runMutation` (a `createAppAsyncThunk`) takes a `key`, a request (url, method, body) and how to report (`success` toast text, `failure: 'toast' | 'inline'`), gets `fetch` from `extra`, and resolves or rejects with `{ code }`. A `mutationsSlice` keeps `{ status, requestId, code }` per key; a `condition` makes a second tap on a key in flight do nothing; a result whose `requestId` is not the entry's is ignored (the ADR 0011 rule). Components dispatch and read through `useMutation(key)` and still call `router.refresh()` themselves on success. Optimistic updates keep their own thunk (the ballots), reading codes the same way.
3. **Toasts are for one-tap results, inline is for what the person has to fix or wait out.** A `toastsSlice` (a queue capped at 3, de-duplicated by key) is fed by `runMutation`'s `fulfilled`/`rejected` cases, which read `meta.arg`, so the reducers stay pure. One fixed polite `role="status"` region lives in the `(authenticated)` layout and never takes focus; success stays about 4 seconds, failure about 8, hover or focus pauses the timer, every toast has a dismiss button, and reduced motion removes the slide. Failures of a control that rolled back, anything in a dialog, validation, and every 429 or held countdown stay inline (a wait is a persistent `role="status"` beside its button, never a toast). Success toasts only where the page change is subtle.
4. **No retry button, and the copy says the true state.** A failed tap leaves the control as it was and says so; tapping again is the retry (voice rule 7).
5. **Two codes the browser makes sense of itself.** `network` ("Looks like you're offline.") and `signed_out` (a 401: the toast says so and `router.refresh()` lets the layout's own redirect send the person to sign-in with a callback). No queue, no offline banner.
6. **The wizard keeps going when the invites fail.** The brunch exists, so the host is not blocked: `createBrunch` returns `{ id, invitesFailed }` and the Invites panel shows a persistent inline note after the redirect (not a toast: the addresses are gone with the wizard's reset and the host needs time to act). A refused batch (429) already works through the page's own counters.
7. **Loading skeletons were planned and deferred** (see the addendum): the spike showed that streaming a placeholder changes a 404 into a 200 and delays hydration of the page's controls.
8. **No new runtime dependency.** The toast host and the thunk are built from the existing primitives and tokens.
9. **Voice is enforced.** A test scans `lib/*Copy.ts` and JSX text for the corporate words in `docs/voice-and-copy.md` rule 4, with a small allowlist.

**Not decided here (deferred, in `docs/BACKLOG.md`):** live updates for what other people change (a poll, realtime, or `router.refresh()` on focus), which is also what would make live-region announcements of vote counts honest; the host-facing "an email did not go out" signal (the notifications spec); RTK Query.

## Consequences

**Easier**

- Every control reports failure the same way, in the app's voice, from one table; a new control copies one hook.
- The 404/403 rule gets one more guard: the client cannot render a message the table does not list.
- The notifications spec gets the toast queue and the status region it needs for its own messages.

**Harder / accepted costs**

- About 28 routes change their error body; their tests and about ten journeys that assert the generic strings change with them. Each milestone migrates a route together with the control that calls it, and the client tolerates the old shape until the scanning test goes live at the end of M3.
- A toast is a live region that outlives the component that caused it, so the store and the layout own it, and a result that arrives after a control unmounted still toasts (the action happened).

## Addendum, 2026-10-25: skeletons deferred

Decision 7 planned `loading.tsx` skeletons for the brunch page, the manage page and the dashboard. The M6 spike measured two costs on a production build:

- **`loading.tsx` changes a 404 into a 200.** An outsider and a made-up id both got 200 (bodies identical) with a `loading.tsx` over the brunch segment. The fallback decided in the spec, a `Suspense` boundary placed after the membership check, keeps the 404 (everything that can say "not yours" stays in front of it).
- **Both delay hydration.** The brunch page's first checkbox was owned by React about 45 ms after `load` without a boundary and about 330 ms after with one. A tap in that window is lost, and about ten journeys that click right after `load` failed consistently.

Skeletons are therefore not part of this decision. The attempt (a `Skeleton` primitive, page-shaped placeholders with an accessible `Loading` region, axe passing on them, a status-guard journey) was not kept (it is a few hundred lines, and the finding is the lasting part, so it is described here); the question returns after the deployment spec, when real network latency can be measured, as `docs/BACKLOG.md` "Loading skeletons".

## Alternatives considered

- **Show the route's own message.** Least work, but it spreads copy across 28 files, makes the banned-word test impossible to run in one place, and lets one carelessly worded message leak whether an id exists.
- **A toast library (Sonner, react-hot-toast).** Quick, and fine technology, but it is one more dependency, its markup and live-region behavior are not ours to tune to the accessible-names contract, and the app has a token system and primitives to build from. A toast is a small component.
- **Everything transient as a toast, including 429s.** One surface, but a wait would vanish while its button is still held, and it would lose its tie to the button (spec 0012's design).
- **A retry action in each failure toast.** Friendlier on a phone, but it needs every mutation to be safe to repeat and adds a focusable control to a surface that disappears. Left for a later spec if beta users ask.
- **RTK Query for mutations.** Its cache would sit beside server-rendered data and `router.refresh()` (ADR 0011 already declined it).
- **Migrate a few controls at a time.** Smaller reviews, but two ways to do the same thing for several milestones; ADR 0011 and the BACKLOG say they move together, and milestones are the staging.
