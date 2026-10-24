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

- [ ] `apiError()` response helper (statuses allowed per code); migrate the `rsvp` route and its test to `{ error: { code, message } }`; real and made-up ids give the same code and body
- [ ] `mutationsSlice` + `runMutation` + `useMutation`; thunk tests for success, non-2xx with a code, old shape, 429 (facts kept), 401, network, `condition` on a pending key, a late `requestId` ignored, release on unmount
- [ ] `toastsSlice` (cap 3, de-duplication, dismiss); reducer tests; `makeStore` and `RootState` updated
- [ ] `ToastHost` mounted in the `(authenticated)` layout; tokens; contrast pairs in `tokenContrast.test.ts`; reduced motion; phone placement above the bottom bar and the wizard footer (`/ui-screen`)
- [ ] `RsvpControl` on `useMutation` (toast on failure, a success toast only if `/ui-screen` finds the change too subtle); its roles and names unchanged
- [ ] Journeys: **T1** (RSVP failure toast, control restored, second tap works) and **T2** (status region, no focus move, 4 s / 8 s, hover pause, dismiss, reduced motion), the RSVP case in `brunch-page.spec.ts` edited; T1 and T2 in the `mobile` project; axe with a toast open (D2)
- [ ] **Prove the tests can fail:** the control back on its generic string → T1 fails; the host moving focus → T2 fails; the thunk without `condition` → its test fails
- [ ] Commit: `feat: add the shared mutation thunk and toasts, starting with RSVP (M2)`

**Accessible names changed:** the RSVP error line (`role="alert"` becomes a toast in the polite `status` region); new "Dismiss" button. **Journeys that change:** `brunch-page` (RSVP failure), new `feedback.spec.ts`. **Deployable:** yes.

**Testing notes:** _(fill on completion)_

---

## M3 — Voting, ballots and invites

- [ ] Migrate the routes these call (votes locations/times, invites send/resend/revoke, `voting/deadline`, `voting/close`) to coded errors; tests assert codes
- [ ] `ballotsSlice` words failures from the code (`SAVE_FAILED_MESSAGE` goes); rollback, `requestId` and release rules unchanged; thunk tests updated; ballot failure stays inline
- [ ] `InvitePanel` (send, resend, revoke) and `VotingControls` (deadline, close) on `useMutation`; the 429 facts feed `useWait.start` exactly as today, and `onBudgetRefused` still holds the send button; copy link keeps its own `useState` flag and gets a success toast
- [ ] **T3** (a 429 on a control with no wait surface toasts and stays enabled; the invite panel's wait is still inline and unchanged); **T7** (the host removes an option while a vote saves: inline error in voice, option gone); F1, `redux-ui-state` and the invite and limits journeys edited to the new wording
- [ ] **Prove the tests can fail:** ballot thunk back on the constant → F1 and `redux-ui-state` fail; a 429 mapped to a toast on the invite panel → the limits journey fails
- [ ] Commit: `feat: move ballots, invites and voting controls onto the shared thunk (M3)`

**Accessible names changed:** the ballot, invite and voting error lines. **Journeys that change:** F1, `redux-ui-state`, the L-series invite journeys, `manage-options` (voting deadline). **Deployable:** yes.

**Testing notes:** _(fill on completion)_

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
- [ ] **T4** (offline, and a 401 landing on sign-in with the callback), **T6** (invites 500 → brunch reached, note shown, sending again clears it), **T8** (delayed first search response vs a fast second)
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
