# apps/web

The Next.js app (App Router, TypeScript strict, CSS Modules on design tokens, Redux Toolkit for shared UI state).

- **UI conventions** (tokens, primitives, the accessible-names contract with the e2e suite, phone rules, voice and copy, layout): [`CLAUDE.md`](CLAUDE.md) in this folder. It is written for people and for Claude; read it before touching a screen.
- **Why it is built this way:** [ADR 0010](../../docs/adrs/0010-css-modules-and-design-tokens.md) (styling), [ADR 0011](../../docs/adrs/0011-redux-toolkit-for-client-ui-state.md) (state), [ADR 0012](../../docs/adrs/0012-design-fidelity-and-presentation-rules.md) (design fidelity and where presentation rules live).
- **The design reference:** `prototype/` and `design-docs/` at the repo root (reference only, never edited), and `design-docs/Brand Voice.html` for the voice.
- **Running it, testing it, looking at it:** [`docs/SETUP.md`](../../docs/SETUP.md) (local setup, e2e, the screenshot and board commands, manual testing).

There are no committed screenshots on purpose: a picture of a screen goes stale the first time the screen changes. Generate them when you need them (`pnpm --filter @brunchsters/web screenshots`, then `boards`); they are written to the git-ignored `.screenshots/` folder.
