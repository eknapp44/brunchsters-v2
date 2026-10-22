---
name: ui-screen
description: Build or change a Brunchsters screen the way the project wants it done - read the UI conventions, list the accessible names and journeys a change touches before editing, compose the primitives and tokens, apply the phone and voice rules, cover axe, layout and screenshots, and review it on boards. Use when adding or restyling a page, a panel, a control, or any user-visible copy.
---

# ui-screen

A checklist for any change a person can see. It exists because spec 0011 (design fidelity) learned each of these the slow way. It does not replace `apps/web/CLAUDE.md` (the rules) or `/milestone-done` (the close-out); it is the order to work in. Do not start without a spec if the change is a real feature (`/spec-grill`).

## 1. Read before touching anything

- `apps/web/CLAUDE.md`, all of it: tokens, primitives, State, the accessible-names contract, Layout, Phone, Voice and copy, Derived presentation rules.
- The screen's current code and its journeys (`grep` the screen's headings and button names under `apps/web/e2e/`). For a screen that exists in the prototype, look at its board first (`pnpm --filter @brunchsters/web screenshots`, then `boards`; output in `apps/web/.screenshots/`) so the change starts from what is on screen, not from memory.
- Any ADR that touches it (0010 styling, 0011 state, 0012 design fidelity and where presentation rules live).

## 2. List the names you will change, before changing them

Write down, in the spec's `tasks.md` or the PR, every **accessible name** the change touches (a button's text, a link, a label, a heading, a landmark) and every journey that finds it by that name. A copy change is a journey change (`apps/web/CLAUDE.md`, "Accessible names are a contract"). If a journey must be edited, say so; do not loosen it to make it pass. Rules people can observe (who sees what, when something locks) need a journey too (root `CLAUDE.md`, "User-facing changes keep the E2E suite honest").

## 3. Build it from the pieces that exist

- **Tokens only** (`src/styles/tokens.css`): no color literal, no `font-family`, no new size outside it. New color pairs that carry text go in `tokenContrast.test.ts`, light and dark.
- **Primitives first** (`src/components/ui/`): Button, ButtonLink, Field, Card, Badge, InitialsAvatar, Eyebrow, DateTile, InlineAlert, Container, Hero. One primary action per screen. CSS Modules beside the component.
- **Rules are not in components.** Anything the screen shows that depends on a rule (leading, vote waiting, next up, past, who may see whose name) is a pure, unit-tested function in `packages/core`; the component formats and draws it.
- **State:** shared or rule-bearing UI state is a Redux slice with a thunk; one control's input stays `useState` (`apps/web/CLAUDE.md`, State). A new async operation says what happens when its result lands after a reset, unmount or second click, and a test covers it.
- **Access:** a new brunch-scoped page or endpoint establishes membership first (404 for an outsider, identical to a made-up id; 403 for a member without the privilege, via `forbidden()`), and gets a case in the access journeys.

## 4. Phone and voice

- **Phone is the base style.** Decide what the screen leaves out at phone width: repetition and secondary lines, never the only source of a fact. Rows go vertical; long lists show a few plus "+N more". Touch targets are at least 44px. Nothing scrolls sideways.
- **Voice** (`design-docs/Brand Voice.html`, the copy table in `specs/0011-design-fidelity/plan.md`): a friend, not a service; verbs over nouns; emoji at moments and always `aria-hidden`; never promise what the app does not do. Error wording belongs to the feedback-surfaces spec until it lands.
- Do not leak through copy: a 404 says nothing about what was looked for; the invite preview shows only the host, title and description.

## 5. Cover it

- **Axe** (journey D1 for signed-out pages, D2 for signed-in), **layout** (D3), **keyboard and motion** (D4) for a new main path: add the screen and every state, light and dark.
- A **journey** for the behavior, in the right file, with the new words in `e2e/support/pages.ts` (or the nearest support file) so a wording change is one edit.
- Add the screen to `e2e/screenshots/review.spec.ts` under its area folder (`captureReviewShots(page, 'area/state', testInfo)`), and a pair to `scripts/boards.ts` if the prototype has a scene for it.
- **Prove the new journey can fail** (copy the production file, break the behavior, run only that journey, restore from the copy; `/milestone-done` step 3).

## 6. Look at it, then stop for review

Run `screenshots` and `boards`, open the phone and desktop shots in both palettes, and read them as the owner would (dark mode is a real theme; a crowded phone is a finding). Post what you changed, what you left out on a phone and why, and the names that changed. The owner reviews boards at milestone boundaries; do not start the next piece before they have.

## Traps (each cost time once)

- Shell heredocs and `node -e "..."` with backticks or nested quotes corrupt template literals; use the Edit and Write tools or a script file in the scratchpad, then re-run typecheck.
- Prettier reformats whatever is staged; never write the reference files (`prototype/`, `design-docs/`) through the hook (`.prettierignore` covers them).
- Reading page text right after `goto` can be empty until it paints: wait for a heading first.
- A typed value can be lost if it lands before hydration: prefer an uncontrolled field for inputs read on submit.
- Counting `listitem`s is a journey contract: do not add list items to a page that has none.
