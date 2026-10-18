# Plan 0009 — Styling Foundation

**Companion to:** `spec.md`

---

## Architecture

### Files introduced or changed

```
docs/adrs/0010-css-modules-and-design-tokens.md                       (new — committed with the spec)
docs/adrs/README.md                                                   (changed — index row)

apps/web/CLAUDE.md                                                    (new — UI conventions, M7)
apps/web/src/styles/tokens.css                                        (new — M1: light tokens + prefers-color-scheme dark)
apps/web/src/styles/global.css                                        (new — M1: reset, base element styles, focus ring, reduced motion, skip link)
apps/web/src/styles/fonts.ts                                          (new — M1: next/font declarations, exports the class names)
apps/web/src/styles/styleGuard.test.ts                                (new — M1: no color literals / font-family outside tokens.css)
apps/web/src/app/layout.tsx                                           (changed — M1 fonts + global.css; M2 shell/nav)
apps/web/src/components/ui/{Button,ButtonLink,Field,Card,Badge,
  InlineAlert,Avatar,Container,SkipLink}.tsx + *.module.css           (new — M2, and added as screens need them)
apps/web/src/components/icons/*.tsx                                   (new — M2: stroke icons and the Pop icons, as inline SVG)
apps/web/src/components/art/{LogoMark,Wordmark,BreakfastScene}.tsx    (new — M2 logo and wordmark, M3 breakfast scene)
apps/web/src/components/nav/*                                         (new — M2: top bar)
apps/web/src/app/**/*.module.css                                      (new — one per restyled page/component, M3–M6)
apps/web/src/app/**/*.tsx                                             (changed — M2–M6: classNames and primitives only; no logic change)

apps/web/playwright.config.ts                                         (changed — M7: add the `mobile` project)
apps/web/playwright.screenshots.config.ts                             (new — M1: reuses the main config, runs e2e/screenshots only)
apps/web/e2e/screenshots/review.spec.ts                               (new — M1: captures the review set; grows each milestone)
apps/web/e2e/support/a11y.ts                                          (new — M1: axe helper)
apps/web/e2e/journeys/accessibility.spec.ts                           (new — M1, grows each milestone: D1, D2, D4)
apps/web/e2e/journeys/responsive-layout.spec.ts                       (new — M7: D3, runs on both projects)
apps/web/e2e/journeys/keyboard-and-motion.spec.ts                     (new — M7: D4, keyboard paths and reduced motion)
apps/web/package.json                                                 (changed — `screenshots` script; devDependency @axe-core/playwright)
.gitignore                                                            (changed — `apps/web/.screenshots/`)
docs/SETUP.md, docs/PLANNING.md, specs/0008-*/                        (changed — numbering and how-to)
```

No change to `packages/*`, the schema, API routes, or any behavior.

### Tokens (the single source of the look)

`tokens.css` is a port of `prototype/styles/tokens.css` with three changes: the dark values sit in `@media (prefers-color-scheme: dark)` instead of `[data-theme="dark"]`, the font tokens point at the `next/font` variables (`--font-sans: var(--font-nunito), …`), and any pair that fails WCAG AA is adjusted (logged below). Groups: type (`--font-*`, a size and line-height scale), neutrals (`--bg`, `--surface`, `--surface-2/3`, `--line`, `--line-soft`, `--fg`, `--fg-muted`, `--fg-subtle`), accent (`--accent`, `-strong`, `-soft`, `-fg`), mint (success only), danger, radii (`--r-1…4`, `--r-pill`), shadows, easings, plus a spacing scale (`--space-1…8`) and a layout width token that the prototype has implicitly in its CSS. Tokens are added only when two or more places need them (Constitution 2), except the spacing scale which exists so spacing is one decision.

### Artwork

The prototype draws its illustration in inline SVG: `BreakfastScene` (empty dashboard), the Pop icon set and the logo marks. They are ported as typed components with `aria-hidden` and no `role`, so they never change an accessible name. **Their colors cannot stay as they are:** `IconsPop.jsx` defines its own `--pop-*` palette (butter, peach, tomato, mint, peri, lavender, each with an `-fg` and a dark variant) inside the component, and about 50 `oklch(...)` literals sit in the SVGs. All of them move into `tokens.css` (a `--pop-*` group and an `--art-*` group, with dark values in the existing media query), and the SVGs use `var(--…)`. The style guard then covers artwork too, and recoloring it is a token edit. Only the Pop icons that an existing screen has a place for are ported (for example pin, calendar and people on dashboard cards); the rest of the set stays in `prototype/`. The sign-in, landing and invite pages get the butter-to-paper gradient from `WelcomeScreen.jsx` as a token-based CSS background.

### Fonts

`fonts.ts` declares Nunito, Fraunces (axes `SOFT` and `opsz`, weight variable) and JetBrains Mono with `next/font/google`, each with a CSS variable name; the root layout puts the three variable classes on `<html>`. `display: 'swap'` keeps text visible while loading. If `next/font/google` cannot fetch at build (offline machine), switching `fonts.ts` to `next/font/local` with committed files is the whole fix.

### Primitives (`components/ui`)

Built only for what the 8 screens need, each a thin typed component with a CSS Module:

| Primitive                 | Notes                                                                                                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`                  | variants `primary`, `secondary`, `ghost`, `danger`; renders a real `<button>`, forwards every native prop (so `type`, `disabled`, `aria-*`, `name` pass through) |
| `ButtonLink`              | a `next/link` styled as a button, for navigation actions that are links today                                                                                    |
| `Field`                   | label + control + hint + error with `htmlFor` and `aria-describedby` wired; the **label text is exactly what is rendered today** so locators are unchanged       |
| `Card`, `Badge`, `Avatar` | surface, status pill, the existing avatar `<img>`                                                                                                                |
| `InlineAlert`             | the existing error/notice messages with an icon and tone; keeps whatever `role` the message has today                                                            |
| `Container`, `SkipLink`   | page width and padding at each breakpoint; the skip-to-content link from the a11y pass                                                                           |

Rule for every primitive: **it must not change an accessible name or role.** If wrapping an element would change what `getByRole` sees, the primitive takes the element as a prop or does not wrap it.

### Deliberate deviations from the prototype

Where the prototype and the real app or the accessibility bar disagree, the decision and the reason are recorded here (principle 3, accessibility overrides the prototype).

| Deviation                                                                                                        | Why                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Buttons are 44px tall (the prototype's default is 40px); small buttons are 36px, and 44px on touch screens       | The spec's touch-target criterion; the prototype's own accessibility pass bumped only `.sm`                                                                                  |
| Global element defaults for `a` and `button` use `:where()` (zero specificity)                                   | A component's class must win over them on hover and focus; otherwise a primary button turned grey when hovered                                                               |
| The global focus ring sets no `border-radius`                                                                    | It changed a button's shape while focused                                                                                                                                    |
| An initials avatar for a signed-in person with no picture                                                        | The old nav showed nothing; the prototype shows initials                                                                                                                     |
| The name beside the avatar is clipped out of the layout (still read by screen readers) at 30rem and narrower     | Keeps the bar on one line on a phone                                                                                                                                         |
| `--page-width` 68rem for app pages, a 44rem narrow option for the wizard, two columns from 60rem                 | The prototype's desktop pages are 1080 to 1100px; my first 44rem column (M1) was narrower than designed (owner feedback after M6)                                            |
| `Field` is built in M4, and a `danger` button variant when M5 needed it (Revoke)                                 | No screen used them before then                                                                                                                                              |
| `--text-sm` is 14px (was 13px)                                                                                   | The prototype's buttons and small text are 14px; 13px read small                                                                                                             |
| `--accent-soft-fg` is a new token                                                                                | The prototype pairs `--accent-fg` with `--accent-soft`; that is only readable in light mode                                                                                  |
| `--control-border` is a new token, and placeholder text uses `--fg-muted`                                        | The prototype's input border (`--line`) is 1.3:1 against the page (WCAG 1.4.11 asks 3:1) and its placeholder (`--fg-subtle`) is 3.5:1 (1.4.3 asks 4.5:1); axe checks neither |
| Upcoming wizard steps dim the icon only, not the label                                                           | Faded labels measured 2.1:1 (light) and 2.4:1 (dark); found by axe in M4                                                                                                     |
| `Hero` sets `max-width: none` itself                                                                             | The global `<main>` width cap still applies to any `<main>` that does not opt out                                                                                            |
| The landing page has a "Sign in" link ("Go to dashboard" when signed in)                                         | A page needs one clear next step (Constitution 24); it was only the text "Coming soon."                                                                                      |
| Only the Pop icons an existing screen has a place for are ported (calendar, pin, users, clock, check, plus, egg) | Avoids dead artwork; sparkle and share arrive with their uses                                                                                                                |

### Layout and breakpoints

Mobile-first: base styles are the phone layout; `@media (min-width: …)` adds the wider arrangement. The prototype used a container-query hook (`useResponsive`); here plain CSS media queries (or container queries in CSS) do the same without client JavaScript. One content width token and two breakpoints (phone to tablet, tablet to desktop) are expected; add more only when a screen needs it. The nav is a top bar at every width in this spec (no bottom tabs, no drawer).

### Step indicator

The wizard already has the step in its reducer state (`state.step: 1 | 2 | 3 | 4`). The indicator is a presentational **progress bar** (`role="progressbar"`, with `aria-valuenow` and an `aria-valuetext` such as "Step 2 of 4: Where") that reads that value. It adds no state and no event. It is a progress bar and not a list because the journeys count the page's list items, and its step names (What, Where, When, Who) avoid the field labels the journeys look up ("Title", "Description"). Upcoming steps are dimmed by fading only the icon: faded label text failed contrast.

### Style guard (`styleGuard.test.ts`)

A Vitest test, in the spirit of `e2e/support/guard.test.ts`. It reads every file under `apps/web/src` and fails when it finds, outside `styles/tokens.css`: a hex color, `rgb(`/`hsl(`/`oklch(`, a `font-family` declaration, or an inline `style={{ … color/background/font … }}` in a `.tsx`. Allowed escapes: `transparent`, `currentColor`, `inherit`, and `var(--…)`. Proven to fail by adding one of each.

### Review screenshots (`pnpm --filter @brunchsters/web screenshots`)

`playwright.screenshots.config.ts` imports the main config and overrides `testDir` to `e2e/screenshots` and `projects` to desktop and phone widths, so it reuses the same web server, database reset and Inngest server. `review.spec.ts` creates the data it needs through `e2e/support/factories.ts` (same rule as every e2e test) and saves PNGs to `apps/web/.screenshots/<screen>-<light|dark>-<desktop|phone>.png` (git-ignored). It is not part of `pnpm test:e2e` and has no baselines to compare against. Screens are added to it as each milestone restyles them, so a review point can always be looked at in one folder.

### Accessibility checks (`e2e/support/a11y.ts`)

`expectNoA11yViolations(page, context)` runs `AxeBuilder` with the tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, excludes the Next.js dev overlay (`nextjs-portal`), and on failure prints rule, impact, selector and the offending node so the failure is actionable. `accessibility.spec.ts` runs it per screen and state, for `colorScheme: 'light'` and `'dark'` (Playwright `page.emulateMedia`). Each screen milestone adds its screens to the file, so a screen is checked the moment it is restyled, not at the end.

### Mobile project

`playwright.config.ts` has `{ name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: [...] }` next to the desktop project. It runs a chosen subset, not the whole suite (every test would double the run time for little extra signal): `responsive-layout.spec.ts` (journey D3, which runs on both projects), and the core journeys `auth`, `access-and-dashboard`, `create-brunch`, `invitations-invitee`, `voting` and `confirm`. All of them passed at phone width with touch emulation unmodified. The journeys left on the desktop project only are about rules and data (permissions, emails, option management, timezones), which a screen size does not change. CI runs both projects; the local CI-mode run grew from 93 tests in 15.3s to 135 in 21.6s (about 6 seconds, 40%).

### Wide-screen layout

`--page-width` (68rem) is the wide app page, matching the prototype's 1080 to 1100px; `--content-width` (44rem) stays for one column of form content (the wizard, via `Container size="narrow"`). The top bar spans the page width. From 60rem the brunch and manage pages are two columns (`.columns` / `.column` in `detail.module.css`): on the brunch page RSVP, locations and times on the left and suggestions and invites on the right, on the manage page options on the left and voting, confirm and pending suggestions on the right. Each column is a consecutive group in the page order, so reading and tab order are unchanged, and a column with nothing in it disappears (`:empty`) and the other is centered at a reading width. The dashboard is a grid of cards (`repeat(auto-fill, minmax(20rem, 1fr))`). The single-column track is `minmax(0, 1fr)`: without it the track grows to its widest content (a phone date input) and the page scrolls sideways; the new layout check caught that.

### Accessibility token adjustments (fill as found)

| Date       | Token / pair                                                             | Was                                                                                                                                                  | Now                                                                                                                                                                                                                                          | Ratio before → after                                                                 | Found by                                    |
| ---------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------- |
| 2026-10-18 | `--accent-fg` as text on `--accent-soft` (dark mode: the Badge)          | `oklch(0.205 0.08 60)`, 1.55:1                                                                                                                       | new token `--accent-soft-fg: oklch(0.93 0.07 85)` (light mode keeps the old value)                                                                                                                                                           | 1.55 → about 9.5                                                                     | axe, D1/D2 dark, M3                         |
| 2026-10-18 | The whole dark palette, by choice (Review 3: "the yellow is too bright") | `--accent-strong: oklch(0.86 0.165 75)`, `--accent: oklch(0.815 0.155 78)`, `--accent-soft: oklch(0.345 0.06 78)`, `--surface: oklch(0.205 0.01 70)` | `--accent-strong: oklch(0.79 0.12 76)`, `--accent: oklch(0.76 0.115 78)`, `--accent-soft: oklch(0.3 0.04 78)`, `--surface: oklch(0.22 0.01 70)`, with lines, `--fg-muted`, `--accent-fg`, `--accent-soft-fg` and the butter Pop tile retuned | not a contrast fix: every pair still passes `tokenContrast.test.ts` in both palettes | the owner, from three palettes side by side |

Likely candidates, to check rather than assume: `--fg-subtle` text on `--bg`/`--surface`, `--accent` used as text or as a border on `--bg`, `--fg-muted` on `--surface-2/3`, and the dark-mode `--accent-soft` backgrounds.

---

## Decisions already made

- CSS Modules plus a global tokens file (ADR 0010); no Tailwind, no runtime CSS-in-JS, no component library
- Dark mode follows the OS; no toggle, no stored preference
- Nunito, Fraunces (Soft), JetBrains Mono via `next/font/google`; stroke icons, Pop icons, logo, wordmark and the breakfast scene as decorative inline SVG (no photographs, no image files)
- Restyle existing screens only; every other prototype component is in the parity table and ships with its feature
- No behavior, copy or accessible-name changes; existing journeys pass unmodified
- New numbering: styling is 0009, notifications follow-up is 0010
- Feedback is taken at fixed review points and triaged into in-scope / roadmap / copy; completion needs the owner's sign-off

## Decisions deferred (and when)

- Which existing journeys run on `mobile`: confirmed in M7 from what actually passes at phone width
- Whether the dashboard gets the "Next up" hero: decided in M3 after checking what `BrunchSummary` carries
- Copy/terminology pass: separate spec, timing is Open Question 2
- Dialog approach (hand-built vs headless library): with the first feature that needs a modal

---

## Risks and mitigations

| Risk                                                                                                             | Mitigation                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Restyling changes an accessible name or role and quietly breaks a locator (e.g. a `Field` wrapper moves a label) | Primitives must not alter names or roles; the existing journeys run at every milestone and must pass unmodified; a milestone that needs a journey edited stops and is discussed                                                                                                                                    |
| The June design looks wrong in the real app                                                                      | Review 1 happens after tokens only, before any screen is rebuilt; Review 2 after the first real screens; token edits are one-file changes                                                                                                                                                                          |
| Scope creep from visual feedback                                                                                 | The triage rule (in scope / roadmap / copy), one polish pass per review point, and "raise it first" for anything else                                                                                                                                                                                              |
| Contrast failures force changes to the designed palette                                                          | Axe runs from M1; adjustments are made in tokens and logged in the table above, with before/after ratios; the owner sees them at Review 1                                                                                                                                                                          |
| Dev-mode quirks: Next dev overlay flagged by axe, slower pages making axe flaky                                  | Exclude the overlay; scan after the page's own heading is visible; CI runs the production build and is the gate                                                                                                                                                                                                    |
| Font download fails at build (offline, firewall)                                                                 | Documented fallback to `next/font/local`; builds in CI have network                                                                                                                                                                                                                                                |
| Doubling the e2e project for `mobile` lengthens CI                                                               | A chosen subset, not the whole suite; time is measured in M7 and the subset trimmed if the job nears its limit                                                                                                                                                                                                     |
| oklch colors unsupported in an old browser                                                                       | Accepted (ADR 0010); revisit with real usage data                                                                                                                                                                                                                                                                  |
| Artwork brings its own colors (50 literals) and bloats the token file                                            | Group them as `--pop-*` and `--art-*` with a comment saying which illustration uses them; port only the icons an existing screen uses; decorative SVGs are `aria-hidden` so axe and the e2e locators are unaffected; contrast is not required for decorative art but is still checked wherever it sits behind text |
| Tokens drift because someone types a hex color in a component                                                    | `styleGuard.test.ts` runs in `pnpm test` and CI                                                                                                                                                                                                                                                                    |
| A large visual diff is hard to review                                                                            | Milestones are one area each; the screenshots folder makes a review a minute of looking, not a code read                                                                                                                                                                                                           |

---

## Test strategy

Per CLAUDE.md, no unit tests for framework or presentational code. What is checked, and how:

- **The look stays maintainable:** `styleGuard.test.ts` (unit, `pnpm test`), and `tokenContrast.test.ts`, which checks the contrast of the token pairs the app draws in both palettes, so a token edit that hurts readability fails immediately (added in M4).
- **Behavior and accessible names are unchanged:** the full existing e2e suite (`pnpm test:e2e`) at every milestone, then the stress run (`--workers=4 --repeat-each=3`) and CI mode (`CI=true pnpm build && CI=true pnpm test:e2e`) because a restyle is a user-facing change and dev and production builds differ (CSS Modules and font loading especially).
- **Accessibility:** axe in journeys D1/D2 (each milestone adds its screens), keyboard and reduced-motion in D4.
- **Phone layout:** the `mobile` project plus D3's no-horizontal-scroll assertion.
- **How a regression test is proven to fail:** see the E2E section of `spec.md` (a low-contrast token for axe, a fixed-width element for D3, a removed focus rule for D4, a hardcoded hex for the style guard).
- **Human review:** the screenshots folder at each review point, and the owner's sign-off on a real phone in M8. This is the one thing automation cannot replace and is a stated acceptance criterion.
