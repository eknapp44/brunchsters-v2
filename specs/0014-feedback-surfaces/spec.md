# Spec 0014 — Feedback Surfaces

**Status:** Written 2026-10-24 (not started)  
**Branch:** `feat/0014-feedback-surfaces`  
**PLANNING.md ref:** §16 roadmap table, row 0014; `docs/BACKLOG.md` "Redux follow-ups" (1), (2) and "Silent failures to surface", "Place search can show stale results"  
**ADRs:** [0016 — Feedback surfaces](../../docs/adrs/0016-feedback-surfaces.md); builds on [0011](../../docs/adrs/0011-redux-toolkit-for-client-ui-state.md) (the store), [0013](../../docs/adrs/0013-rate-limits-in-postgres.md) (limits and waits), [0015](../../docs/adrs/0015-brunch-lifecycle.md) (the lifecycle controls)  
**Builds on:** [spec 0010](../0010-redux-ui-state/spec.md), [spec 0012](../0012-security-hardening/spec.md), [spec 0013](../0013-brunch-lifecycle/spec.md); copy rules in `docs/voice-and-copy.md`

---

## What

When something goes wrong in the app today, a person sees "Failed to update RSVP", or nothing. This spec gives every action one way to answer back, in the app's voice:

- **One shared mutation thunk** with per-key status for the ten controls that each own a `submitting`/`error`/`fetch`/`router.refresh()`.
- **Error codes** from the routes, worded by the client from one table (no server string is ever shown).
- **Toasts** for one-tap results and a visible, accessible error surface; inline stays for what a person must fix or wait out.
- **Loading skeletons** for the brunch page, the manage page and the dashboard.
- **The wizard** stops ignoring the invite request's response.
- **The place-search stale-response bug** is fixed.
- **A banned-word test** enforces the voice rules, because this spec writes the most new copy the app has.

### Grounded in the current code (verified 2026-10-24)

- **Ten components** own their request state: `RsvpControl`, `InvitePanel`, `SuggestionsPanel`, `OptionSuggestionControl`, `OptionManager`, `OptionSuggestionReview`, `VotingControls`, `ConfirmControl`, `EndOfTheRoad`, `HideControl` (`grep 'router.refresh'`, `grep 'Failed to'`). They contain about twenty distinct generic strings, all inline in the components. `ballotsSlice` (`SAVE_FAILED_MESSAGE`) and `wizardSlice` (`CREATE_FAILED_MESSAGE`) do the same inside thunks.
- **Routes return real messages, in two shapes.** `{ error: string }` almost everywhere (for example `cancel/route.ts`: "Only the host can call it off", "This brunch was already called off"); `422 { errors: issues }` for a Zod failure (`invites/route.ts`, `confirm/route.ts`). There are about 200 `NextResponse.json` error calls in 28 route files. `rateLimitedResponse` has its own body (`policy`, `retryAfterSeconds`) and a `Retry-After` header; the limiter being down is `503 { error: 'Temporarily unavailable' }`.
- **404s already look the same.** A bad id and an outsider both get `404 { error: 'Brunch not found' }`; the order of checks is covered by the API-authorization journey. The client has never shown these strings.
- **Four controls read a 429:** `InvitePanel` (send and resend), the suggestion approval, `PlaceSearchInput`, `EndOfTheRoad`. Every other mutating route spends `enforceWriteLimit` too, so a 429 on an RSVP shows "Failed to update RSVP".
- **The wizard drops the invite response** (`wizardSlice.ts`, the `await extra.fetch(.../invites)` inside a `try` with an empty `catch`; a non-2xx is not even looked at). A refused batch recovers through the brunch page's own counters (spec 0012); other failures are silent.
- **`PlaceSearchInput`'s search effect clears its timer but not the request** (`useEffect` cleanup is `clearTimeout` only), so a slow earlier response can overwrite the newer one's predictions. `selectPlace` has the same shape (a late details response after a newer query).
- **No `loading.tsx`, no `Suspense`, no toast.** `src/app` has `error.tsx` and `not-found.tsx` only. `layout.tsx` for `(authenticated)` holds the `StoreProvider`.
- **Journeys that assert the generic strings** (edited in this spec, each proved to fail without the new behavior): `failure-paths.spec.ts` (F1: "Failed to save your vote"; the remove-location/time cases), `brunch-page.spec.ts` ("Failed to update RSVP"), `same-person.spec.ts` ("Failed to suggest invitee"), `redux-ui-state.spec.ts` (`SAVE_FAILED`), `manage-options.spec.ts` ("Failed to confirm the brunch", "Failed"). The grep at each milestone's start wins over this list.
- **A 401 mid-use** shows the generic error (`docs/BACKLOG.md` "Security and session follow-ups" (4)).

### Principles

- **The client can only show what its table lists.** Routes send codes; the client words them. A message cannot leak whether an id exists, because no server string reaches the screen.
- **Toast = it happened, move on. Inline = yours to fix or wait out.** A wait (429, held countdown) is never a toast.
- **No promise the app does not keep** (voice rule 7): no "we'll try again", no retry button; tapping again is the retry.
- **Business rules stay on the server**; the store holds request status and the toast queue, no copies of server data (ADR 0011).
- **A control keeps its accessible name, role and place**; only the error line changes (journeys find things by role and name).

---

## The error contract

`{ error: { code, message } }` on every failure of a route that a control calls. Codes live in `packages/shared` (one list, one type), the table below is the starting set (the M1 test pins whatever the list ends as):

| Code                                                                                                                              | From                                                      | A person reads (draft; final wording in `errorCopy.ts`, M1)         |
| --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------- |
| `signed_out`                                                                                                                      | 401                                                       | "You're signed out. Sign back in and give it another go."           |
| `forbidden`                                                                                                                       | 403 `not_host`                                            | "That one's the host's."                                            |
| `not_found`                                                                                                                       | 404 (any)                                                 | "This table's empty." (same for a real and a made-up id)            |
| `brunch_called_off`                                                                                                               | 409                                                       | "This one's been called off, so it can't change."                   |
| `brunch_changed`                                                                                                                  | 409 `invalid_transition`                                  | "Something just changed on this brunch. Take a look and try again." |
| `rate_limited`                                                                                                                    | 429 (body `policy`, `retryAfterSeconds`; unchanged shape) | `limitedMessage` as today                                           |
| `invalid`                                                                                                                         | 400, 422                                                  | field-level text from the form, else "That didn't look right."      |
| specific ones a person can act on (already-confirmed, nothing to confirm, unknown option, place lookup unavailable, and the like) | 409, 404, 502                                             | one line each, named in M1 from the routes' real cases              |
| `unavailable`                                                                                                                     | 502, 503                                                  | "Our end hiccuped. Give it a minute."                               |
| `internal`                                                                                                                        | 500                                                       | "Something went sideways on our end."                               |
| `network` _(client only)_                                                                                                         | `fetch` rejected                                          | "Looks like you're offline."                                        |

An unknown code, or a body in the old shape, gets one generic voiced line chosen by status. The rate-limit body keeps its facts; `readRateLimit` stays the reader.

## User flows

1. **Tap with a toast outcome** (RSVP, remove an option, hide, bring it back, copy link): the control disables while the request runs; on success a short toast ("Locked in") appears where the page change is subtle; on failure a toast says what happened and the control is as it was.
2. **Tap with an inline outcome** (a failed vote, a form field, anything inside a dialog): the control rolls back and the error sits beside it as today (`role="alert"`), now in voice.
3. **A 429**: a control with a wait surface (invites, approval, call-it-off, delete, place search) behaves exactly as in spec 0012; every other control shows "Slow down a sec, then try again." as a toast and stays enabled.
4. **Offline or signed out**: `network` toast; a 401 toasts "signed out" and the page refreshes into the layout's sign-in redirect.
5. **Create a brunch with invites that fail** (not 429): the brunch is created, the host lands on it, and the Invites panel shows a persistent note to send them again.
6. **Open a page**: a skeleton the same size as the page shows until it is ready.
7. **Type in place search**: only the newest query's results are ever shown.

---

## Acceptance Criteria

### Shared and voice (M1)

- [ ] `packages/shared`: the error-code list and its type; a request-error type (`ApiError`) for the client
- [ ] `apps/web/src/lib/errorCopy.ts` (pure, unit-tested): every code has voiced copy; unknown code and old shape fall back by status; the 404 copy is identical for any id
- [ ] A banned-word test scans `lib/*Copy.ts` and JSX text for rule 4's words, with a small allowlist, and fails naming the file and word
- [ ] `docs/voice-and-copy.md` gains the error and toast patterns (and drops "Not enforced yet")
- [ ] `/limited-surface` run: no new mutating route, no new email, no new paid call, so no new policy (record the answer)

### Store (M2)

- [ ] `mutationsSlice` (per-key `{ status, requestId, code }`), `runMutation` thunk (`createAppAsyncThunk`, `fetch` from `extra`, `condition` on a key in flight), `useMutation(key)` hook; thunk tests for each failure path (non-2xx with a code, old shape, 429, 401, network, late result ignored)
- [ ] `toastsSlice` (queue capped at 3, de-duplicated by key, dismiss) fed by `runMutation`'s cases from `meta.arg`; selectors beside the slice
- [ ] The toast host: one polite `role="status"` region in the `(authenticated)` layout, no focus change, 4 s / 8 s, pause on hover and focus, dismiss button, reduced motion; tokens only (and `tokenContrast.test.ts` for its colors)

### API routes (M2 to M4, each with its controls)

- [ ] Each route a control calls returns `{ error: { code, message } }` for every failure; its test asserts the code; unauthorized, not-found and not-host keep their statuses
- [ ] A scanning test fails, naming the file, when a route under `app/api/v1` returns an error without a code (exemptions with a reason: the rate-limit and the token-redemption bodies, if they stay different)
- [ ] The API-authorization journey still shows real and made-up ids indistinguishable (same status, same code, same body)

### Controls (M2 to M4)

- [ ] All ten controls use `useMutation`; none owns a `submitting`/`error` pair or a bare `fetch`; keeping the same roles, names, `aria-disabled` waits, and `ConfirmDialog` pending rules
- [ ] `ballotsSlice` words failures from the code, not `SAVE_FAILED_MESSAGE`; rollback and `requestId` rules unchanged
- [ ] A 429 on a control with no wait surface is a toast; the four that have one are unchanged
- [ ] A lint rule (or scanning test) fails a component that calls `fetch` directly for a mutation (the recipe in `apps/web/CLAUDE.md` replaces "keep the generic error string")

### Wizard (M5)

- [ ] `createBrunch` returns `{ id, invitesFailed }`; a non-2xx or a rejected invite request (other than 429, which the page already recovers) sets it; thunk tests for ok, 429, 500 and network
- [ ] The Invites panel shows a persistent inline note when it is set (cleared when read or when an invite is sent); the host is never blocked from reaching the brunch

### Place search (M5) and skeletons (M6)

- [ ] `PlaceSearchInput` discards a response that is not the newest query's (abort on cleanup, and a guard on `selectPlace`)
- [ ] `loading.tsx` for the brunch page, the manage page and the dashboard, sized to the final layout, `aria-hidden` with a visually hidden "Loading"; the 404/403 rule holds (see Risks)

### Docs (every milestone, final in M6)

- [ ] `apps/web/CLAUDE.md` "State" and "Moving another control onto the store" replaced by the new recipe; "Limits" line about which controls read a 429 updated
- [ ] Root `CLAUDE.md`: the error-body rule in Architectural Rules; `docs/accessible-names.md`, `docs/BACKLOG.md` (items closed or re-pointed), PLANNING §16, ADR 0011 pointer to 0016, `voice-and-copy.md`, `specs/0014`'s Outcome; the `spec-grill` and `ui-screen` skills mention the error code and toast recipe

---

## E2E Journeys

New series **T** (toasts and feedback); existing ones are edited where noted.

| ID  | Who                         | Asserts                                                                                                                                                                                                                                                                                |
| --- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | one signed-in person        | Tapping RSVP with the route failing (intercepted) shows a toast in voice, the buttons return to their earlier state, nothing says "Failed to"; a second tap works. Proved to fail with the generic string back.                                                                        |
| T2  | one person                  | The toast region is a `status` that never takes focus, a toast goes away by itself, pauses on hover, and dismisses with its button; with reduced motion nothing slides.                                                                                                                |
| T3  | one person                  | A 429 on a control with no wait surface (RSVP) toasts "Slow down a sec" and leaves it enabled; the invite panel's own 429 is still an inline wait (existing journey L-series unchanged).                                                                                               |
| T4  | one person                  | Going offline (request aborted) toasts the `network` line; a 401 (expired cookie) toasts "signed out" and the refresh lands on sign-in with the callback.                                                                                                                              |
| T5  | host, outsider              | The same failing call for a real brunch an outsider cannot see and a made-up id shows identical copy (the API-authorization journey gets the code assertion too).                                                                                                                      |
| T6  | host                        | Creating a brunch with the invite request returning 500 still reaches the brunch, and the Invites panel shows the persistent note; sending again clears it. Proved to fail with the response ignored again (today's behavior).                                                         |
| T7  | two people (host, attendee) | An option the host removes while the attendee's vote is saving: the attendee's rolled-back ballot shows the inline error in voice and the removed option is gone (extends R4/R5 for the new wording).                                                                                  |
| T8  | one person                  | Place search with a delayed first response and a fast second: only the second's results show, and picking one fills the wizard from the right place. Proved to fail without the fix.                                                                                                   |
| T9  | one person                  | Navigating to the brunch page and the dashboard shows a skeleton (`Loading` hidden text, `aria-busy`), then the page with no layout shift; axe passes with the skeleton shown (D2 gains the state); a made-up id is still a 404 with the same body as an outsider's (P9/H4 unchanged). |

**Edited, not new** (names stay; the strings they assert change): F1, F3 (`failure-paths`), the RSVP, suggestion, confirm and voting-deadline cases in `brunch-page`, `same-person`, `manage-options`, `redux-ui-state`. Each is proved to fail against the old generic string.

Phone: T1, T2 and T9 run in the `mobile` project (toast at the bottom of the window and clear of its edge, safe-area, touch targets, no sideways scroll).

## Accessible names changed

**No button, link, label or heading is renamed.** The error and status lines change text (about twenty strings, the `role="alert"` / `role="status"` roles stay where they were). New: the toast region (`status`) and its dismiss button, named "Dismiss"; the skeleton's hidden "Loading". Each milestone lists the lines it changes, and `docs/accessible-names.md` gets one entry for the sweep.

## Phone

A toast sits at the bottom of the window above the safe-area inset (nothing else in the app is fixed or sticky, so there is no bar or footer to clear), is at most the viewport width with wrapped text, and its dismiss button is at least 44px. Skeletons leave out nothing a person needs: they only hold the shape. Nothing is hidden on a phone that is not hidden today.

## Risks

- **Streaming and `notFound()`.** `loading.tsx` streams the page, and Next may have sent a 200 before `notFound()` runs, changing the HTTP status of a 404 page (and the existing "empty error shell" gotcha, `docs/BACKLOG.md` Lifecycle deferrals (9), lives in this exact place). **M6 starts with a spike that checks the status and body of an outsider's request on a production build.** If it changes, the fallback is a `Suspense` boundary placed _after_ the membership check (the check stays outside it), with the skeleton shown for the slow part only, and the spec's skeleton criterion is reworded to say so. P9, H4 and the API-authorization journey are the guards.
- **About 28 routes change shape.** Mitigated by staging with the controls, a client that reads the old shape until the scanning test goes live, and route tests that assert codes.
- **Toast noise.** Success toasts only where the page change is subtle; the T-journeys count them.
- **A wait held across a refresh** keeps working because it is the server's (unchanged); the thunk never stores one.

## What This Spec Does Not Cover

- **Live updates** for what other people change (a poll, realtime, or a refresh on focus), and live-region announcements of vote counts, which only become honest with them: [`docs/BACKLOG.md`](../../docs/BACKLOG.md) "Live updates".
- **A retry button** on a failure (the copy promises nothing instead).
- **An offline queue or banner**; `network` is one line.
- **The host-facing "an email did not go out" signal**: the notifications spec.
- **A toast library, RTK Query, or draft persistence** (ADR 0016, 0011).
- **A new route, a new email or a new paid call**: none, so no new limit or email budget.

## Open Questions

1. Does `loading.tsx` change the status of a 404 page (Risks)? Answered by the M6 spike; the spec says what ships either way.
2. The exact list of "specific" codes: derived in M1 from the routes' real cases, not guessed here.
3. Whether a success toast helps "Hide" (the row disappears) or is redundant; decided on the screen in M4 with `/ui-screen`.
