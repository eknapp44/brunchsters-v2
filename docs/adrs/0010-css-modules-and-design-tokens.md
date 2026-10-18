# 0010 — CSS Modules and design tokens for the web UI

**Date:** 2026-10-18  
**Status:** Accepted  
**Deciders:** Evan Knapp

## Context

Every screen in `apps/web` is unstyled HTML: there is no stylesheet, no `className` anywhere, and no styling library. A complete design exists in `prototype/` and `design-docs/` (made with Claude Design in about June 2026): plain-CSS tokens in `prototype/styles/tokens.css`, a `.bs-*` component stylesheet, an accessibility pass, and an Engineering Handoff. It was made in a prototype, not against the real app, and its author expects to change their mind about parts of it once it runs.

Two needs pull against each other. The look must be **easy to revise** (Constitution 8 — optimize for change): fonts, colors, spacing and radii will be adjusted after seeing real screens. And every later feature spec (inbox, cancel and change, Quick Brunch, ...) needs styled UI built the same way, without each one re-deciding how to style. Constitution 23–26 add: content first, one primary action per screen, familiar patterns, mobile-quality on every device.

Also relevant: the e2e suite finds elements by role and accessible name (ADR 0007), so a styling method must not require changing markup semantics; and `packages/core` must stay framework-free, so styling lives only in `apps/web`.

## Decision

1. **CSS Modules plus one global tokens file.** Presentation lives in `*.module.css` next to the component that uses it. Next.js supports CSS Modules without configuration or a new dependency.
2. **Tokens are the only place a color, font family, radius, shadow, easing or type size is defined.** They are CSS custom properties in `apps/web/src/styles/tokens.css`, ported from the prototype's `tokens.css`. Component CSS refers to `var(--…)`. A unit test (`styleGuard.test.ts`, same idea as `e2e/support/guard.test.ts`) fails if a color literal or a `font-family` appears outside the tokens file, so "change it in one place" stays true.
3. **Dark mode follows the operating system** with `@media (prefers-color-scheme: dark)` redefining the dark token values. There is no toggle and no stored setting (Constitution 2). The prototype's `[data-theme="dark"]` selector is not carried over.
4. **Fonts through `next/font/google`:** Nunito (body), Fraunces with the Soft axis (display: wordmark, headings, brunch titles) and JetBrains Mono (labels). They are downloaded at build time and served from our own origin, with no runtime request to Google. The prototype's `tokens.css` says Inter while its HTML and the Engineering Handoff say "Nunito + Fraunces (Soft) is locked"; Nunito is treated as correct.
5. **A small primitive layer in `apps/web/src/components/ui/`** (Button, Field, Card, Badge, InlineAlert, and similar) holds the shared look. Screens compose primitives; page files and feature components carry layout only.
6. **Icons:** the prototype's stroke icon set, ported as typed React components. The colored "Pop" set is deferred.
7. **The prototype is the source of truth for the look, and accessibility overrides it.** Where a token pair fails WCAG 2.1 AA (found by the axe scan added in the same spec), the token is changed and the change is recorded in the spec's plan. `prototype/` and `design-docs/` stay in the repo unchanged as reference.
8. **Terminology is not touched by styling.** UI copy stays as written; a copy pass is a separate piece of work, because strings are inline in components and the e2e journeys locate elements by them.

## Consequences

**Easier**

- Changing the palette, background, fonts, radii or spacing scale is an edit to `tokens.css` or one `next/font` declaration, with no component edits. This is the main reason for the choice.
- No new runtime dependency; nothing to upgrade or to be locked into.
- Scoped class names make dead CSS and collisions unlikely; deleting a component deletes its styles.
- Server components work as normal (no runtime style injection).
- Later feature specs get a ready vocabulary of primitives and tokens.

**Harder**

- More files than a single stylesheet, and styles live apart from the JSX (no utility classes to read in place).
- Moving the `.bs-*` prototype styles into modules is manual work, screen by screen.
- Builds need network access the first time fonts are fetched (`next/font/google`). Switching to committed font files (`next/font/local`) is a one-file change if that becomes a problem.
- The token oklch colors need a reasonably current browser (Chrome 111, Safari 15.4, Firefox 113 or later). Acceptable for a web app aimed at friends' phones in 2026; revisit if analytics ever show otherwise.
- The style-guard test constrains authors (no inline hex colors); that is the intent.

**Not decided here:** a component library for complex widgets. Dialogs, popovers and menus (share sheet, mute control, modals in the prototype) arrive with their features. When the first one does, that spec decides between hand-built and a headless library such as Radix; this ADR does not pre-empt it.

## Alternatives considered

- **Tailwind CSS.** Fast to iterate and widely used, with tokens mapped into its theme. Rejected for now because the prototype's design is already plain CSS (a port, not a rewrite), because it adds a dependency and build configuration, and because markup would carry the style decisions, which makes a later "change how cards look" a many-file edit unless wrapped in primitives anyway. Not a bad choice; a close second.
- **One global stylesheet (as the prototype does).** Quickest to start. Rejected: class-name collisions and dead CSS accumulate in a growing app.
- **Runtime CSS-in-JS (styled-components, Emotion).** Rejected: awkward with React Server Components and the App Router, and it adds runtime cost.
- **A full component library (MUI, Chakra, shadcn/ui).** Rejected: it would impose its own look over a finished design, and most of its surface (complex widgets) is not needed yet.
- **A theme toggle with a stored preference.** Rejected for v1 (Constitution 2); the operating system setting is the default most people already expect.
