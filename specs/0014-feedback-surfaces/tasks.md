# Tasks 0014 — Feedback Surfaces

**Released:** v1.12.0 (PR #25, merged 2026-10-25).

Six milestones, each green on its own and ending in a commit. Branch: `feat/0014-feedback-surfaces`, cut from `main` (no stacking). Close each milestone with `/milestone-done`, then **stop for the owner's review** before the next. Every milestone runs `pnpm typecheck && pnpm lint && pnpm test`, and `pnpm test:e2e` whenever it touches anything a user sees or does (`CI=true pnpm build && CI=true pnpm test:e2e` is the quick gate; stop your own `pnpm dev` first). Re-verify each milestone's "journeys that change" list with a grep at its start; the grep wins over the list. Use `/ui-screen` for every milestone that changes a screen (M2 to M6) and `/limited-surface` at M1 to record that nothing here needs a new limit.

The order proves the path early: the vocabulary (M1), then one control end to end (M2), then the rest, then the two bug fixes, then skeletons (the riskiest for the 404 rule) last.

---

## M1 — Codes, copy and the voice test

- [x] Commit this spec folder, ADR 0016 (with the README index row), the PLANNING §16 row and the BACKLOG edits as one docs-only commit, before any code
- [x] `packages/shared/src/apiError.ts`: `API_ERROR_CODES`, `ApiErrorCode`, `ApiErrorBody`, a status table per code; unit tests
- [x] Walk every route under `app/api/v1` and list its real error cases; derive the "specific" codes from them (record the list and the draft copy in `plan.md`)
- [x] `apps/web/src/lib/errorCopy.ts` and `readApiError.ts` (tolerates the old body, the 422 shape, a non-JSON body; ignores a 404's body); unit tests including: every code has copy, the 404 copy is the same for any input, unknown falls back by status
- [x] `voiceCopy.test.ts`: scans `lib/*Copy.ts` and JSX text for rule 4's words (attendees, event, leverage, utilize, reach out, community, engage, action required, touch base, circle back, connect, successfully, "awesome!", "amazing!") with a small allowlist, failing with file and word; run it over the current tree and fix or allowlist what it finds (record each)
- [x] `docs/voice-and-copy.md`: error and toast patterns added, the "Not enforced yet" section replaced by what the test checks
- [x] `/limited-surface`: record that M1 to M6 add no mutating route, email or paid call (no new policy)
- [x] **Prove the tests can fail:** add a banned word to a copy module → the voice test fails naming it; give a code no copy → the `errorCopy` test fails
- [x] Commit: `feat: add API error codes, the error copy table and a voice test (M1)`

**Journeys that change:** none (nothing is mounted). **Deployable:** yes.

**Testing notes:**

- **What and how:** unit tests in node (shared +6, web +26): the code list, the error copy table (every code has a voiced line, no banned words, the 404 line is the same for any id), the response reader (old shapes read by status, a 404 ignores its body) and the voice scan over copy modules, screens and components. Proved to fail: a banned word in a copy module and in JSX, and a code with no copy.
- **Deferred:** nothing is mounted yet; routes and controls adopt it from M2.
- **Run:** `pnpm --filter @brunchsters/shared exec vitest run apiError`; `pnpm --filter @brunchsters/web exec vitest run src/lib/errorCopy src/lib/readApiError src/lib/voiceCopy`.

---

## M2 — The store, the toast host, and RSVP end to end

- [x] `apiError()` response helper (statuses allowed per code); migrate the `rsvp` route and its test to `{ error: { code, message } }`; real and made-up ids give the same code and body
- [x] `mutationsSlice` + `runMutation` + `useMutation`; thunk tests for success, non-2xx with a code, old shape, 429 (facts kept), 401, network, `condition` on a pending key, a late `requestId` ignored, release on unmount
- [x] `toastsSlice` (cap 3, de-duplication, dismiss); reducer tests; `makeStore` and `RootState` updated
- [x] `ToastHost` mounted in the `(authenticated)` layout; tokens; no new contrast pair needed (the toast reuses fg on accent-soft, fg on danger-soft and mint-fg on mint, all already in `tokenContrast.test.ts`); reduced motion; phone placement at the bottom of the window above the safe-area inset (`/ui-screen`; nothing else is fixed or sticky, so no bar to clear)
- [x] `RsvpControl` on `useMutation` (toast on failure, a success toast only if `/ui-screen` finds the change too subtle); its roles and names unchanged
- [x] Journeys: **T1** (RSVP failure toast, control restored, second tap works) and **T2** (status region, no focus move, 4 s / 8 s, hover pause, dismiss, reduced motion), the RSVP case in `brunch-page.spec.ts` edited; T1 and T2 in the `mobile` project; axe with a toast open (D2)
- [x] **Prove the tests can fail:** the control back on its generic string → T1 fails; the host moving focus → T2 fails; the thunk without `condition` → its test fails
- [x] Commit: `feat: add the shared mutation thunk and toasts, starting with RSVP (M2)`

**Accessible names changed:** the RSVP error line (`role="alert"` becomes a toast in the polite `status` region); new "Dismiss" button. **Journeys that change:** `brunch-page` (RSVP failure), new `feedback.spec.ts`. **Deployable:** yes.

**Testing notes:**

- **What and how:** thunk tests (12: success, each failure kind, double tap, late result) and toast queue tests (11), the RSVP route's codes, journeys **T1** and **T2** (P6 edited); production-build e2e 259 passed, 2 skipped; `feedback.spec` 72 of 72 over 4 runs. Proved to fail: 6 mutations (the old string, focus stolen, the hold removed, the route's code, the double-tap guard, de-duplication).
- **Fixed on the way:** a disabled button drops keyboard focus (now `aria-disabled`); Zod in the browser trips the CSP (the reader parses by hand).
- **Deferred:** the signed-out redirect (M5, T4); the other controls (M3, M4).
- **Run:** `CI=true pnpm build && cd apps/web && CI=true pnpm test:e2e feedback brunch-page`.

---

## M3 — Voting, ballots and invites

- [x] Migrate the routes these call (votes locations/times, invites send/resend/revoke, `voting/deadline`, `voting/close`) to coded errors; tests assert codes
- [x] `ballotsSlice` words failures from the code (`SAVE_FAILED_MESSAGE` goes); rollback, `requestId` and release rules unchanged; thunk tests updated; ballot failure stays inline
- [x] `InvitePanel` (send, resend, revoke) and `VotingControls` (deadline, close) on `useMutation`; the 429 facts feed `useWait.start` exactly as today, and `onBudgetRefused` still holds the send button; copy link keeps its own `useState` flag and gets a success toast
- [x] **T3** (a 429 on a control with no wait surface toasts and stays enabled; the invite panel's wait is still inline and unchanged); **T7** (the host removes an option while a vote saves: inline error in voice, option gone); F1, `redux-ui-state` and the invite and limits journeys edited to the new wording
- [x] **Prove the tests can fail:** ballot thunk back on the constant → F1 and `redux-ui-state` fail; a 429 mapped to a toast on the invite panel → the limits journey fails
- [x] Commit: `feat: move ballots, invites and voting controls onto the shared thunk (M3)`

**Accessible names changed:** the ballot, invite and voting error lines. **Journeys that change:** F1, `redux-ui-state`, the L-series invite journeys, `manage-options` (voting deadline). **Deployable:** yes.

**Testing notes:**

- **What and how:** ballot codes and `ownsWait` in unit tests (web 645), about 52 route-branch code assertions, journeys **T3, T7, T10, T11** (F1, R3, R4, L4, H2, H8 edited); e2e 265 passed, 2 skipped; feedback journeys 240 of 240 over 10 runs. Proved to fail: 5 mutations (ballot code mapping, `ownsWait`, send failure placement, stale-page refresh, a route's code).
- **Fixed on the way:** a "never toasted" journey that used a retrying `toHaveCount(0)` passed with the behavior broken (now one non-retrying look; rule in `apps/web/CLAUDE.md`); a toast slide-in made a layout check flake.
- **Deferred:** the other seven controls and the route guard (M4); the signed-out redirect (M5).
- **Run:** `pnpm --filter @brunchsters/web exec vitest run src/store src/app/api`.

---

## M4 — The remaining controls, and the guards

- [x] Migrate the routes (confirm, locations/times add and remove, suggestions and the three review routes, `cancel`, `reinstate`, `hidden`, `[id]` delete, places) to coded errors; the old shape disappears from every route a control calls
- [x] `SuggestionsPanel`, `OptionSuggestionControl`, `OptionManager`, `OptionSuggestionReview`, `ConfirmControl`, `EndOfTheRoad` (dialog errors stay inside the dialog), `HideControl` on `useMutation`; each keeps its roles, names and waits; `EndOfTheRoad`'s 409 delete wait is kept
- [x] **Guards on:** `apiErrors.test.ts` (every route under `app/api/v1` returns a coded error, with named exemptions) and an ESLint rule (or scanning test) that fails a component that calls `fetch` for a mutation; the failure messages say what to do
- [x] **T5** (a real and a made-up brunch give identical copy; the API-authorization journey gains the code assertion); `same-person`, `failure-paths` (remove location/time), `manage-options` (confirm) edited
- [x] `apps/web/CLAUDE.md` State recipe rewritten for the new pattern; "Limits" line updated; root `CLAUDE.md` error-body rule
- [x] **Prove the tests can fail:** a route returning `{ error: 'x' }` → the scanning test fails naming it; a component with a bare `fetch` → the lint rule fails; a route answering a member's 403 for an outsider → T5 fails
- [x] Commit: `feat: move the remaining controls onto the shared thunk and enforce coded errors (M4)`

**Accessible names changed:** the error lines of the remaining controls (about a dozen strings). **Journeys that change:** `same-person`, `failure-paths`, `manage-options`, the API-authorization journey, the lifecycle journeys that assert a failure line. **Deployable:** yes.

**Testing notes:**

- **What and how:** every route a control calls answers with its code (an assertion per error branch), `apiErrors.test.ts` (a route or the middleware answering the old way fails) and `noBareFetch.test.ts`, journeys **T12 to T15** plus the API-authorization journey (every refusal's code; an outsider's answer equal to a made-up id's) and F3, same-person, manage-options edited; web 657 unit tests, e2e 270 passed, 2 skipped. Proved to fail: 7 mutations (inline lines removed, the dialog's error, remove and approve failures shown nowhere, Hide's result, a bare `fetch`, an old-shape route).
- **Fixed on the way:** the auth middleware's signed-out 401 was still the old shape (the journey caught it); an axe race on the success toast.
- **Deferred:** the wizard's create route and invite response, and the place search (M5); skeletons (M6).
- **Run:** `pnpm --filter @brunchsters/web exec vitest run apiErrors noBareFetch src/app/api`.

---

## M5 — The wizard and place search

- [x] `createBrunch` returns `{ id, invitesFailed }`; thunk tests for ok, a 429 (not a failure), a 500 and a rejected request; the flag lives in the `notices` entry and is released once shown
- [x] `InvitePanel` shows the persistent note when it is set; copy in `errorCopy` (`/ui-screen`, phone included)
- [x] `PlaceSearchInput`: abort on cleanup, ignore an aborted request, guard `selectPlace`; it still reads a 429
- [x] `useMutation` handles `signed_out`: the hook sends the person to `/sign-in?callbackUrl=<this page>` (deferred from M2, where it could not be proved; an explicit redirect rather than `router.refresh()`, see plan.md)
- [x] **T4** (a 401 landing on sign-in with the callback; the offline half is already in T1), **T6** (invites 500 → brunch reached, note shown, sending again clears it), **T8** (delayed first search response vs a fast second)
- [x] **Prove the tests can fail:** the wizard ignoring the response again → T6 fails; the abort and guard removed → T8 fails
- [x] Commit: `fix: surface a failed invite batch after create and ignore stale place-search responses (M5)`

**Accessible names changed:** the new note's text (a `status`); no control renamed. **Journeys that change:** the wizard journeys (create with invites). **Deployable:** yes.

**Testing notes:**

- **What and how:** the wizard thunk (`invitesFailed` for a rejected request, a 500, a 409; not for a 429 or an accepted batch) and `noticesSlice` in unit tests (web 664), journeys **T4, T6, T8** (F2 edited); e2e 275 passed, 2 skipped; 156 of 156 over 4 runs. Proved to fail: 5 mutations (the ignored invite response, the stale-search guard, the sign-in redirect, a silent search failure, the notice never cleared).
- **Fixed on the way:** `clearCookies()` does not end a session while a prefetch is in flight (T4 waits first); the place search failed without a word; a signed-out refusal redirects explicitly rather than refreshing.
- **Deferred:** skeletons (M6); the sign-in page's wording (later added in the review).
- **Run:** `pnpm --filter @brunchsters/web exec vitest run src/store apiErrors noBareFetch`; `CI=true pnpm build && cd apps/web && CI=true pnpm test:e2e feedback failure-paths`.

---

## M6 — Skeletons (deferred) and the docs close

The spike ran first, as planned, and changed the milestone: loading skeletons are deferred, and M6 closes the spec's docs.

- [x] **Spike first:** on a production build, an outsider and a made-up id were requested for the brunch and manage pages with and without a `loading.tsx`. Without it: **404**, identical bodies (the baseline). With a `loading.tsx` over the brunch segment: **200** for both (bodies still identical), so a not-found page answers as a success. The fallback (a `Suspense` boundary after the membership check, so `notFound()`/`forbidden()` run before anything streams) keeps 404 and 403.
- [x] Built the fallback to find out what it costs: a `Skeleton` primitive (`aria-hidden` blocks inside a `role="status"` `aria-busy` region with one visually hidden "Loading"), page-shaped placeholders for the dashboard (`loading.tsx`), the brunch page and the manage page (a `Suspense` body), tuned against the real page's layout; journeys: the status guard (404, 404, 403, 200 with identical bodies), the placeholder labelled and busy while the page arrives (a throttled download), and axe on it in light and dark; all passed.
- [x] **Measured the cost, on a production build:** the brunch page's first checkbox was owned by React about **45 ms after `load` without a boundary and about 330 ms after with one**. A tap in that window is lost, and about ten journeys that click right after `load` failed consistently (V1, R3, R4, V6, L1b, E6: the ballots, the dashboard's Hide eyes, the approvals), including 10 of 12 repeats of V1 alone.
- [x] **Decision (owner, 2026-10-25): defer skeletons.** The attempt was not kept (the branch was deleted on 2026-10-25: the finding, not the code, is what lasts); the `BACKLOG` entry says what would settle it.
- [x] Docs: `spec.md` (status, Outcome, the skeleton criteria and journey T9 struck, open question answered), ADR 0016 (decision 7 and an addendum), ADR 0011 pointer, BACKLOG (roadmap item 3 done, Redux follow-ups (1) and (2) done, "Silent failures" and the stale place search closed, the session item partly done, "Loading skeletons" added), PLANNING §16 row, `apps/web/CLAUDE.md` voice line, the `ui-screen` and `spec-grill` skills.
- [x] Commit: `docs: close spec 0014 and defer loading skeletons (M6)`

**Accessible names changed:** none. **Journeys that change:** none (T9 is not shipped). **Deployable:** yes (no code changes in this milestone).

**Testing notes:**

- **What and how:** the spike on a production build: an outsider and a made-up id get 404 (identical bodies) without a `loading.tsx` and **200** with one; a `Suspense` boundary after the membership check keeps 404 and 403, and its journeys passed (status guard, labelled busy placeholder, axe in light and dark). Measured: the brunch page's first checkbox hydrates about **45 ms** after `load` without a boundary and about **330 ms** with one, and about ten journeys failed consistently with it.
- **Decision:** skeletons deferred (BACKLOG "Loading skeletons"); the attempt was not kept. No code in this milestone.
- **Final verification of the branch (as of M6):** typecheck and lint clean; web 664, core 721, shared 54, database 1; production-build e2e 275 passed, 2 skipped; audit clean. The pre-merge review's follow-ups are in `spec.md` "Outcome".
