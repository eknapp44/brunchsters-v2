# CLAUDE.md — apps/web (UI conventions)

Scoped to the web app. The repo-wide rules are in the root `CLAUDE.md`; why the styling is built this way is in [ADR 0010](../../docs/adrs/0010-css-modules-and-design-tokens.md) and `specs/0009-styling-foundation/`. The look comes from `prototype/` and `design-docs/` (reference only, never edited).

## The look lives in one place

- **`src/styles/tokens.css` is the only place a color, font family, radius, shadow, easing, size or spacing step is defined.** Components use `var(--…)`. A change to the look is an edit there (or one `next/font` declaration in `src/styles/fonts.ts`).
- **No color literal and no `font-family` outside `tokens.css`** (hex, `rgb()`, `oklch()`, a named color, `fontFamily`, an inline color style). `styleGuard.test.ts` fails the build on one. Artwork colors are tokens too (`--pop-*`, `--art-*`).
- **Dark mode follows the operating system** (`prefers-color-scheme`); there is no toggle and no stored setting. Every new color token needs a dark value in the media block.
- **When you add or change a color pair that carries text, an icon or a control border, add it to `tokenContrast.test.ts`.** It checks WCAG AA (4.5:1 text, 3:1 graphics and control borders) in both palettes. Where the prototype's colors fail AA, the token changes and the change is logged in the spec's plan.

## Writing components

- **CSS Modules, next to the component** (`Foo.tsx` + `Foo.module.css`). No Tailwind, no runtime CSS-in-JS, no component library (decide that with the first dialog or popover).
- **Compose the primitives in `src/components/ui/`** (Button, ButtonLink, Field, Card, Badge, InitialsAvatar, Eyebrow, DateTile, DateTimeInput, InlineAlert, Container, Hero, SkipLink) instead of restyling raw elements. Icons and artwork (`components/icons`, `components/art`) are inline SVG and always decorative (`aria-hidden`). A `Badge` may carry a decorative icon; the butter panel is `Card tone="accent"`.
- **A person is initials on a color, never a photo** (`InitialsAvatar`, ADR 0012). Photos wait for a Settings spec with an opt-in. Pass a stable `seed` (an id, or an email for someone who has not signed in); use `decorative` only where the name is written beside it.
- **A date-and-time field is a `DateTimeInput`** (with a `placeholderText` like "Add a time"), never a bare `<input type="datetime-local">`: the browser's own blank ("mm/dd/yyyy --:-- --") cannot be restyled, so the primitive covers it while the field is empty and unfocused (in browsers that allow it) and keeps the accessible name from `aria-label` or the wrapping `Field`.
- **A date shown in the viewer's own zone is a `<LocalDateTime>`**, never `toLocaleString(undefined, …)` in a component (a lint rule fails it). The server formats in its own zone (UTC on Vercel) and the browser in the viewer's, React reports the difference as a hydration mismatch and rebuilds the page, and anything a person typed before it finished loading is lost (journey H8). `LocalDateTime` says it in UTC (labelled) on the server and switches to the viewer's reading after hydration. A place's time in the place's own zone passes an explicit locale and `timeZone` instead.
- **One primary action per screen** (Constitution 24): one `variant="primary"` button. Revoke/Remove are `danger`, everything else `secondary` or `ghost`.
- **A control that must wait is `aria-disabled`, not `disabled`** (spec 0012: a limit holds it back): it looks disabled (`Button` styles `[aria-disabled='true']` like `:disabled`), the component ignores the click, and it stays in the tab order so its reason can be read (`aria-describedby` points at the line beside it). **The wait is the server's, not the browser's:** the brunch page asks the counters as it loads (`getInviteWaits` in core, which uses the limiter's read-only `peek`) and passes the answer to the panels as props; `useWait` (`src/lib`) shows it, shows a 429 at once, and lets go when the time is up. A control that gets a 429 calls `router.refresh()` so the page's answer replaces its own, and every control on the page then agrees. Nothing is stored in the browser, so another tab, device or cleared site data shows the same thing. A new waiting control needs its question added to `getInviteWaits` (or a sibling in core), not a storage key. `limitedMessage` has the wording and `readRateLimit` reads a 429. Playwright treats an `aria-disabled` button as not clickable and waits forever, so a journey that proves pressing it does nothing uses `click({ force: true })`, and one that switches the color scheme must do it before loading the page (a live switch measures buttons halfway through their color transition).
- **Global element styles are zero-specificity (`:where()`)**, so a component's class always wins. A `<main>` that is not a `Container` or `Hero` still gets a width from the global rule; opt out explicitly.

## Limits and the Content-Security-Policy

Why and what: [ADR 0013](../../docs/adrs/0013-rate-limits-in-postgres.md), [ADR 0014](../../docs/adrs/0014-content-security-policy-with-nonce.md), `specs/0012-security-hardening/`.

- **A control that can be told to slow down reads a 429 with `readRateLimit` and words it with `limitedMessage`** (`src/lib`). Only the invite panel, the suggestion approval and the place search do so today; every other control shows its generic error until the feedback-surfaces spec, which is also when the wizard stops ignoring a refused invite batch. How a waiting control behaves (`aria-disabled`, `useWait`) is in "Writing components".
- **A new API route that changes something calls `enforceWriteLimit` right after its session check** (root `CLAUDE.md` has the rule and the order; the scanning test fails otherwise). Never key a limit by an id the caller merely named.
- **A new email, or a new use of the paid Places API, is caught by a test until it has a budget** (root `CLAUDE.md` names the tests): a new email event needs a decision in `emailBudgets.test.ts`, and a new file that reaches Places has to be added to `routeLimits.test.ts` on purpose. The failure message says what to do.
- **No inline `<script>` and no inline event handler** (`onclick=`, `onerror=`): the policy refuses both, by design. Scripts come from Next's own bundles.
- **A `style=""` attribute is for computed values only** (a width from data, like the vote and step bars). It is allowed (`style-src-attr`), but anything that does not depend on data belongs in a CSS Module class.
- **A new outside origin (analytics, a map, photos from Google) is a policy change**, made in `src/lib/contentSecurityPolicy.ts` with its test, and journey S3 is rerun on a production build (`docs/SETUP.md`, "Rate limits and the Content-Security-Policy"). That deliberate step is the feature: it is how a photo opt-in (the Settings spec) will have to arrive.

## State

Why and what: [ADR 0011](../../docs/adrs/0011-redux-toolkit-for-client-ui-state.md), `specs/0010-redux-ui-state/`. Today the wizard (`wizardSlice`), the vote ballots (`ballotsSlice`, `useBallot`) , RSVP, the invite panel and the voting controls (the shared `useMutation`, below) are on the store; every other control still uses `useState` until spec 0014 moves it (M4; see "Moving another control onto the store").

- **The store holds UI state only.** Business rules stay on the server and in `packages/core`. Brunch data stays in Server Components and is refreshed with `router.refresh()` (called from the component); do not copy it into the store.
- **Per-request store, never a module-level one.** `makeStore` builds a fresh store; `StoreProvider` (`src/store/`) creates it once per mount. Server Components never touch Redux.
- **The provider lives in the `(authenticated)` layout, and that placement is a rule.** Leaving the signed-in area (sign-out) unmounts it and drops every draft, so nothing one person typed can reach the next person to sign in on that browser. Do not move it to the root layout unless sign-out clears the store.
- **The boundaries are lint errors** (`eslint.config.mjs`): components use `useAppDispatch` / `useAppSelector` and thunks use `createAppAsyncThunk` from `src/store/hooks.ts`; only `makeStore.ts` calls `configureStore`.
- **A mutation is a thunk** that gets `fetch` from its `extra` argument, so it tests in node with a fake. Give it a `condition` when a second call during the first must do nothing (a double submit, a click on a read-only control). Optimistic update and rollback live in the thunk's `pending` and `rejected` reducers, which read `meta.arg`, so they are pure.
- **Selectors live beside their slice** (`selectWizard`, `selectBallotEntry`); components do not reach into `state.x.y` inline.
- **State must be serializable** (ISO strings, not `Date`; arrays, not `Set`). The check stays on.
- **A provider that outlives a page means state can too.** Every slice says how it is reset or released (the wizard resets on unmount; ballot entries are released on unmount), ignores a late response that lands after that, and a journey proves it (R1, R2).
- **Slice or `useState`?** State only one component reads (an input's text, a copied-to-clipboard flag) stays `useState`. A slice earns its place when several components read it, or when its rules (optimistic update, rollback, stale-id filtering) deserve unit tests.
- Test reducers, selectors and thunks; do not test that React renders (root `CLAUDE.md`).

### Shared mutations and toasts (spec 0014, ADR 0016)

- **A control's request is `useMutation(key)`** (`src/store/useMutation.ts`): `run({ request, success?, failure })` dispatches the one `runMutation` thunk under a key of the control's own (`rsvp:<brunchId>`), reads `pending` and `failure`, and the control does `router.refresh()` when `run` resolves true. No `fetch`, no `submitting`/`error` pair, no failure string in a component. The second tap on a key in flight does nothing (the thunk's `condition`); a result from an earlier request is ignored.
- **A pending control is `aria-disabled`, not `disabled`**, so keyboard focus stays on the button that was pressed (a disabled button drops it).
- **Where a failure shows is the caller's choice:** `failure: 'toast'` for a one-tap result, `'inline'` for what the person has to fix or wait out (render `failure.text` in an `InlineAlert` where the old error line was). A 429 on a control with a wait surface is that control's own inline line (`useWait`), never a toast: pass `ownsWait: true` and start the wait from `result.failure.rateLimit`. A one-tap action with nothing to fix (resend, revoke, close voting) fails as a toast; a control with a field the person typed into (send an invite, save a deadline) fails inline beside it; a ballot rolls back and keeps its line inline.
- **Failure words are `errorCopy`'s, from the code the route sent** (`packages/shared/src/apiError.ts`); a route builds its errors with `apiError()` (`src/lib/apiErrorResponse.ts`). Success words are in a `lib/*Copy.ts` (`toastCopy.ts`), never inline.
- **A journey that asserts a toast did _not_ appear takes one non-retrying look** (`expect(await locator.count()).toBe(0)` after a short settle): `toHaveCount(0)` retries, so it waits for the toast to time out and passes (found in M3: the first version of that journey stayed green with the behavior broken).
- **Never import Zod into code that runs in the browser:** Zod 4 probes with `new Function`, which the CSP reports (journey S3 fails). Read a response body by hand there.

### Moving another control onto the store

The remaining controls (RSVP, invites, suggestions, option management, voting controls, confirmation, suggestion review) each own a `submitting`/`error` pair, a `fetch` and a `router.refresh()`. They move together, not one slice each, when the toast / visible-error spec lands (`docs/BACKLOG.md` "Redux follow-ups"). Until then a **new** control follows the same shape rather than inventing another: if several components will read its state or it has rules worth unit tests, add a slice and a `createAppAsyncThunk` (copy `ballotsSlice.ts`); otherwise keep `useState`, with the same generic error string and `role="alert"` as its neighbours. When migrating a control: keep its text, roles and accessible names (the e2e contract below), keep the generic error message, add a thunk test per failure path, and prove the journey that covers it fails without the new rule.

## Accessible names are a contract with the e2e suite

The journeys find things by role, label and text. A restyle must not change them:

- Keep the exact visible text and the role of buttons, links, labels and headings. A `Field` keeps the control inside its `<label>`.
- **A confirm dialog is `ConfirmDialog`** (`components/ui/`): a native `<dialog>` with `showModal()`, the first dialog in the app, no library. Words are in `lib/lifecycleCopy.ts`. The safe choice is the default focus and is a `secondary` button.
- **Do not add list items** to a page that does not already have them (journeys count `listitem`s), and keep each `<section>` with its own heading (a test helper finds the ballots that way).
- The text "Active", "Draft" and "Confirmed" appears exactly once where the status is shown (the status badge); the voting markers stay "— Confirmed".
- Messages keep their `role` (`role="alert"` stays where it was). `InlineAlert` adds none by itself.
- If a change does need a journey edited, stop and say so: that is a behavior change, not a restyle.
- **Names changed on purpose are logged in `docs/accessible-names.md`** (spec 0011 design fidelity, spec 0013 brunch lifecycle). Read it before renaming a button, link, label or heading, and add to it when you do. Two rules from it that bite: a name that is a substring of another matches it in `getByRole` (use `exact: true` or a distinct name), and an icon-only control keeps its words as `aria-label` and `title`.
- **The dashboard's only list items are the brunch rows.** The next-up roster is plain grouped text (`role="group"`), because journeys count `listitem`s.

## Layout

- **Mobile-first.** Base styles are the phone layout; `min-width` media queries add the wider one. Nothing may scroll sideways (a grid track needs `minmax(0, 1fr)`, not `auto`).
- **Widths:** `Container` is the wide app page (`--page-width`, 68rem); `size="narrow"` is one column of form content (`--content-width`, the wizard); `Hero` is a centered column on the gradient. On a wide screen a page uses two columns from 60rem (`.columns` / `.column` in `brunch/[id]/detail.module.css`); each column is a consecutive group in page order, so reading and tab order do not change.
- **Touch targets are at least 44px** (a `sm` button grows to 44px on a touch screen). Focus is always visible. Animation respects `prefers-reduced-motion` (the base styles reduce it; do not undo that).

## Phone

Phone is the base style and the place to be strict about space (spec 0011). Leave things out instead of squeezing them:

- **Drop repetition and secondary lines, never the only source of a fact.** Allowed: a count that repeats a heading, a helper line under a list heading, a chip that repeats the header's, the top bar's name (visually only: it stays in the accessibility tree), the wizard's top Cancel when the footer has one. Not allowed: hiding something a person could not learn elsewhere on the same screen.
- Rows go vertical on phone (a date tile, then the title, one line, then the pill and count) and long lists show a few items plus "+N more" (the next-up roster shows three).
- Collapsing sections is not used yet; it is decided after a real-phone review (`docs/BACKLOG.md`). Do not add collapsible or auto-collapsing sections without that decision.
- A change to a screen is judged on the phone board as well as the desktop one.

## Voice and copy

**Read `docs/voice-and-copy.md` before writing or changing a string:** the rules, the words to reach for and avoid, and the patterns (dialogs, waits, empty states, errors, emails) with shipped examples. The sources it is distilled from are `design-docs/Brand Voice.html` and `design-docs/Copy Pass.html`; what spec 0011 adopted, adapted and refused is the copy table in `specs/0011-design-fidelity/plan.md`. A feature's strings live in a tested `lib/*Copy.ts` module.

- **Friend, not service.** Verbs over nouns, specific over generic, no corporate words (event, attendees, leverage, engage, community, "action required", "successfully").
- **Emoji at moments, not in labels that carry state.** Greetings, celebrations, the empty state. Emoji are always `aria-hidden`, so the accessible name is the words ("I'm in", not "🙌 I'm in"). The RSVP buttons are the one place an emoji sits in a control, by the owner's choice.
- **Do not promise what the app does not do** (no "we'll try again" without a retry). Error wording belongs to the feedback-surfaces spec; the generic error strings stay as they are until then.
- **Status wording on the dashboard is a display mapping** (`src/lib/brunchCopy.ts`, M2), not a change to the status lookup table; the brunch page badge keeps the lookup label and the exact-text rule below. A test fails when a seeded status code has no mapping.
- A copy change is a journey change: list the names it touches before making it.

## Derived presentation rules live in core

Anything a screen shows that depends on a rule (the leading option, "a vote is waiting on you", which brunch is next up, whether a brunch is past, who may see whose name) is a pure function in `packages/core`, unit-tested, and the Server Component only formats and draws it (ADR 0012). A component never decides who is leading or who may see a name. The roster is a service with the membership check first; its member view has no type for an email, an id, or a "no" name.

## Checking a screen

- **Axe** (`e2e/journeys/accessibility.spec.ts`, journey D2): add every new screen and state, in light and dark.
- **Layout** (`responsive-layout.spec.ts`, D3): add the screen so it is checked for sideways scrolling and its main action on screen, on a desktop and a phone. The `mobile` Playwright project runs a chosen subset of journeys at phone width; add a journey there when it is part of the core path.
- **Keyboard and motion** (`keyboard-and-motion.spec.ts`, D4) when a screen adds a main path.
- **Look at it:** `pnpm --filter @brunchsters/web screenshots` clears and rewrites `apps/web/.screenshots/app/<area>/<state>-<light|dark>-<desktop|tablet|phone>.png` for every screen (the folder is git-ignored; nothing compares against it). Add the new screen to `e2e/screenshots/review.spec.ts`. `pnpm --filter @brunchsters/web boards` then puts the prototype next to each screen (`.screenshots/boards/<screen>-<light|dark>-<device>.png`); a design-fidelity milestone is reviewed with those, light and dark, desktop and phone.
- Per the root `CLAUDE.md`, a new or changed user-facing screen also needs its journey; styling-only changes need `pnpm test:e2e` to pass unmodified.
