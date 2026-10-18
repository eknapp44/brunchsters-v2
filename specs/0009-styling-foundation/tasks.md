# Tasks 0009 — Styling Foundation

Eight milestones, each green on its own and ending in a commit. Review points are marked **STOP FOR REVIEW**: the owner looks at the running app and the screenshots before the next milestone starts. Testing notes are filled in as each completes (CLAUDE.md — Testing notes required per milestone). Branch: `feat/0009-styling-foundation`, cut from `main` (no stacking needed). Close each milestone with `/milestone-done`.

**Every milestone:** the existing journeys must pass **unmodified**. A milestone that seems to need a journey edited stops, and it is discussed. Because every milestone from M1 on changes what a user sees, each one runs the full `/milestone-done` e2e sequence: `pnpm test:e2e`, the stress run, then CI mode.

---

## M1 — Tokens, fonts, base styles, screenshot script, axe helper (REVIEW 1)

- [x] Commit ADR 0010, its README index row, the numbering updates and this spec folder (docs-only commit, before any code)
- [x] `apps/web/src/styles/tokens.css`: port the prototype tokens; dark under `@media (prefers-color-scheme: dark)`; `color-scheme: light dark`; spacing scale
- [x] `apps/web/src/styles/fonts.ts` (Nunito, Fraunces Soft, JetBrains Mono via `next/font/google`) and wire the variable classes into `<html>` in the root layout; confirm the exact Fraunces axes option against the installed Next.js version
- [x] `apps/web/src/styles/global.css`: reset, element defaults (headings in the display face, links, buttons, inputs, lists, tables) so the **existing plain pages already pick up the look**, focus ring, `prefers-reduced-motion`, skip-link style; imported by the root layout
- [x] `styleGuard.test.ts` and `.gitignore` entry for `apps/web/.screenshots/`
- [x] `playwright.screenshots.config.ts`, `e2e/screenshots/review.spec.ts` (every screen that exists, light/dark × desktop/phone, data from factories) and the `screenshots` script in `apps/web/package.json`
- [x] `@axe-core/playwright` as a pinned devDependency (record the version), `e2e/support/a11y.ts`, and `accessibility.spec.ts` with D1 (landing, sign-in, an invite landing) and the dashboard from D2, light and dark; log any token that must change in `plan.md`
- [x] **Prove the new tests can fail:** a hardcoded `#fff` in a component fails the style guard; a deliberately low-contrast token fails axe; (the focus-ring proof comes with D4 in M7)
- [x] `docs/SETUP.md`: the screenshots command and how to look at the UI (device mode, and what a real phone can and cannot reach before deployment)
- [x] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`, then the stress run and CI mode
- [x] Commit: `feat: design tokens, fonts, base styles and review tooling (M1)`
- [x] **STOP FOR REVIEW 1** — the owner opens the real app (and the screenshots folder) and confirms or changes tokens and fonts, including the Nunito-vs-Inter question. Record feedback in the log below; apply the in-scope changes before M2

**Testing notes:**

- **What was tested:** The look is guarded in three ways. `styleGuard.test.ts` (19 unit tests) scans every `.css`, `.ts` and `.tsx` file under `apps/web/src` and fails on a hex or color function, a named color in a color property, a `font-family` that is not `var(--font-…)`, `fontFamily` in code, or an inline color style; its detector (`findStyleViolations.ts`) has its own cases for what it must catch and what it must allow (a token, `transparent`, `currentColor`, an in-page `#anchor`, a color word in a comment), and a check that the scan is not passing on an empty file list. Journeys D1 and D2 (6 tests: landing and sign-in, the invite preview and invalid-link pages, the empty dashboard and a dashboard with a draft, an active and a confirmed brunch; each in light and dark) run axe with the WCAG 2.0/2.1 A and AA rules and report one line per offending element.
- **How:** unit (web 282 including the 19 new; core 429, shared 7, database 1, all unchanged), full e2e on the dev server (81, 6 new), the stress run (`--workers=4 --repeat-each=3`, 243 of 243) and CI mode (`CI=true pnpm build` then `CI=true pnpm test:e2e`, 81 of 81 with the strict 5 s timeout). Nothing was left listening on port 3100. Typecheck and lint are clean. The existing journeys needed no edits.
- **Proving the new tests can fail:** (1) the dark palette's `--fg` was set to a near-background value: the three dark D1/D2 tests failed with real contrast ratios (1.4:1 against a 4.5:1 requirement) and the three light ones still passed, which also proves the dark palette really is what is being scanned; tokens restored from a copy. (2) A `.oops { color: #fff; font-family: Arial; }` appended to `global.css` failed the style guard on both rules with the file and line; removed again. (3) The focus-ring proof waits for D4 in M7.
- **E2E journeys:** D1 and D2 (the dashboard part) are in; the rest of D2 and D3/D4 follow in the milestones named in the spec. The review set is `pnpm --filter @brunchsters/web screenshots` (8 tests, 60 pictures: every screen that exists, light and dark, desktop and an emulated phone); it is not part of `pnpm test:e2e`.
- **Findings:**
  1. **Axe found nothing on the base tokens, so no token was changed** (the plan's adjustment table stays empty). That is expected to change: so far the pages are plain text, links and neutral buttons. The accent-colored buttons, badges and soft backgrounds arrive in M2 onward, and those are where contrast is likelier to fail.
  2. **The "try it on a real phone over the local network" idea in the spec does not work for signed-in screens**: Google's OAuth does not accept a bare IP redirect URI and the app is not deployed. The spec, tasks and `docs/SETUP.md` now say what works instead (emulated phone screenshots, browser device mode, a real phone for signed-out pages only, and a deployed preview or tunnel for the rest).
  3. The Next.js dev "N" badge appeared in the first screenshots and covered content on a phone; the screenshot helper hides it (screenshots only; the axe helper already excludes it).
  4. `@axe-core/playwright` 4.14.0 declares `engines: node >=22.12`; CI uses Node 22 so it is fine, but the repo's root `engines` still says `>=20`. Left alone (a repo-wide decision), noted here.
  5. `pnpm add` rewrote `pnpm-lock.yaml` in its own compact style; Prettier (which the repo applies to it) restored the committed style, so the lockfile diff is the 26 lines the new package needs.
  6. The root layout's `<nav>` is an empty bordered bar for signed-out visitors, and the global element styles for `button`, `input`, `nav` and `main` are stand-ins that M2's primitives and shell replace.
- **What's deferred:** primitives, icons and the real shell (M2); every screen's own layout (M3–M6); D3 and D4 and the `mobile` project (M7). The axe scan does not yet cover the wizard, the brunch detail page or the manage page; each is added in the milestone that restyles it. Email appearance and the OS-level dark mode of a real device are not checked.
- **How to run it:** `pnpm --filter @brunchsters/web test` (style guard), `pnpm test:e2e` (D1/D2 are in `accessibility.spec.ts`), `pnpm --filter @brunchsters/web screenshots`.

---

## M2 — Primitives, icons, logo and the app shell

- [x] Port the stroke icon set and the Pop icons an existing screen has a place for (pin, calendar, people, clock, check, plus, share, sparkle, egg as needed) to decorative inline-SVG components; move the Pop palette from `IconsPop.jsx` into `tokens.css` (light and dark); add `LogoMark` and `Wordmark`
- [x] Build `Button`, `ButtonLink`, `Card`, `Badge`, `Avatar`, `InlineAlert`, `Container`, `SkipLink` with CSS Modules (`Field` moves to M4, where the wizard gives it a real use; others are added in the milestone that needs them)
- [x] Root layout shell: skip link, top bar (logo mark and wordmark, avatar, name, "Sign out" as the same plain button), page container; the nav keeps its current role and names
- [x] Add the shell to the screenshot set and to D2's axe coverage
- [x] Run the full existing suite; the sign-out journey (`sessions.spec.ts`) must pass unmodified (no confirm modal)
- [x] **Prove the new tests can fail:** break the shell's accessible-name contract and see the existing journeys fail (no screen uses `disabled` yet, so the avatar's name was mutated instead); confirm the style guard still catches a literal in a new module
- [x] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`, stress run, CI mode
- [x] Commit: `feat: ui primitives, icons, logo and app shell (M2)`

**Testing notes:**

- **What was tested:** The shell's contract with the e2e suite. Three new journeys in `accessibility.spec.ts`: signed out, the wordmark links to `/` and there is no Sign out; signed in, the wordmark links to `/dashboard` and the picture (named after the user) and Sign out are there; and the first slice of D4: Tab reaches the skip link first, it appears on screen when focused, and Enter moves focus to the page (`#main-content`). Every page already scanned by axe (D1/D2, light and dark) now includes the shell, and stays clean. The style guard (20 unit tests, one more than before) covers every new CSS module and component. Presentational components have no unit tests (CLAUDE.md); the journeys and axe are their tests.
- **How:** unit (web 283; core 429, shared 7, database 1), full e2e on the dev server (84, 3 new), three further stress runs (`--workers=4 --repeat-each=3`, 252 of 252 each) and CI mode (`CI=true pnpm build`, then `CI=true pnpm test:e2e`, 84 of 84, no flaky). Typecheck and lint are clean. The existing journeys needed no edits.
- **Proving the new tests can fail:** (1) the avatar's `alt` was blanked: the new "signed in" shell test and the existing A2 sign-in journey both failed, and the rest passed; restored from a copy. (2) A `#fff` and then `color: white` appended to `Badge.module.css` each failed the style guard with the file and line. (3) The task named dropping `disabled` from a primitive; no screen uses it yet, so that proof arrives with the first screen that does (M3/M4).
- **What was built:** `Button`, `ButtonLink`, `Card`, `Badge`, `Avatar`, `InlineAlert`, `Container`, `SkipLink`; the line icons the screens will need (calendar, pin, users, clock, check, plus, close, search, share, arrows) and seven Pop icons (calendar, pin, users, clock, check, plus, egg) as one `Icon` and one `PopIcon` component each; `LogoMark` and `Wordmark`; the `TopBar`; and the Pop palette (`--pop-*`, light and dark) and `--art-egg-white` in `tokens.css`. Only the shell uses any of them so far, so `Card`, `Badge`, `InlineAlert`, `Container`, `ButtonLink` and the icons are first exercised, and first scanned by axe, in M3.
- **Deviations from the prototype (all deliberate; see the plan):** buttons are 44px tall (the prototype's 40) to meet the touch-target criterion; the global element defaults for links and buttons are zero-specificity (`:where()`) so a component's class always wins; the global focus ring no longer sets a border radius (it changed a button's shape while focused); a signed-in person with no profile picture now gets an initials avatar (before, nothing was shown); the name beside the avatar is hidden from the layout (not from screen readers) at phone widths.
- **Findings:**
  1. **The style guard had a false positive on the new CSS**: `--pop-fill: var(--art-egg-white)` matched "fill" and "white" inside names. The detector now requires property and color words to stand alone, with a test for it; every other rule is unchanged.
  2. **One unexplained failure in a stress run.** The first stress run after the changes failed three tests (`same-person` I7 and two in `api-authorization`, the latter two fast, about 6 s, so not timeouts); the details were not captured. They passed in a targeted 18-run repeat and in three more full stress runs, and CI mode was clean. I could not reproduce it and have no cause. It is recorded here instead of being called a pass; if it appears again, capture the log first.
  3. **Axe still finds nothing and no token changed**, but nothing accent-colored is on screen yet except the logo (decorative), so the primary button, badges and soft backgrounds get their first real contrast test in M3.
  4. The shell adds one new link (the wordmark, named "brunchsters") and one new control (the skip link). No existing locator is affected: the test suite counts `listitem`s, so the shell deliberately contains no list, and the logo is not a heading, because tests find the landing heading by role.
- **What's deferred:** `Field` (M4); a `danger` button variant (M5, if the revoke/remove buttons want it); the screens themselves (M3–M6); real-screen use of every primitive but the sign-out button; D3 and the rest of D4 (M7).
- **How to run it:** `pnpm --filter @brunchsters/web test` (style guard), `pnpm test:e2e` (shell journeys are in `accessibility.spec.ts`), `pnpm --filter @brunchsters/web screenshots`.

---

## M3 — Sign-in, landing, dashboard, invite landing (REVIEW 2)

- [ ] Check what `BrunchSummary` carries; decide the dashboard "Next up" hero (Open Question 3); if the data is not there, record it in the parity table and ship the card list
- [ ] Restyle `/` (a simple styled entry point with the sign-in action, not the marketing page), `/sign-in`, the dashboard (empty and populated; Upcoming and Past as cards, status badges, one primary "Plan a Brunch" action) and the invite landing page (signed-out preview, invalid-link and error states)
- [ ] Artwork: the butter-to-paper gradient behind sign-in, landing and the invite page; `BreakfastScene` on the empty dashboard (its `--art-*` colors in `tokens.css`); Pop icons on dashboard cards and the empty state where there is a matching spot
- [ ] Add the screens and their states to the screenshot set; add them to D1/D2 axe coverage
- [ ] Existing journeys pass unmodified (auth, access-and-dashboard, invitations-invitee, sessions)
- [ ] **Prove the new tests can fail:** temporarily set a failing contrast pair and see D1/D2 fail on these screens
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`, stress run, CI mode
- [ ] Commit: `feat: style sign-in, landing, dashboard and invite pages (M3)`
- [ ] **STOP FOR REVIEW 2** — the screens friends see first. Layout feedback is cheapest here, before the wizard, detail and manage screens copy these patterns. Triage into the log below; apply in-scope changes before M4

**Testing notes:** _(fill on completion)_

---

## M4 — Creation wizard

- [ ] Restyle `brunch/new/page.tsx` (four steps) and `PlaceSearchInput` (combobox, listbox, selected place) with primitives; the step indicator reads `state.step` and sets `aria-current="step"`
- [ ] The invitee list and its 50-address stop message (spec 0008) keep their text and roles
- [ ] Add each step to the screenshot set and to D2 axe coverage
- [ ] Existing journeys pass unmodified (`create-brunch.spec.ts`, `failure-paths.spec.ts`)
- [ ] **Prove the new tests can fail:** remove `aria-current` and confirm no existing journey notices (it is a gap), so add an assertion for it to the D4/keyboard journey, then show it fails when the attribute is removed
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`, stress run, CI mode
- [ ] Commit: `feat: style the brunch creation wizard (M4)`

**Testing notes:** _(fill on completion)_

---

## M5 — Brunch detail

- [ ] Restyle `brunch/[id]/page.tsx` and `RsvpControl`, `BallotChecklist`, `InvitePanel`, `SuggestionsPanel`, `OptionSuggestionControl`, for the host and the invitee views and each brunch state (voting open, closed, confirmed)
- [ ] Add each view and state to the screenshot set and to D2 axe coverage
- [ ] Existing journeys pass unmodified (`voting`, `invitations-host`, `invite-suggestions`, `option-suggestions`, `suggestion-decline`, `same-person`, `timezones`, `closing-voting`, `confirm`)
- [ ] **Prove the new tests can fail:** make a ballot checkbox lose its accessible name and see the voting journeys fail (confirms the contract is guarded)
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`, stress run, CI mode
- [ ] Commit: `feat: style the brunch detail page (M5)`

**Testing notes:** _(fill on completion)_

---

## M6 — Manage page

- [ ] Restyle `brunch/[id]/manage/page.tsx` and `OptionManager`, `VotingControls`, `ConfirmControl`, `OptionSuggestionReview`; keep the single-`<section>` structure that the existing locators depend on unless a journey is deliberately updated in discussion (spec 0006 notes the Locations and Times lists share one section)
- [ ] Add the states to the screenshot set and to D2 axe coverage
- [ ] Existing journeys pass unmodified (`manage-options`, `confirm`, `closing-voting`, `failure-paths`)
- [ ] **Prove the new tests can fail:** drop the label on the add-a-time date input (the spec 0006 gap) and confirm axe and the manage journeys catch it
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`, stress run, CI mode
- [ ] Commit: `feat: style the host manage page (M6)`

**Testing notes:** _(fill on completion)_

---

## M7 — Phone layout, keyboard, reduced motion, docs (REVIEW 3)

- [ ] `mobile` project in `playwright.config.ts` and the final list of journeys it runs (record which and why in the note); `mobile-layout.spec.ts` (D3: no horizontal scroll, primary action on screen)
- [ ] D4: keyboard focus path and visible focus indicators, reduced-motion check
- [ ] Sweep: axe on every screen and state in D1/D2 is complete, light and dark; all token changes are in the plan's table with before/after ratios
- [ ] Measure the CI e2e job time with the second project; trim the mobile subset if it nears the limit
- [ ] `apps/web/CLAUDE.md` (UI conventions) and `docs/SETUP.md` (axe, mobile project); `PLANNING.md` §16 #9 marked built; parity table finalized in `spec.md`
- [ ] **Prove the new tests can fail:** add a fixed-width element (D3 fails), remove the focus-ring rule (D4 fails)
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`, stress run, CI mode
- [ ] Commit: `feat: phone layout, keyboard and reduced-motion checks, UI docs (M7)`
- [ ] **STOP FOR REVIEW 3** — every screen, light/dark, desktop and phone. This feeds the polish pass

**Testing notes:** _(fill on completion)_

---

## M8 — Polish and sign-off

- [ ] Work through the Feedback log's "in scope" items from Review 3 and any found on a real phone (token, spacing, size, color, font and layout of existing screens only); one pass
- [ ] Anything that adds or changes a behavior, screen or control is moved to the parity table with the feature that will carry it; wording goes to the Copy list
- [ ] Re-run the screenshot set and the full verification (`pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`, stress run, CI mode); axe and `mobile` still clean
- [ ] **Owner sign-off** recorded below with the date, then spec status → Complete
- [ ] Commit: `feat: styling polish pass and sign-off (M8)`

**Testing notes:** _(fill on completion)_

---

## Feedback log

Each item gets one outcome: **In scope** (tokens, spacing, sizing, colors, fonts, layout of existing screens — one polish pass per review point plus M8), **Roadmap** (adds or changes behavior, a screen or a control → parity table, with the feature), or **Copy** (wording and terminology → the follow-up copy spec). Anything that fits none is raised with the owner before it is touched.

| #   | Review      | Feedback                                                                                               | Outcome                                          | Done in |
| --- | ----------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | ------- |
| 1   | M1 (Claude) | Signed-out visitors get an empty bordered bar for the nav                                              | In scope                                         | M2      |
| 2   | M1 (Claude) | On the brunch detail page "Back to Dashboard" and "Manage brunch" are adjacent links that run together | In scope                                         | M5      |
| 3   | Review 1    | Is there a light mode? (Yes: light is the default; dark follows the OS. Explained; no change)          | Answered                                         | n/a     |
| 4   | Review 1    | Nunito is fine for now; the owner may revisit once more screens are converted                          | Accepted provisionally; Open Question 4 resolved | n/a     |
| 5   | Review 1    | Nothing to change in tokens, colors or background yet                                                  | Approved; proceed to M2                          | n/a     |

**Copy list (for the follow-up copy spec):** _(none yet)_

## Sign-off

- [ ] Owner reviewed desktop and a real phone, light and dark, and approved the look — date: _(pending)_
