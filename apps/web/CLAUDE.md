# CLAUDE.md — apps/web (UI conventions)

Scoped to the web app. The repo-wide rules are in the root `CLAUDE.md`; why the styling is built this way is in [ADR 0010](../../docs/adrs/0010-css-modules-and-design-tokens.md) and `specs/0009-styling-foundation/`. The look comes from `prototype/` and `design-docs/` (reference only, never edited).

## The look lives in one place

- **`src/styles/tokens.css` is the only place a color, font family, radius, shadow, easing, size or spacing step is defined.** Components use `var(--…)`. A change to the look is an edit there (or one `next/font` declaration in `src/styles/fonts.ts`).
- **No color literal and no `font-family` outside `tokens.css`** (hex, `rgb()`, `oklch()`, a named color, `fontFamily`, an inline color style). `styleGuard.test.ts` fails the build on one. Artwork colors are tokens too (`--pop-*`, `--art-*`).
- **Dark mode follows the operating system** (`prefers-color-scheme`); there is no toggle and no stored setting. Every new color token needs a dark value in the media block.
- **When you add or change a color pair that carries text, an icon or a control border, add it to `tokenContrast.test.ts`.** It checks WCAG AA (4.5:1 text, 3:1 graphics and control borders) in both palettes. Where the prototype's colors fail AA, the token changes and the change is logged in the spec's plan.

## Writing components

- **CSS Modules, next to the component** (`Foo.tsx` + `Foo.module.css`). No Tailwind, no runtime CSS-in-JS, no component library (decide that with the first dialog or popover).
- **Compose the primitives in `src/components/ui/`** (Button, ButtonLink, Field, Card, Badge, Avatar, InlineAlert, Container, Hero, SkipLink) instead of restyling raw elements. Icons and artwork (`components/icons`, `components/art`) are inline SVG and always decorative (`aria-hidden`).
- **One primary action per screen** (Constitution 24): one `variant="primary"` button. Revoke/Remove are `danger`, everything else `secondary` or `ghost`.
- **Global element styles are zero-specificity (`:where()`)**, so a component's class always wins. A `<main>` that is not a `Container` or `Hero` still gets a width from the global rule; opt out explicitly.

## State

Why and what: [ADR 0011](../../docs/adrs/0011-redux-toolkit-for-client-ui-state.md), `specs/0010-redux-ui-state/`.

- **The store holds UI state only.** Business rules stay on the server and in `packages/core`. Brunch data stays in Server Components and is refreshed with `router.refresh()`; do not copy it into the store.
- **Per-request store, never a module-level one.** `makeStore` builds a fresh store; `StoreProvider` (`src/store/`) creates it once per mount. Server Components never touch Redux.
- **Components use only the typed hooks** (`useAppDispatch`, `useAppSelector`) and `createAppAsyncThunk` from `src/store/hooks.ts`. A mutation is a thunk that gets `fetch` from its `extra` argument, so it tests in node with a fake.
- **State must be serializable** (ISO strings, not `Date`; arrays, not `Set`). The check stays on.
- **A provider that outlives a page means state can too.** Every slice says how it is reset or reseeded on mount, and a journey proves it.
- **Slice or `useState`?** State that only one component reads (an input's text, a copied-to-clipboard flag) stays `useState`. A slice earns its place when several components read it, or when its rules (optimistic update, rollback) deserve unit tests.
- Test reducers, selectors and thunks; do not test that React renders (root `CLAUDE.md`).

## Accessible names are a contract with the e2e suite

The journeys find things by role, label and text. A restyle must not change them:

- Keep the exact visible text and the role of buttons, links, labels and headings. A `Field` keeps the control inside its `<label>`.
- **Do not add list items** to a page that does not already have them (journeys count `listitem`s), and keep each `<section>` with its own heading (a test helper finds the ballots that way).
- The text "Active", "Draft" and "Confirmed" appears exactly once where the status is shown (the status badge); the voting markers stay "— Confirmed".
- Messages keep their `role` (`role="alert"` stays where it was). `InlineAlert` adds none by itself.
- If a change does need a journey edited, stop and say so: that is a behavior change, not a restyle.

## Layout

- **Mobile-first.** Base styles are the phone layout; `min-width` media queries add the wider one. Nothing may scroll sideways (a grid track needs `minmax(0, 1fr)`, not `auto`).
- **Widths:** `Container` is the wide app page (`--page-width`, 68rem); `size="narrow"` is one column of form content (`--content-width`, the wizard); `Hero` is a centered column on the gradient. On a wide screen a page uses two columns from 60rem (`.columns` / `.column` in `brunch/[id]/detail.module.css`); each column is a consecutive group in page order, so reading and tab order do not change.
- **Touch targets are at least 44px** (a `sm` button grows to 44px on a touch screen). Focus is always visible. Animation respects `prefers-reduced-motion` (the base styles reduce it; do not undo that).

## Checking a screen

- **Axe** (`e2e/journeys/accessibility.spec.ts`, journey D2): add every new screen and state, in light and dark.
- **Layout** (`responsive-layout.spec.ts`, D3): add the screen so it is checked for sideways scrolling and its main action on screen, on a desktop and a phone. The `mobile` Playwright project runs a chosen subset of journeys at phone width; add a journey there when it is part of the core path.
- **Keyboard and motion** (`keyboard-and-motion.spec.ts`, D4) when a screen adds a main path.
- **Look at it:** `pnpm --filter @brunchsters/web screenshots` writes every screen (light/dark, desktop/tablet/phone) to `apps/web/.screenshots/`. Add the new screen to `e2e/screenshots/review.spec.ts`.
- Per the root `CLAUDE.md`, a new or changed user-facing screen also needs its journey; styling-only changes need `pnpm test:e2e` to pass unmodified.
