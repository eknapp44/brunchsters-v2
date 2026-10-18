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

- [x] Check what `BrunchSummary` carries; decide the dashboard "Next up" hero (Open Question 3); if the data is not there, record it in the parity table and ship the card list
- [x] Restyle `/` (a simple styled entry point with the sign-in action, not the marketing page), `/sign-in`, the dashboard (empty and populated; Upcoming and Past as cards, status badges, one primary "Plan a Brunch" action) and the invite landing page (signed-out preview, invalid-link and error states)
- [x] Artwork: the butter-to-paper gradient behind sign-in, landing and the invite page; `BreakfastScene` on the empty dashboard (its `--art-*` colors in `tokens.css`); Pop icons on dashboard cards and the empty state where there is a matching spot
- [x] Add the screens and their states to the screenshot set; add them to D1/D2 axe coverage
- [x] Existing journeys pass unmodified (auth, access-and-dashboard, invitations-invitee, sessions)
- [x] **Prove the new tests can fail:** axe itself failed on a real contrast problem in these screens (see the testing note), which is a stronger proof than a planted one
- [x] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`, stress run, CI mode
- [x] Commit: `feat: style sign-in, landing, dashboard and invite pages (M3)`
- [x] **STOP FOR REVIEW 2** — the screens friends see first. Layout feedback is cheapest here, before the wizard, detail and manage screens copy these patterns. Triage into the log below; apply in-scope changes before M4

**Testing notes:**

- **What was tested:** Axe (D1/D2, light and dark) now scans the restyled landing, sign-in, invite preview and invalid-invite pages, the empty dashboard (with the illustration) and the dashboard with a draft, an active and a confirmed brunch (cards, status badges, Pop icons). The existing journeys that read these pages passed **unmodified**: `auth`, `access-and-dashboard` (rows still carry the title, "(Host)", the status label and "N going", one `<li>` per brunch), `invitations-invitee`, `invitations-host`, `email-notifications`, `same-person`, `sessions`, `smoke` and `create-brunch`. The review screenshots cover every state.
- **How:** unit (web 283; core 429, shared 7, database 1), full e2e on the dev server (85, one new), a 252-run stress (`--workers=4 --repeat-each=3`) and CI mode (`CI=true pnpm build`, then `CI=true pnpm test:e2e`, 85 of 85, nothing left listening). Typecheck and lint clean. One journey was added, in the shell group: the landing page's one action goes to `/sign-in` when signed out and to `/dashboard` when signed in (and the Sign in link is absent when signed in); renaming the signed-in link made it fail, then it was restored.
- **Proving the new tests can fail:** the axe journeys caught a real defect in this milestone. The new accent badge drew dark text on the dark-mode soft accent background at **1.55:1** (4.5:1 required), failing the dark invite-preview and dashboard scans while light mode passed. The fix is a new token (`--accent-soft-fg`), logged in the plan's adjustment table; the same journeys then passed.
- **Findings:**
  1. **Contrast token fixed (first one):** the prototype pairs `--accent-fg` with `--accent-soft`, which is right in light mode and wrong in dark (both are dark). Added `--accent-soft-fg` (light unchanged, dark about 9.5:1). A small script that converts oklch to sRGB reproduced axe's number (1.56 against 1.55), so the new value was checked independently, not only by re-running axe.
  2. **A real layout bug caught by looking, not by a test:** the gradient pages first rendered as a boxed 44rem strip with visible edges on desktop, because the global `<main>` width cap still applied to the hero (making a rule zero-specificity does not remove it). `Hero` now opts out explicitly. No assertion would have noticed; this is what the screenshots are for.
  3. **The "Next up" hero is not built (Open Question 3, resolved):** `BrunchSummary` carries only title, status, host flag, going count and creation time; it has no date or place. A hero would need a new query, which is a behavior change, so it moves to the parity table.
  4. **Two unexplained intermittent failures now, both in the e2e suite.** The first full e2e run of this milestone failed four tests on pages this milestone does not touch (`api-authorization` host-only, `closing-voting` H2, `confirm` H3, `failure-paths` F1; the first took 11.9 s, the others 20 to 30 s) and I did not capture the errors. Since then: the four alone (14 of 14), the full suite five more times (84 of 84 each, one with the Next.js cache deleted), a 252-run stress and CI mode all passed. The M2 stress run also failed three tests, including the same `api-authorization` test. The pattern (the slowest, request-heavy journeys; the first run after a batch of changes; never in CI mode) is consistent with dev-server load but is not proven. Local runs have `trace: on-first-retry` with no retries, so a local failure leaves no trace. A cheap fix would be `retain-on-failure` locally; I did not change the shared Playwright config in a styling milestone, and I am flagging it for you to decide.
  5. **Copy and structure kept as they were:** the dashboard rows still read "(Host)" in parentheses and the headings are unchanged, because journeys assert them; a nicer "Host" badge and any new headline copy go to the Copy list. The Google sign-in button has no Google "G" logo: Google's brand colors would need literals the style guard forbids, so it is a text button for now.
- **Deviations (all in the plan):** `--text-sm` raised from 13px to 14px (the prototype's button size); `--accent-soft-fg` added; `Hero` opts out of the global `<main>` cap; the landing page gained a "Sign in" link (or "Go to dashboard" when signed in) because a page needs one clear next step (Constitution 24).
- **What's deferred:** the "Next up" hero (needs data); a Google "G" glyph; centered text alignment on wide screens is the prototype's left-aligned layout and is a Review 2 question; the wizard, detail and manage screens (M4 to M6).
- **How to run it:** `pnpm test:e2e`, `pnpm --filter @brunchsters/web screenshots`.

---

## M4 — Creation wizard

- [x] Restyle `brunch/new/page.tsx` (four steps) and `PlaceSearchInput` (combobox, listbox, selected place) with primitives; the step indicator reads `state.step` and is a progress bar (`role="progressbar"`, with the step in `aria-valuenow` and `aria-valuetext`) rather than a list; `Field` is built here
- [x] The invitee list and its 50-address stop message (spec 0008) keep their text and roles
- [x] Add each step to the screenshot set and to D2 axe coverage
- [x] Existing journeys pass unmodified (`create-brunch.spec.ts`, `failure-paths.spec.ts`)
- [x] **Prove the new tests can fail:** no existing journey looks at the step indicator, so one was added (the progress bar names the current step and follows Back and Next); freezing `aria-valuenow` made it fail
- [x] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`, stress run, CI mode
- [x] Commit: `feat: style the brunch creation wizard (M4)`

**Testing notes:**

- **What was tested:** Axe (D2, light and dark) now scans the wizard in every step: the title and description fields, the open list of place-search results, two chosen places with the "put to a vote" hint, two times with the deadline field, and two invitee addresses. A new journey asserts the progress bar: it is named "Brunch planning progress", reports "Step 1 of 4: What", and follows Next and Back. The existing wizard journeys passed **unmodified**: `create-brunch` (including the 50-address limit that counts `listitem`s and the place, time and email lists), `failure-paths` (a failed create keeps everything entered), `same-person`, `invitations-host`.
- **A new unit guard for the colors themselves:** `tokenContrast.test.ts` (35 tests) reads `tokens.css`, converts each color, and checks 16 foreground and background pairs the app actually draws (body, secondary and card text, the primary button label, accent and confirmed badges, error text, form control borders, and the Pop icons) in the light **and** the dark palette against WCAG AA (4.5:1 for text, 3:1 for graphics and control borders). It exists because you plan to tune the look: a token edit that breaks contrast now fails `pnpm test` in a second, without needing a page to render in axe, and it covers `--control-border`, which axe cannot see. The calculator is also checked against known values (21:1 for black on white; the 1.55:1 axe reported in M3).
- **How:** unit (web 319; core 429, shared 7, database 1), full e2e on the dev server (88, 3 new), a 264-run stress (`--workers=4 --repeat-each=3`) and CI mode (`CI=true pnpm build`, then `CI=true pnpm test:e2e`, 88 of 88, nothing left listening). Typecheck and lint clean. All logs were kept this time.
- **Proving the new tests can fail:** (1) the new axe wizard scan caught a real defect on its first run: the prototype fades upcoming steps (labels and icons) to 45% opacity, which put the labels at **2.1:1 in light and 2.4:1 in dark**; the fix dims only the icon. (2) Freezing `aria-valuenow` made the progress-bar journey fail; restored. (3) Putting the old pale border colour into `--control-border` and the old dark `--accent-soft-fg` back made exactly three token pairs fail with their ratios (1.27:1, 1.30:1, 1.56:1), and nothing else; restored.
- **Findings:**
  1. **Form control borders were too faint (a design-token finding axe cannot see):** the prototype draws inputs with `--line`, 1.3:1 against the page; WCAG 1.4.11 asks 3:1 for a control's boundary. New `--control-border` (3.5:1 light, 4.2:1 dark) is used for inputs, textareas and selects. Placeholder text moved from `--fg-subtle` (3.5:1) to `--fg-muted`, because placeholder text is text (1.4.3).
  2. **A screenshot artifact, not a product bug:** the first wizard pictures showed Back and Add as solid dark grey. The real computed background was the correct light surface; the picture was taken mid-fade, because the helper switches palette and the buttons animate their color over 200 ms. The helper now turns transitions off. (Caught by checking the browser's computed style instead of editing CSS to match a picture.)
  3. **The style guard had a second false positive:** a variable named `fill` inside `style={{ width: `${fill}%` }}` matched the inline-color rule. It now needs a property key followed by a colon, with a test for it. The contrast tooling is on the guard's allowlist because it must contain color literals.
  4. **Why a progress bar and not a list:** the wizard journeys count the page's `listitem`s (1 and 50) and look up fields by label, so the indicator may add neither list items nor words like "Title" or "Description". Its steps are labelled What, Where, When and Who (from the spec's own step names) and are hidden from assistive technology; the bar's `aria-valuetext` carries the same information.
  5. **No intermittent failure this time** in the full run (88/88), the stress run (264/264) or CI (88/88); the two earlier unexplained failures (M2, M3) remain unexplained.
- **Deviations (all in the plan):** `--control-border` and the placeholder color (above); dimming only the icon of upcoming steps; the step indicator is a progress bar, not `aria-current` on a list (the spec and plan were updated).
- **What's deferred:** the 3:1 border for a few non-wizard controls (checkboxes on the brunch page) comes with M5; the search results are a plain list of buttons, not an ARIA combobox (behavior the journeys rely on; a change is a behavior change); invalid-email feedback and other wizard validation stay as they were.
- **How to run it:** `pnpm --filter @brunchsters/web test` (style guard and token contrast), `pnpm test:e2e`, `pnpm --filter @brunchsters/web screenshots`.

---

## M5 — Brunch detail

- [x] Restyle `brunch/[id]/page.tsx` and `RsvpControl`, `BallotChecklist`, `InvitePanel`, `SuggestionsPanel`, `OptionSuggestionControl`, for the host and the invitee views and each brunch state (voting open, closed, confirmed)
- [x] Add each view and state to the screenshot set and to D2 axe coverage
- [x] Existing journeys pass unmodified (`voting`, `invitations-host`, `invite-suggestions`, `option-suggestions`, `suggestion-decline`, `same-person`, `timezones`, `closing-voting`, `confirm`)
- [x] **Prove the new tests can fail:** make a ballot checkbox lose its accessible name and see the voting journeys fail (confirms the contract is guarded)
- [x] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`, stress run, CI mode
- [x] Commit: `feat: style the brunch detail page (M5)`

**Testing notes:**

- **What was tested:** Axe (D2, light and dark) now scans the brunch detail page as the host with voting open, as an invitee who has voted, as an invitee who said "maybe", with voting closed, and as host and invitee of a confirmed brunch. The existing journeys that drive this page passed **unmodified**: `voting` (checkboxes, revising, the empty-ballot warning, who can vote, voter names), `closing-voting`, `confirm`, `invitations-host` and `invitations-invitee` (copy link, resend, revoke, the status of each invite), `invite-suggestions`, `option-suggestions`, `suggestion-decline`, `same-person`, `timezones`, `failure-paths` (a failed vote rolls its checkbox back) and `fixtures`.
- **How:** unit (web 319; core 429, shared 7, database 1), full e2e on the dev server (90, 2 new), a 270-run stress (`--workers=4 --repeat-each=3`) and CI mode (`CI=true pnpm build`, then `CI=true pnpm test:e2e`, 90 of 90, nothing left listening). Typecheck and lint clean. All logs kept; no failure or flake this milestone.
- **Proving the new tests can fail:** the ballot options were changed from a `<label>` to a plain `<div>`, so each checkbox lost its accessible name. Both axe detail scans failed, and three voting journeys (V1, V2, V3) failed with `toHaveAccessibleName`, and nothing else did; restored from a copy. So the "checkbox name starts with the place or time" contract is guarded by both the e2e suite and axe.
- **What was built:** each part of the page is a card (a `<section>` with its own heading, which is what the `ballot()` test helper looks for); the status as a badge under the title; "Back to Dashboard" and "Manage brunch" as separate controls (the run-together links from the first screenshots, feedback item 2); the RSVP answer you have chosen is the filled button; each voting option is a bordered row that highlights when checked (the text, address, vote count, voter names and "— Confirmed" are exactly as before); invites and suggestions are rows with a status badge and small action buttons; a new **`danger`** button style for Revoke; the "voting closed", "your RSVP does not allow voting" and error messages as inline alerts, keeping their roles.
- **Findings:**
  1. **My own test was wrong about the access rule:** I first scanned an "invitee who has not answered yet" and got a 404. That is correct (Constitution: an invited person who is not yet an attendee is an outsider), so the scan now uses an invitee who said "maybe". The review screenshots had the same mistake, a picture labelled "unanswered invitee" that was actually the 404 page; it is relabelled `not-found`, and the 404 is the default Next.js page.
  2. **Constraints the journeys put on the markup, kept:** the exact text "Active" or "Confirmed" must appear once (so the option marker stays "— Confirmed" and does not become a second "Confirmed" badge), no extra list items, headings and `section`s unchanged, and the status words in each invite row. The accessible names did not change.
  3. **Two small copy-adjacent changes, both invisible to the journeys:** the separator "—" between an invite's email and its status, and between a suggestion's email and "suggested by", is gone (they are now badge and text next to each other); the journeys assert the words, not the dash. Checkbox names still include their dashes.
  4. **Native checkboxes kept on purpose:** the 3:1 border question from M4 needs no change here; the browser draws a checkbox with its own high-contrast border and the app only sets its accent color.
  5. **Shared tone helper:** the status-to-badge-tone mapping moved to `components/ui/statusTone.ts` so the dashboard and this page agree.
- **What's deferred:** the Next.js default 404 is not styled (the prototype has an error-state design; a not-found page would also change the text the access-rule journeys assert); the host's manage page is M6; the "countdown ring", running-late, host transfer and calendar chip from the prototype's detail screens need features that do not exist (parity table).
- **How to run it:** `pnpm test:e2e`, `pnpm --filter @brunchsters/web screenshots` (new: `brunch-invitee-voting-closed`, `not-found`).

---

## M6 — Manage page

- [x] Restyle `brunch/[id]/manage/page.tsx` and `OptionManager`, `VotingControls`, `ConfirmControl`, `OptionSuggestionReview`; keep the single-`<section>` structure that the existing locators depend on unless a journey is deliberately updated in discussion (spec 0006 notes the Locations and Times lists share one section)
- [x] Add the states to the screenshot set and to D2 axe coverage
- [x] Existing journeys pass unmodified (`manage-options`, `confirm`, `closing-voting`, `failure-paths`)
- [x] **Prove the new tests can fail:** drop the label on the add-a-time date input (the spec 0006 gap) and confirm axe and the manage journeys catch it
- [x] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`, stress run, CI mode
- [x] Commit: `feat: style the host manage page (M6)`

**Testing notes:**

- **What was tested:** Axe (D2, light and dark) now scans the host manage page in four states: a draft brunch (controls shown but disabled, with the "Send an invite first" notice), voting open with a suggested place and a suggested time waiting for approval (created through the real UI as an attendee), voting closed, and the confirmed summary. The existing journeys that drive this page passed **unmodified**: `manage-options` (add and remove places and times, a vote dropping with its option, confirming after a removal, the draft rules), `confirm` (the leader preselects, ties, the "no one else has accepted" note, what locks after confirming), `closing-voting` (the nudge, a saved deadline, closing), `failure-paths` (removing the last option is refused), `option-suggestions` and `suggestion-decline`.
- **How:** unit (web 319; core 429, shared 7, database 1), full e2e on the dev server (92, 2 new), a 276-run stress (`--workers=4 --repeat-each=3`) and CI mode (`CI=true pnpm build`, then `CI=true pnpm test:e2e`, 92 of 92, nothing left listening). Typecheck and lint clean. All logs kept; no failure or flake this milestone.
- **Proving the new tests can fail:** the `aria-label` on the add-a-time date input (the accessibility gap spec 0006 found three times) was removed. Axe reported a **critical** `label` violation on exactly that input in both palettes, and the manage journey H1 failed (it finds the input by that label); restored from a copy.
- **What was built:** each part of the page is a card; the Locations and Times lists stay in **one** section with two headings (the journeys rely on that), each half grouped by a plain div; places and times as rows with a Pop icon and a soft-red Remove; Voting with the deadline field and its Save beside it; Confirm with the Location and Time radio groups drawn like the voting options on the brunch page (the same highlight when chosen), and the butter "Confirm brunch" as the page's one primary action; pending suggestions as rows with Approve and Decline; the draft notice with a primary link; the confirmed summary with a pin and a clock. Radio and button names are unchanged (radios still start with the place or the time).
- **Findings:**
  1. **Two layout defects found by looking at the phone screenshots, not by a test:** the text beside a pin or clock icon dropped below the icon (it could not fit next to it), and the Time group sat tight against the Location group (my `margin: 0` on the fieldset cancelled the card's spacing rule). Fixed with a `rowText` class that lets the text take the remaining width, and `margin-inline` only. Both are in the shared detail styles, so the brunch page's display-only rows and suggestion rows got the same fix.
  2. **Button choices, all judgment calls for review:** Remove is the soft-red `danger` style (it takes an option away, with its votes); "Close voting now" is a plain secondary button, not red, because it ends voting but is the normal next step; Approve and Decline are plain. "Confirm brunch" is the only primary action.
  3. **The shared look is reused, not copied:** the manage components import the brunch page's `detail.module.css` for cards, rows, option rows and add rows, with a small `manage.module.css` for what is specific to this page.
  4. **No new copy and no new markup roles:** the nudge, the "no one else has accepted" note and "Voting is closed." keep their exact text (now inside inline alerts); the headings are `Locations`, `Times`, `Voting`, `Confirm`, `Confirmed` and `Pending Suggestions` as before.
- **What's deferred:** nothing from this milestone; the screens are now all restyled. Left for M7: phone-width journeys and the no-horizontal-scroll check, the keyboard and reduced-motion journey, the final parity table, and the documentation.
- **How to run it:** `pnpm test:e2e`, `pnpm --filter @brunchsters/web screenshots` (new: `manage-draft`, `manage-confirmed`).

---

## M7 — Phone layout, keyboard, reduced motion, docs (REVIEW 3)

- [x] **Wide-screen layout (owner feedback after M6, option 1):** `--page-width` 68rem, a narrow option for the wizard, two columns on the brunch and manage pages from 60rem, a card grid on the dashboard, a tablet width in the screenshots
- [x] `mobile` project in `playwright.config.ts` and the final list of journeys it runs (record which and why in the note); `responsive-layout.spec.ts` (D3: no horizontal scroll, primary action on screen, touch-sized controls, the window sizes)
- [x] D4: keyboard focus path and visible focus indicators, reduced-motion check
- [x] Sweep: axe on every screen and state in D1/D2 is complete, light and dark; all token changes are in the plan's table with before/after ratios
- [x] Measure the CI e2e job time with the second project; trim the mobile subset if it nears the limit
- [x] `apps/web/CLAUDE.md` (UI conventions) and `docs/SETUP.md` (axe, mobile project); `PLANNING.md` §16 #9 marked built; parity table finalized in `spec.md`
- [x] **Prove the new tests can fail:** add a fixed-width element (D3 fails), remove the focus-ring rule (D4 fails)
- [x] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`, stress run, CI mode
- [x] Commit: `feat: phone layout, keyboard and reduced-motion checks, UI docs (M7)`
- [ ] **STOP FOR REVIEW 3** — every screen, light/dark, desktop and phone. This feeds the polish pass

**Testing notes:**

- **What was tested:** Journey D3 (`responsive-layout.spec.ts`, both projects): every screen (landing, sign-in, invite preview and invalid invite, empty and full dashboard, all four wizard steps with long titles and addresses, the brunch page as host and invitee, the manage page voting and draft) has no sideways scroll and shows its one action on screen; on the phone every button and text field is at least 44px tall; on desktop the brunch and manage pages are two columns at 1440, 1280 and 1024px and one column at 900 and 768px. Journey D4 (`keyboard-and-motion.spec.ts`): the dashboard (Plan a Brunch, then a card, opened with Enter), the wizard (title, description, Next) and the RSVP (Space) are reachable by Tab with a visible focus indicator at **every** stop, and under reduced motion nothing on four screens transitions or animates. Axe gained the 404 page; the sweep now covers every screen and state in light and dark (the full list is in `spec.md`).
- **The `mobile` project:** an emulated Pixel 7 running D3 and the core journeys `auth`, `access-and-dashboard`, `create-brunch`, `invitations-invitee`, `voting` and `confirm`. All of them passed at phone width with touch **unmodified** (30 tests). Left on the desktop project: journeys about rules and data, which a screen size does not change.
- **How:** unit (web 319; core 429, shared 7, database 1), full e2e on the dev server (135 passed, 2 skipped by design: the touch check on desktop and the window check on the phone), a stress run (`--workers=4 --repeat-each=3`, 405 passed, 6 skipped) and CI mode (`CI=true pnpm build`, then `CI=true pnpm test:e2e`, 135 passed, 2 skipped, nothing left listening). Typecheck and lint clean. All logs kept; no failure or flake this milestone.
- **CI time:** the local CI-mode run went from 93 tests in 15.3s to 135 in 21.6s (about +6s, +40% of the test run itself). The GitHub job also spends time installing, building and starting Inngest, so the share is smaller; I did not trim the subset. If the job ever nears its limit, drop `voting.spec.ts` and `confirm.spec.ts` from the `mobile` list first (the layout checks cover their screens).
- **Proving the new tests can fail:** (1) the sideways-scroll check **failed on its first run for a real defect** (below). (2) Removing the touch-size rule from `Button.module.css` made the touch check fail on `/dashboard` ("controls under 44px"). (3) Moving the two-column breakpoint to 200rem made the window check fail ("Invites sit beside Locations at 1440px"). (4) Adding `outline: none` to every focus state made D4 fail on the very first stop, the skip link. (5) Removing the reduced-motion block from `global.css` made D4 fail ("motion on the dashboard"); its sibling check, that the same screens do animate when motion is allowed, still passed, so the check can see motion. Every file was restored from a copy afterwards.
- **Findings:**
  1. **A real phone-only layout defect, caught by the new check:** the manage page scrolled sideways by 9px (421px in a 412px window). The new two-column grid had no explicit column, so on a phone its single track grew to its widest content (the datetime inputs) instead of shrinking. It only reproduced under real phone emulation (a desktop window of the same width did not), because phone Chrome draws date inputs wider. The fix is one line (`grid-template-columns: minmax(0, 1fr)`), and it is why the D3 check runs under the phone project.
  2. **Owner feedback after M6, in scope and done:** a long address pushed Remove below the text (fixed, with a long-address screenshot), the "Back to…" controls were bare links (now quiet buttons with an arrow, with a journey), and the content was narrow on a wide window. The width was my own M1 choice (44rem) against the prototype's 1080 to 1100px; the owner chose option 1: a 68rem page with two columns on the brunch and manage pages and a card grid on the dashboard, the wizard staying narrow.
  3. **The focus-indicator check had to look at `::after`:** the dashboard's card is one link stretched over the whole card, which draws its focus ring on `::after`; a plain "outline on the element" check would have failed a design that is correct. The check accepts an outline on the element or on `::after`. Note that deleting our focus rule alone does not remove the browser's own default ring, so the proof forces `outline: none`.
  4. **The default 404 page is axe-clean** in both palettes, so a custom not-found page is not needed for accessibility (and would change text the access-rule journeys assert).
  5. **Layout judgment calls to review:** the wizard stays at 44rem under a 68rem top bar (a task page, not a dashboard); the invite rows can put the status badge under a long email; the right column of the brunch page is shorter than the left for an invitee.
- **Docs:** `apps/web/CLAUDE.md` (new: UI conventions, the accessible-name contract with the e2e suite, layout and how to check a screen), `docs/SETUP.md` (token contrast, axe, the `mobile` project, layout and keyboard checks; tablet screenshots), `PLANNING.md` §16 #9 (built, awaiting sign-off), the spec (acceptance criteria ticked except the owner's sign-off, D3/D4 rewritten, the parity table final with the desktop-layout row) and the plan (mobile project, wide-screen layout, deviations).
- **What's deferred:** the owner's review of every screen on desktop, tablet and phone (Review 3) and a real-phone look (needs a deployment or tunnel); polish and sign-off (M8); the copy pass, the "Next up" hero and every "Ships later" item in the parity table.
- **How to run it:** `pnpm test:e2e` (everything), `pnpm --filter @brunchsters/web exec playwright test --project=mobile` (the phone subset), `pnpm --filter @brunchsters/web screenshots`.

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

| #   | Review           | Feedback                                                                                                                | Outcome                                                                                                                                                                                                                       | Done in  |
| --- | ---------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | M1 (Claude)      | Signed-out visitors get an empty bordered bar for the nav                                                               | In scope                                                                                                                                                                                                                      | M2       |
| 2   | M1 (Claude)      | On the brunch detail page "Back to Dashboard" and "Manage brunch" are adjacent links that run together                  | In scope                                                                                                                                                                                                                      | M5       |
| 3   | Review 1         | Is there a light mode? (Yes: light is the default; dark follows the OS. Explained; no change)                           | Answered                                                                                                                                                                                                                      | n/a      |
| 4   | Review 1         | Nunito is fine for now; the owner may revisit once more screens are converted                                           | Accepted provisionally; Open Question 4 resolved                                                                                                                                                                              | n/a      |
| 5   | Review 1         | Nothing to change in tokens, colors or background yet                                                                   | Approved; proceed to M2                                                                                                                                                                                                       | n/a      |
| 6   | Review 2         | The first real screens (landing, sign-in, invite, dashboard) are approved as they are                                   | Approved; proceed to M4 (the alignment, gradient and card questions were put to the owner and not changed)                                                                                                                    | n/a      |
| 7   | After M6 (owner) | On the manage page a long address fills the first line and the Remove button drops below it                             | In scope; fixed (the text now takes a flexible share and wraps beside the button)                                                                                                                                             | after M6 |
| 8   | After M6 (owner) | "← Back to brunch" is a bare link while everything else is a button                                                     | In scope; fixed (a quiet button with an arrow icon, as in the prototype; "Back to Dashboard" the same; new journey)                                                                                                           | after M6 |
| 9   | After M6 (owner) | The content sits in a small part of a wide window; is it not dynamic in size?                                           | In scope; owner chose option 1: a 68rem page, two columns on the brunch and manage pages from 60rem, a card grid on the dashboard, the wizard narrow (the 44rem column was my own M1 choice; the prototype is 1080 to 1100px) | M7       |
| 10  | Review 3 (owner) | Desktop looks much better; the "Back to Dashboard" and "Back to brunch" controls still look odd next to "Manage brunch" | In scope; fixed (the same bordered button as Manage brunch, instead of a borderless one)                                                                                                                                      | M8       |
| 11  | Review 3 (owner) | Things could be simplified and moved around                                                                             | In scope; **open, needs specifics** (which screen, what to simplify or move)                                                                                                                                                  | M8       |
| 12  | Review 3 (owner) | Dark mode colors could be better                                                                                        | In scope; **open, needs specifics** (what feels wrong about them)                                                                                                                                                             | M8       |
| 13  | Review 3 (owner) | Expects about two rounds of improvements, maybe more                                                                    | Answered: M8 is the first polish pass; larger changes become their own specs                                                                                                                                                  | n/a      |

**Copy list (for the follow-up copy spec):** _(none yet)_

## Sign-off

- [ ] Owner reviewed desktop and a real phone, light and dark, and approved the look — date: _(pending)_
