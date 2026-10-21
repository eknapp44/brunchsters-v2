# Tasks 0011 — Design Fidelity

Seven milestones, each green on its own, **deployable**, and ending in a commit. Branch: `feat/0011-design-fidelity`, cut from `main` (no stacking). Close each milestone with `/milestone-done`, then **stop for the owner's review with that milestone's board** before the next. Every milestone runs `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`. Re-verify the "journeys that change" list of a milestone with a grep at its start; the lists below were taken from the code on 2026-10-21 and the grep wins.

**Deployable** means: no placeholder data on a page that could ship, no import of the scratch tooling, no new environment variable, nothing that needs the local machine. **Local-only** in this spec is only the tooling: `pnpm boards` (needs network for React and Babel from unpkg, and the local database) and the mockup generator (needs network for fonts). Both are developer tools, not part of the shipped app.

---

## M1 — Docs, board tooling and the shared look

- [x] Commit this spec folder, ADR 0012 (with its README index row), the `PLANNING.md` §16/§17 edits, the pointer in spec 0009's Outcome, and the four design references (`design-docs/Copy Pass.html`, `design-docs/Brunchsters Design v3.html`, `prototype/components/design-canvas.jsx`, `prototype/components/tweaks-panel.jsx`) as one docs-only commit, before any code
- [x] `apps/web/scripts/boards.ts` (TypeScript, run with `tsx`, like the other scripts) + `pnpm --filter @brunchsters/web boards`: scratch copy of `prototype/` and the v3 HTML (the two jsx files placed next to it), a static server on a free port, prototype scenes photographed with a frozen clock, matched against the app's screenshots, side-by-side boards for light and dark, desktop and phone; the server is stopped in a `finally`; `prototype/` and `design-docs/` are never written
- [x] Tokens (light and dark): wash (`--wash-a`, `--wash-b`) and the vote-bar tint (`--bar`); the butter panel and the avatar palette reuse `--accent-soft` and the `--pop-*` family (no duplicates); `tokenContrast.test.ts` pairs for each; `styleGuard.test.ts` still green
- [x] Primitives `Eyebrow`, `DateTile`, `InitialsAvatar` (+ CSS modules) and an optional decorative icon on `Badge` (the "Pill"); `@brunchsters/shared` `people.ts` (`formatPersonName`, `initialsOf`, `avatarColorIndex`) with unit tests; `Avatar` removed, the nav uses `InitialsAvatar`
- [x] Top bar on phone: initials and Sign out, the name visually hidden but still announced (already so from spec 0009); the page background gets the wash and the bar is mostly transparent over it
- [x] `docs/SETUP.md`: the `boards` command, its prerequisites, and what it writes
- [x] `apps/web/CLAUDE.md`: new "Phone", "Voice and copy" and "Derived presentation rules live in core" sections (the rules, the copy-table pointer, the emoji dial, the display mapping, the phone omissions rule), the primitives list, the initials-only rule, and the boards line under "Checking a screen"
- [x] **Prove the tests can fail:** drop one token's dark value → `tokenContrast` fails; make `formatPersonName` keep a surname → its test fails
- [x] Board: every existing screen in the new wash and top bar, light and dark, desktop and phone, for the owner's first review (`apps/web/.screenshots/board-*.png`, 36 boards)
- [x] Commit: `feat: add the board script, design-fidelity tokens and primitives (M1)`

**Journeys that change:** none edited. `pnpm test:e2e` passes unmodified (the top bar's name stays in the accessibility tree). **Names that change:** none. **Deployable:** yes (look only; one visible change: the nav shows initials, not the Google photo).

**Testing notes:**

- **What was tested:** the people helpers (`initialsOf`: two words, one word, blank, extra spaces, a leading emoji and an accented capital are not cut in half; `formatPersonName`: a member gets "First L." from the last word, a one-word name stays, a blank one becomes "Someone", the host gets the full name, a member's result never contains the surname; `avatarColorIndex`: stable for a seed, always inside the palette, and 200 seeds use all six colors). Token contrast: 13 new pairs per palette (text on both wash glows for `fg` and `fg-muted`, text over the vote bar, the "no date / past" date tile, and initials on each of the six avatar colors at the 4.5:1 text ratio, not the icon ratio); all pass in light and dark with no token change.
- **How:** unit (vitest, node): 10 new tests in `packages/shared`, 26 new in `tokenContrast`. Totals: shared 17, core 429, web 385, database 1, all passing. `pnpm typecheck` and `pnpm lint` clean. The boards script was exercised for real: `pnpm screenshots` (12 passed) then `pnpm boards` wrote 36 boards, left no scratch folder behind and no server listening. Mutation checks: (1) made the dark `--bar` light → the two dark-palette bar tests failed (`fg` and `fg-muted` on `bar`), reverted; (2) made `formatPersonName` return the full name to a member → 3 tests failed ("First L.", the surname rule, "never gives a member the surname"), reverted; both files restored from copies and `git diff` checked.
- **E2E journeys:** none added or edited: styling and primitives only, accessible names unchanged (the nav avatar still has role `img` and the person's name, which `auth.spec.ts` and `accessibility.spec.ts` find). Full suite on the dev server: 140 passed, 2 skipped. CI mode (`CI=true pnpm build && CI=true pnpm test:e2e`): 140 passed, 2 skipped; port 3100 free afterwards. Axe (D2) passes with the wash and the translucent top bar.
- **Stress run** (`--workers=4 --repeat-each=3`): 419 passed, 6 skipped, **1 failed**: `closing-voting.spec.ts` H2 on repeat 2, "a saved deadline persists" (the poll for `votingDeadline` in the database saw `undefined` for 15 s). It did not reproduce in 60 targeted runs (`closing-voting` × 15 repeats, 4 workers) or in the full dev and CI-mode runs. **Followed up after M1 at the owner's request, and it was a real product bug, not a test flake.** The deadline field was a controlled input filled by an effect after mount, and the form is usable on screen before React has taken the page over (a slow phone). A deadline typed in that gap was lost, and Save then cleared the saved deadline instead of setting one. Reproduced deterministically by delaying the page's scripts: new journey **H8** failed on the original code (the field came back empty) and also on an intermediate fix that kept typed text in separate state; making the field uncontrolled (the browser keeps what was typed; the saved deadline is written into an empty field after mount) fixed it. H8 and the existing H2 pass 25 of 25 runs (5 repeats, 4 workers), the full e2e suite passes (141, dev and CI mode), and a full stress run after the fix was clean (423 passed, 6 skipped, 0 failed, against 1 failure before; one clean run is consistent with the cause, not proof of it). The exact mechanism inside React was not isolated; the behavior and the fix were. The same check on other server-rendered fields found nothing to fix: the wizard's title and the suggest-a-time field keep early typing, and the manage page's add-time field is not editable until the page has loaded. The fix is its own `fix:` commit. The earlier "intermittent dev-mode failures" in specs 0009 and 0010 were not investigated for this cause; they may or may not be the same.
- **What's deferred:** `Eyebrow`, `DateTile`, `InitialsAvatar` (beyond the nav) and `Badge`'s icon are not on a screen yet, so they have no render coverage by design (root `CLAUDE.md`: nothing tests that React renders); the dashboard milestone puts them on a screen and extends axe, layout and keyboard checks. The Design v3 canvas is copied into the scratch folder but its artboards are not photographed (nothing needs them until M5). Phone boards used a plain stand-in for the prototype's then-missing `ios-frame.jsx`; the owner added the real file after M1 was committed and the script now uses it (the stand-in is only a fallback). The prototype has no dark mode, so a "dark" board shows its light scene next to our dark one, and the caption now says so.
- **Correction to this milestone's original task list:** the script is `boards.ts`, not `.mjs`; no `--butter` or `--avatar-*` tokens (`tokenContrast.test.ts` reads literal `oklch()` values only, so an alias is untestable and a copy is a second place to edit; the butter panel is `--accent-soft`, the avatar colors are `--pop-*`); there is no `Pill` component (`Badge` gained an optional icon); the phone top bar's hidden name already existed from spec 0009; the Eyebrow uses `--fg-muted`, not the mockup's `--fg-subtle` (about 3.7:1, below AA at 12px).
- **Found along the way:** the pre-commit Prettier hook reformatted the two reference `.jsx` files in the docs commit; fixed with `.prettierignore` for `prototype/` and `design-docs/` (commit `6cd094f`). A shell command with backticks inside double quotes silently rewrote part of a PLANNING entry; caught by reading the diff and fixed with the editor.
- **How to run it:** `pnpm --filter @brunchsters/shared test`; `pnpm --filter @brunchsters/web exec vitest run src/styles`; boards: `pnpm --filter @brunchsters/web screenshots` then `pnpm --filter @brunchsters/web boards` (needs network and the local database).

---

## M2 — Dashboard (data and screen)

- [ ] Core: the pure rules `isVoteWaiting`, `pickNextUp`, `isPastBrunch` with unit tests (ties, closed, cannot-vote, single-option lists, the past boundary); `BrunchSummary` gains `description`, confirmed `scheduledAt` / `placeName` / `timezone`, `votingDeadline`, `votesWaiting`, all `undefined` not `null`; one query, with a query-count test; integration tests against the local database
- [ ] Core: `getBrunchRoster` (membership first, then host or member view, counts, soft-deleted excluded) with unit and integration tests, including an outsider that equals a made-up id and a member view with no email or id in the serialized output
- [ ] Web: `brunchCopy.ts` display mapping with its completeness test over the seeded status codes
- [ ] Web: `Greeting` (`useSyncExternalStore`, neutral server snapshot, reserved height), `NextUpCard` (two panels, roster as plain grouped markup with no list items, three names plus "+N more" on phone), `UpcomingRow` (date tile, one line, pill and count; vertical on phone), the summary line with the pill, Past rows, the new empty state with the 3-step strip; the next-up brunch is not repeated in Upcoming and the section is omitted when it would be empty
- [ ] E2E support `expectDashboard(page)`; edit the journeys listed below
- [ ] New journeys P1, P2, P3 and the dashboard half of P11; axe, layout and keyboard cases extended (D2, D3, D4), light and dark
- [ ] **Prove the tests can fail:** make `pickNextUp` prefer the oldest instead of the newest on a tie → its test fails; return a "no" name to a member → P2 fails; use the server's clock for the greeting → P1 fails; count ballots instead of brunches → P3 fails
- [ ] Board: dashboard and empty dashboard, light and dark, desktop and phone, against the prototype and the mockups; owner review (Open Questions 1, 2 and 6 are settled here)
- [ ] Commit: `feat: redesign the dashboard with next-up, roster and date-tile rows (M2)`

**Journeys that change:** `access-and-dashboard.spec.ts` (C4: the row count drops by the next-up brunch, status text becomes "Open for votes" and "In the works"; the finished-brunch test keeps its `Upcoming`/`Past` headings), `auth.spec.ts` and `sessions.spec.ts` (`heading "Dashboard"` → `expectDashboard`), and every file that waits on `No brunches yet.` (`auth`, `sessions`, `create-brunch`, `accessibility`, `responsive-layout`, `screenshots/review.spec.ts`: → the new headline; `Plan a Brunch` unchanged). `fixtures.spec.ts` (`2 going` stays) and `keyboard-and-motion.spec.ts` (dashboard case) are re-run and edited only if the grep says so.
**Names that change:** the dashboard h1 (`Dashboard` → the greeting), `No brunches yet.` (→ "The table's set. Now invite some people."), status text on rows. **Unchanged:** `Plan a Brunch`, `Upcoming`, `Past`, the brunch-title link, `(Host)`, `N going`.
**Deployable:** yes (real data end to end).

**Testing notes:** _(fill on completion)_

---

## M3 — Brunch page (host and invitee)

- [ ] Core: `leadingOptionId` with unit tests (single top, tie, zero votes); `getBrunchById` returns `hostName` (members only); the roster is reused from M2
- [ ] Web: `BrunchHeader` (invitee eyebrow with initials avatar, "You're hosting", deadline chip beside the exact-text badge, description as subtitle), the "You in?" card (emoji `aria-hidden`, "I'm in" selected when the link already counted as yes), "Where to?" and "When?" cards with a header chip, quiet bars (`aria-hidden`) and the leading tag, the confirmed state (serif winner, Locked in, the "Brunch on. 💕" banner), `WhosComing` for host and member, right-column order, phone order and omissions, the host invite button "Round up the crew →"
- [ ] Edit the journeys listed below through shared locators in the page objects
- [ ] New journeys P5, P6, P7 and the invitee half of P11; axe, layout, keyboard cases extended for the open, closed, confirmed and cannot-vote states, light and dark
- [ ] **Prove the tests can fail:** let a tie show a leading tag → P6 fails; put the bar in the accessibility tree → axe or its name assertion fails; return an email in the member roster → P5 fails; show the "no" name to a member → P5 fails
- [ ] Board: host open, host confirmed, invitee open, invitee closed, invitee cannot-vote, light and dark, desktop and phone; owner review (the bar tint is judged here)
- [ ] Commit: `feat: redesign the brunch page with roster, vote bars and a confirmed state (M3)`

**Journeys that change:** the five files that use `yes`/`no`/`maybe` (`confirm`, `invitations-invitee`, `keyboard-and-motion`, `responsive-layout`, `voting`) → `I'm in` / `Can't` / `Maybe`; the three `Your RSVP` lookups in `voting.spec.ts` → `You in?`; the `Locations` and `Times` headings (`voting.spec.ts`, three lookups) → `Where to?` and `When?` through the ballot helper; the host invite button (`invitations-host.spec.ts` and `fixtures`) → `Round up the crew →`; `failure-paths.spec.ts` (RSVP failure keeps its message); `api-authorization.spec.ts` (page-level 404 case for the roster).
**Names that change:** `yes/no/maybe` → `I'm in/Maybe/Can't`; `Your RSVP` → `You in?`; `Locations`/`Times` → `Where to?`/`When?`; `Send Invite` → `Round up the crew →`. **Unchanged:** the status badge text ("Active", "Draft", "Confirmed", once), `N votes`/`1 vote` badges (the roughly 18 assertions), the ballot checkboxes, `Manage brunch`, `Back to Dashboard`.
**Deployable:** yes.

**Testing notes:** _(fill on completion)_

---

## M4 — Creation wizard

- [ ] Web: step eyebrow, per-step heading and helper, top Cancel (leaves without saving; hidden on phone), Back / Continue footer, step names Title / Where / When / Who, larger step icons on phone, "Plan a Brunch" kept as the quieter h1; behavior and the Redux slice untouched
- [ ] `e2e/support/wizard.ts` and the specs that read wizard names directly are edited through it
- [ ] New journey P8; the wizard added to layout and keyboard checks on phone; axe, light and dark
- [ ] **Prove the tests can fail:** make the top Cancel create a draft → P8 fails; drop `aria-valuenow` → the existing progress assertion fails
- [ ] Board: all four steps, light and dark, desktop and phone; owner review
- [ ] Commit: `feat: redesign the creation wizard with step headings and a Back/Continue footer (M4)`

**Journeys that change:** `wizard.ts` (page object), `create-brunch.spec.ts`, `redux-ui-state.spec.ts` (R1, R2), `failure-paths.spec.ts`, any spec that clicks `Next`.
**Names that change:** `Next` → `Continue`; step `What` → `Title`; new step h2s (`Give it a name`, `Pick a spot`, `Pick a time`, `Round up the crew`); a new `Cancel`. **Unchanged:** `Plan a Brunch` (h1), `Create Brunch`, the field labels.
**Deployable:** yes.

**Testing notes:** _(fill on completion)_

---

## M5 — Front door and edges

- [ ] **Boards first:** render the prototype's landing, sign-in, invite-preview and error scenes next to ours; confirm the adopt/keep/blend choices with the owner and record them in `spec.md` before building (a short grill, not a re-open of the settled screens)
- [ ] Landing page (brand voice hero, static how-it-works strip, a minimal footer, no claim about a missing feature; sign-in and dashboard links as today), sign-in and invite preview ("{Host} wants you at brunch 🥂", still only the title and host name), the invalid-invite and "something went wrong" states
- [ ] `not-found.tsx` (identical text for every 404) and `error.tsx` (the framework's retry), on the tokens
- [ ] Manage page tone, and the Copy Pass lines for close voting, confirming and the 66% banner **only if the owner approves them at the board** (they rename buttons the confirm and closing-voting journeys click)
- [ ] New journeys P9 and P10; axe, layout and keyboard for each new screen, light and dark
- [ ] **Prove the tests can fail:** make the 404 text differ between a real and a made-up brunch → P9 fails; remove the sign-in link from the landing page → P9 fails
- [ ] Board: landing, sign-in, invite (valid, invalid, error), 404, error, manage; owner review
- [ ] Commit: `feat: redesign the landing, sign-in, invite and error screens (M5)`

**Journeys that change:** `smoke.spec.ts` and `auth.spec.ts` (landing and sign-in text), `invitations-invitee.spec.ts` (invite preview text), `sessions.spec.ts` (sign-out lands on the new landing), the 404 assertions in `access-and-dashboard.spec.ts` and `api-authorization.spec.ts`; and, only if approved, `confirm.spec.ts`, `closing-voting.spec.ts`, `manage-options.spec.ts`.
**Names that change:** `Brunchsters` / `Coming soon.` (landing), `Sign in to Brunchsters` (if reworded), `You're invited to {title}` → the new invite line; and, only if approved, `Close voting` → `Call it` and `Confirm …` → `Lock in {Place}`. **Unchanged:** `Sign in with Google`, `Sign out`.
**Deployable:** yes; this is the milestone that makes the beta's front door real.

**Testing notes:** _(fill on completion)_

---

## M6 — Email voice (copy only; can be cut)

- [ ] `inviteEmail.ts` and `confirmedEmail.ts`: subject, heading, body and button text in the brand voice (Brand Voice's invite email is the model); layout (`layout.ts`), `safeSubject`, delivery and events untouched; escaping unchanged
- [ ] Unit tests for both templates updated; `email-notifications.spec.ts` edited for the new subject and heading; a real-send recheck per `email-notifications-setup` only if the owner asks
- [ ] **Prove the tests can fail:** put an unescaped title in the new copy → the template's escape test fails
- [ ] Commit: `feat: give the invite and confirmation emails the brand voice (M6)`

**Journeys that change:** `email-notifications.spec.ts`. **Names that change:** the two email subjects and headings, and the invite button text ("View the invite" → the voiced line). **Deployable:** yes.

**Testing notes:** _(fill on completion)_

---

## M7 — Close-out

- [ ] The full board set (every screen and state, light and dark, desktop and phone) against the prototype and the v3 canvas, for the owner's final sign-off; the owner's phone review is taken on the first deployment
- [ ] `spec.md` status → Complete with an "Outcome" (what shipped, what changed from the plan, what was found), Open Questions resolved or carried to `PLANNING.md` §17
- [ ] `PLANNING.md` §16/§17 and the memory-facing notes brought up to date; the deferrals confirmed in all three places (ADR, spec, §17); the `/spec-grill` skill updated with the phone and voice prompts
- [ ] `/pre-merge-review`, fixes in their own commits
- [ ] Commit: `docs: close out spec 0011 design fidelity (M7)`

**Journeys that change:** none. **Deployable:** yes.

**Testing notes:** _(fill on completion)_
