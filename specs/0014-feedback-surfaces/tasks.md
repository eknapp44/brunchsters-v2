# Tasks 0014 — Feedback Surfaces

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

- **What was tested:** the code list (every code has a 4xx/5xx status and a snake_case name; `network` is not a route code; `isApiErrorCode` refuses inherited keys such as `toString`; each code is allowed only with its own statuses; `codeForStatus` gives the general code for every status). `errorCopy`: every route code and `network` has a line, no line for an unknown code, the 404 line is the same whatever else it is given and says nothing about brunches, a 429 is worded from its wait when it has one (the resend line) and generically when not, no line contains "failed", "error", "invalid", "unable" or "successfully", none promises "we'll try again". `readApiError`: reads a coded body; reads a 429 as its wait; falls back by status for the old shapes (`{ error: 'text' }`, the 422 `errors` list), a non-JSON page and an empty body; ignores an unknown code and a code sent with the wrong status; says `not_found` for every 404 whatever the body (except the member-only `option_gone`); never takes its words from the body. The voice test reads every string literal, template and JSX text in `lib/*Copy.ts`, `app/**/*.tsx` and `components/**/*.tsx` (comments, identifiers and imports are not read) and the detector itself is tested (flags each rule-4 word in a string, a template and JSX text; whole words only; the allowlist skips one whole string and only that string).
- **How:** unit tests in node, nothing mocked (shared +6 tests in 1 file; web +26 in 3 files: 614 web tests in all). `pnpm typecheck` and `pnpm lint` clean; `pnpm test` shared 54, core 721, web 614, database 1 (the `failed {` lines in the web output are logged errors from tests that expect them). The voice test passed on the existing tree on its first run: no banned word is read anywhere today, so `ALLOWED_STRINGS` starts empty and nothing was reworded. **Mutation checks** (each reverted and confirmed with `git status`): (1) "community" put into `lifecycleCopy.ts` → the voice test failed naming `lib/lifecycleCopy.ts:23`; (2) "Connect with us" put into `RsvpControl.tsx` JSX text → it failed naming `RsvpControl.tsx:55`; (3) the `internal` line deleted from `errorCopy.ts` → the "has a line for every code" test failed.
- **E2E journeys:** none needed. Nothing is mounted or changed for a person: no control, route, rule or accessible name moves, so the e2e suite was not run (it runs from M2, the first milestone that changes a screen).
- **/limited-surface:** answered by reading, not by walking the recipe (nothing to add): M1 adds no mutating route (so no `enforceWriteLimit`), no email event (so no `emailBudgets.test.ts` decision) and no paid call (so no `routeLimits.test.ts` entry). The same holds for M2 to M6 as specced; a milestone that adds a route reopens it.
- **Findings:** the routes' real cases collapse to 22 codes (the table is in `plan.md` "Copy table and codes"); two points differ from the spec's first draft and are written there: the reader parses with Zod in the web app (shared holds only codes and the type), and the only 404 body it believes is `option_gone`. "Brunch is not open for suggestions/changes/voting" is `brunch_not_active` (a draft or confirmed brunch), which is not `brunch_called_off`.
- **What's deferred:** no route returns a code yet and no control reads one (M2 onward); `network` and `signed_out` are made by the thunk in M2. The voice test does not read CSS or e2e text, which a person never reads from source.
- **How to run it:** `pnpm --filter @brunchsters/shared exec vitest run apiError`; `pnpm --filter @brunchsters/web exec vitest run src/lib/errorCopy src/lib/readApiError src/lib/voiceCopy`.

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

- **What was tested:** `apiError()` (status and body; every status a code is listed with; refuses a code with a status it is not listed with). The RSVP route: each branch answers its code (signed_out, not_found, invalid, brunch_called_off, internal) and an outsider and a made-up id get the same status, code and body. `runMutation` (12 tests): sends the request as given (no body, no content type for a bodiless one), pending while out, clears on success, keeps the code a route sent, reads an old-shape body by status, keeps the facts of a 429, says `network` when fetch rejects, ignores a second tap on a key in flight, lets different keys run together, allows a new tap after a failure and clears the old failure while it runs, and ignores a late result after the entry was released or the key restarted. `toastsSlice` (11 tests): success words, none for a success without words, failure words from the code (a secret server message never reaches the store), `network`, a 429 as `info` with its wait, nothing for an inline failure, a repeat replaces instead of stacking, different results stay apart, cap of three drops the oldest, dismiss removes one, and a result after unmount still toasts. Journeys **T1** (stubbed 500 → voiced toast, never "Failed to", buttons as they were, the next tap works; a **real** called-off refusal from the server reads as its code; offline says so) and **T2** (a polite status region from first paint, empty; focus stays on the tapped button; a success goes by itself; it stays while it has focus and goes on Dismiss; reduced motion → `animation-name: none`; fits the window with a 44px Dismiss and no sideways scroll; axe in light and dark with a success and an error toast up), and P6 in `brunch-page.spec.ts` edited to the toast.
- **How:** unit tests in node with a fake `fetch` (web +28: 642 in all; shared 54, core 721, database 1); Playwright journeys on a production build (`CI=true pnpm build && CI=true pnpm test:e2e`): **259 passed, 2 skipped** (the same 2 as before). `feedback.spec.ts` ran 4 times over with no retries: 72 of 72. T1 and T2 also run in the `mobile` project (added to its list). `pnpm typecheck` and `pnpm lint` clean. **Mutation checks** (each reverted and confirmed with `git status`): (1) the `internal` line put back to "Failed to update RSVP" → T1 and the edited P6 failed; (2) the toast's dismiss button given `autoFocus` → T2's focus test failed; (3) the toast's `onFocus` hold removed → T2's stays-while-focused test failed; (4) the RSVP route sending `brunch_changed` for a called-off brunch → T1's real-refusal journey failed; (5) `runMutation` without its `condition` → the in-flight test failed; (6) the toast queue without its de-duplication → the "replaces a repeat" test failed.
- **Findings (two, both fixed here):** (1) **A disabled button drops keyboard focus**: the RSVP buttons were `disabled` while a save was out, so pressing one with the keyboard moved focus to the page (T2 caught it). They are `aria-disabled` now, and the recipe says so. (2) **Zod in a browser bundle breaks the CSP**: `readApiError` first imported Zod, whose v4 build probes for `eval` with `new Function`; the enforced policy reported it on every signed-in page and journey S3 failed. `readApiError` reads the body by hand now, with a comment, and the web CLAUDE.md says never to import Zod in client code. Also seen: a button measured halfway through its color transition fails axe (the known gotcha), so the axe journey waits for animations to settle.
- **Phone / look:** reviewed `feedback/toast-error` and `toast-success` (light and dark, desktop, tablet, phone; added to `review.spec.ts`). The toast is full width on a phone, wraps its text, has a 44px Dismiss, and is clear of the bottom edge by the safe-area inset. Nothing else in the app is fixed or sticky, so there is no bottom bar or wizard footer to avoid (the spec's first draft assumed there was; corrected in the spec and plan). Full-page screenshots park a fixed element mid-page; the real position is asserted by the T2 layout journey. The screenshot run needs the dev server (CI mode's CSP blocks the tool's injected style).
- **What's deferred:** the 401 behavior (`signed_out` toast plus a `router.refresh()` into the sign-in redirect) is made in M5 with journey T4, where it can be proved; until then a 401 toasts "You've been signed out" and the page stays. A success toast for the other controls is decided per control as they migrate (M3, M4). The remaining ~28 routes still send the old body; the client reads them by status.
- **How to run it:** `pnpm --filter @brunchsters/web exec vitest run src/store src/lib/apiErrorResponse "rsvp/route"`; `CI=true pnpm build && cd apps/web && CI=true pnpm test:e2e feedback brunch-page`.

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

- **What was tested:** seven routes now answer in the coded shape (votes locations/times, invites send, resend and revoke, voting deadline and close, and the two limiter answers): each branch of each route has a code assertion (about 52, one per error branch of the route tests, via `errorCodeOf`), the 429 body carries `error: { code: 'rate_limited' }` beside `policy` and `retryAfterSeconds`, the 503 is `unavailable`. New code `not_a_vote` (with its copy). `ballotsSlice` keeps the code, not text: a refused save keeps `voting_closed`, a network failure `network`, an unknown failure `internal`; rollback, `requestId` and the empty-ballot rules are unchanged. `toastsSlice`: a 429 on a control that owns its wait is left to it (and the entry still keeps the facts), every other failure of such a control still toasts, and a toast that is not a request's answer (`toastShown`) de-duplicates by key. Journeys: **T3** (a 429 on RSVP toasts "Slow down a sec" and stays usable; a refused resend is the row's own inline wait and never also a toast, and the stub was really hit), **T7** (the host removes a place while the voter is looking: the vote is refused in voice inline, the box rolls back, and the page is asked again so the removed place is gone), **T10** (a failed send is inline and the typed address stays, then sending again works; a failed revoke toasts and the invite stays; a resend toasts "Sent again."; copy toasts "Link copied." and, with the clipboard refused, says it did not copy), **T11** (a saved deadline toasts; a refused one is inline beside the field; a failed close toasts and the panel stays open), and F1 (the real "host closed voting" refusal now reads "Voting's closed on this one."), R3, R4, L4, H2 and H8 edited.
- **How:** unit tests in node (web 645: +3 over M2, plus about 52 new code assertions inside the existing route tests; core and shared unchanged) and Playwright on a production build: **265 passed, 2 skipped** (the same 2); `feedback.spec.ts` and `feedback-controls.spec.ts` ran 10 times over with no retries: 240 of 240. `pnpm typecheck` and `pnpm lint` clean. **Mutation checks** (each reverted, confirmed with `cmp` against a copy): (1) the ballot thunk always rejecting `internal` → F1 (real closed-voting refusal) and T7 failed; (2) the resend row without `ownsWait` → T3's resend journey failed (a toast appeared next to the inline wait); (3) a failed send moved to `failure: 'toast'` → T10 failed; (4) `useBallot` no longer asking the page again after a stale-page refusal → T7 failed; (5) the votes route sending `brunch_changed` for a closed ballot → its unit test failed.
- **Findings:** (1) **My first T3 resend journey could not fail**: it asserted `toHaveCount(0)` on the toast region, which retries, so it waited for the 4-second toast to time out and passed with the behavior broken (the mutation check caught it; the journey now takes one non-retrying look after a settle, and the rule is in `apps/web/CLAUDE.md`). The same trap would have hidden a missing `ownsWait` in T10. (2) The toast's slide-in left the T2 layout check measuring a fractional box (43.99994px for a 44px button) about 1 run in 70; it waits for the animation and rounds. (3) A page that is out of date is now refreshed after a ballot refusal that says so (an option removed, voting closed, called off), so the line "have a look at what is left" is true; the other failures leave the page alone.
- **What's deferred:** the other seven controls and their routes (M4); the scanning test that fails on an uncoded route (M4, when every route a control calls is migrated). `signed_out` still has no refresh into sign-in (M5, T4). Resend and Revoke on separate rows can run together now (per-key status, not one pending id per panel); nothing in the server needs them to be exclusive.
- **How to run it:** `pnpm --filter @brunchsters/web exec vitest run src/store src/app/api`; `CI=true pnpm build && cd apps/web && CI=true pnpm test:e2e feedback failure-paths redux-ui-state`.

---

## M4 — The remaining controls, and the guards

- [ ] Migrate the routes (confirm, locations/times add and remove, suggestions and the three review routes, `cancel`, `reinstate`, `hidden`, `[id]` delete, places) to coded errors; the old shape disappears from every route a control calls
- [ ] `SuggestionsPanel`, `OptionSuggestionControl`, `OptionManager`, `OptionSuggestionReview`, `ConfirmControl`, `EndOfTheRoad` (dialog errors stay inside the dialog), `HideControl` on `useMutation`; each keeps its roles, names and waits; `EndOfTheRoad`'s 409 delete wait is kept
- [ ] **Guards on:** `apiErrors.test.ts` (every route under `app/api/v1` returns a coded error, with named exemptions) and an ESLint rule (or scanning test) that fails a component that calls `fetch` for a mutation; the failure messages say what to do
- [ ] **T5** (a real and a made-up brunch give identical copy; the API-authorization journey gains the code assertion); `same-person`, `failure-paths` (remove location/time), `manage-options` (confirm) edited
- [ ] `apps/web/CLAUDE.md` State recipe rewritten for the new pattern; "Limits" line updated; root `CLAUDE.md` error-body rule
- [ ] **Prove the tests can fail:** a route returning `{ error: 'x' }` → the scanning test fails naming it; a component with a bare `fetch` → the lint rule fails; a route answering a member's 403 for an outsider → T5 fails
- [ ] Commit: `feat: move the remaining controls onto the shared thunk and enforce coded errors (M4)`

**Accessible names changed:** the error lines of the remaining controls (about a dozen strings). **Journeys that change:** `same-person`, `failure-paths`, `manage-options`, the API-authorization journey, the lifecycle journeys that assert a failure line. **Deployable:** yes.

**Testing notes:** _(fill on completion)_

---

## M5 — The wizard and place search

- [ ] `createBrunch` returns `{ id, invitesFailed }`; thunk tests for ok, a 429 (not a failure), a 500 and a rejected request; the flag lives in the `notices` entry and is released once shown
- [ ] `InvitePanel` shows the persistent note when it is set; copy in `errorCopy` (`/ui-screen`, phone included)
- [ ] `PlaceSearchInput`: abort on cleanup, ignore an aborted request, guard `selectPlace`; it still reads a 429
- [ ] `useMutation` handles `signed_out`: the toast says so and the hook calls `router.refresh()`, so the layout's own redirect sends the person to sign-in with a callback (deferred from M2, where it could not be proved)
- [ ] **T4** (a 401 landing on sign-in with the callback; the offline half is already in T1), **T6** (invites 500 → brunch reached, note shown, sending again clears it), **T8** (delayed first search response vs a fast second)
- [ ] **Prove the tests can fail:** the wizard ignoring the response again → T6 fails; the abort and guard removed → T8 fails
- [ ] Commit: `fix: surface a failed invite batch after create and ignore stale place-search responses (M5)`

**Accessible names changed:** the new note's text (a `status`); no control renamed. **Journeys that change:** the wizard journeys (create with invites). **Deployable:** yes.

**Testing notes:** _(fill on completion)_

---

## M6 — Skeletons, and the docs close

- [ ] **Spike first:** on a production build, request the brunch page as an outsider and as a made-up id with a `loading.tsx` in place; record the HTTP status and body. If a status moves to 200, switch to the fallback (a `Suspense` boundary after the membership check) and reword the criterion in `spec.md`
- [ ] `Skeleton` primitive; skeletons for the dashboard, the brunch page and the manage page, sized to the final layout (no layout shift), `aria-hidden` + `aria-busy` + hidden "Loading"; reduced motion; tokens
- [ ] **T9**; D2 (axe) gains the skeleton state in light and dark; D3 (layout) and the screenshots (`review.spec.ts`) gain it; P9, H4 and the API-authorization journey pass unmodified
- [ ] `docs/accessible-names.md` (the sweep), BACKLOG (items closed, "Live updates" kept), PLANNING §16 row, ADR 0011 pointer to 0016, `spec.md` Outcome and status, `spec-grill` and `ui-screen` skills mention the error code and toast recipe; the `docs/SETUP.md` check
- [ ] **Prove the tests can fail:** a skeleton taller than the page → the layout journey (shift) fails; a made-up id returning a different status → P9/H4 fail
- [ ] Commit: `feat: add loading skeletons and close spec 0014 (M6)`

**Accessible names changed:** none (a hidden "Loading"). **Journeys that change:** D2, D3, new T9. **Deployable:** yes.

**Testing notes:** _(fill on completion)_
