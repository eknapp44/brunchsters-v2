# Spec 0009 — Styling Foundation

**Status:** In progress (M1 complete, awaiting Review 1)  
**Branch:** `feat/0009-styling-foundation`  
**PLANNING.md ref:** §1 design principles, §16 Build Order #9 (UI), Constitution V (Design Principles 23–26)  
**ADRs:** [0010 — CSS Modules and design tokens](../../docs/adrs/0010-css-modules-and-design-tokens.md)

> **Numbering note.** `PLANNING.md` used to reserve "spec 0009" for the notifications follow-up (in-app inbox, preferences, mute, realtime, reminders, host-facing emails). Directories are numbered in the order they are written, so styling is 0009 and **the notifications follow-up becomes 0010**. The docs commit that adds this spec updates `PLANNING.md` and spec 0008's references to say so.

---

## What

Give every screen that exists today the look it was designed to have, and put in place the tokens and building blocks that every later feature will use, so the app is something to show friends.

Today the UI is functional but bare HTML. A full design exists in `prototype/` and `design-docs/` (from about June 2026, made in Claude Design, not against the real app). This spec implements it for the existing screens, and keeps it **cheap to change**: the author expects some of it to change after seeing it running, and the app's look is a large part of how it will be judged.

Grounded in the current code:

- There are **no CSS files, no `className`, and no styling library** anywhere in `apps/web`. The one `<img>` is the avatar in the root layout's `<nav>`. `apps/web/src/app/page.tsx` is a "Coming soon." placeholder at `/`.
- The root layout (`apps/web/src/app/layout.tsx`) renders the nav (avatar, name, a "Sign out" button) for signed-in users; `(authenticated)/layout.tsx` is a pass-through.
- The screens to restyle are the 8 below, built across specs 0003–0005: sign-in, the landing page, the dashboard, the creation wizard (`brunch/new`, four steps driven by a reducer), the brunch detail page (with `RsvpControl`, `BallotChecklist`, `InvitePanel`, `SuggestionsPanel`, `OptionSuggestionControl`), the host's manage page (`OptionManager`, `VotingControls`, `ConfirmControl`, `OptionSuggestionReview`), and the public invite landing page.
- The e2e suite (20 journey files, over 300 role, label and text locators) finds elements by accessible name, so a restyle must leave names and roles intact; the existing journeys passing unchanged is the regression proof.
- Spec 0006 deliberately deferred two things to "the styling spec": an **axe accessibility scan** (it would only flag unstyled pages) and any **mobile-viewport** coverage (ADR 0007's trigger was "before going public"). Both are in scope here.
- The design material disagrees with itself in one place: `prototype/styles/tokens.css` names Inter as the body font, while the prototype HTML and the Engineering Handoff say "Nunito + Fraunces (Soft) is locked". Nunito is used.
- Much of the prototype shows features that have no backend yet (cancel and change, delete account, plus-ones, mute, inbox, Quick Brunch, share sheet, push prompt, photo upload). Building them is not styling. They are tracked in the **parity table** below and ship with their own feature specs, using this spec's foundation.

### Principles for this spec

1. **Tokens are the single source of the look.** A change to a color, font, radius, shadow or spacing is a tokens edit, not a hunt through components (ADR 0010).
2. **Look, not behavior.** No change to behavior, routes, accessible names or copy. Copy and terminology are a separate pass (see "Does not cover").
3. **Accessibility overrides the prototype.** Where the design fails WCAG 2.1 AA, the token changes, and the change is written down.
4. **The owner signs off on the look.** Green checks prove it works and is accessible; only the owner can say it is right to show friends. The spec is not complete until that sign-off, and it is taken in stages (see "Review points").

---

## Review points and feedback

Visual work is judged by eye, so feedback is part of the plan, not an afterthought, and it is time-boxed so it cannot grow without end.

| When                         | What the owner reviews                                                                     | What can change                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| **Review 1 — end of M1**     | Tokens and fonts applied to the real, still-plain pages, light and dark                    | Anything in tokens and fonts: nearly free at this point                          |
| **Review 2 — end of M3**     | The first real screens: nav, sign-in, landing, dashboard, invite landing, light/dark/phone | Tokens, primitives, and the layout of those screens, before later ones copy them |
| **Review 3 — end of M7**     | Every screen, light/dark, desktop and phone, axe clean                                     | Feeds the polish pass                                                            |
| **M8 — polish and sign-off** | The whole app, on a real phone and desktop                                                 | Free-form visual tweaks within the rule below; ends with the owner's sign-off    |

**How feedback is given and recorded.** `pnpm --filter @brunchsters/web screenshots` writes screenshots of every key screen (light and dark, desktop and phone widths) into a git-ignored folder, so both people look at the same pictures. A screenshot plus "this feels cramped" is a complete piece of feedback. The phone-sized screenshots are an emulated phone; a real phone can only see signed-in screens once the app is deployed or tunnelled, because Google sign-in does not accept a local network address (details in `docs/SETUP.md`). Every piece of feedback goes in the **Feedback log** in `tasks.md` with one of three outcomes:

- **In scope now:** tokens, spacing, sizing, colors, fonts, and the layout of screens that exist. One polish pass per review point, plus M8.
- **Roadmap:** anything that adds or changes a behavior, screen or control. It goes to the parity table with the feature that will carry it.
- **Copy:** wording and terminology go to a list for the follow-up copy spec, so no locator silently breaks.

Feedback that fits none of these is not changed on the spot: it is raised with the owner first (CLAUDE.md: surface conflicts, do not improvise).

---

## User flows

No flow changes. The same journeys, with the intended look:

1. A visitor opens `/`, sees the Brunchsters landing, and signs in with Google
2. A signed-in person lands on the dashboard: their upcoming and past brunches as cards, a clear primary action to plan a brunch
3. A host plans a brunch through the four-step wizard, and manages options and confirmation on the manage page
4. An invitee opens an invite link (signed out: a preview with a sign-in action; signed in: lands on the brunch), RSVPs and votes
5. Everything above works on a phone-sized screen and follows the device's light or dark setting

---

## Acceptance Criteria

### Foundation (`apps/web`)

- [ ] `apps/web/src/styles/tokens.css` defines the light tokens ported from the prototype and redefines them under `@media (prefers-color-scheme: dark)`; `color-scheme: light dark` is set; the global base styles (reset, body font, focus ring, reduced motion, skip link) are in a global stylesheet imported by the root layout
- [ ] Fonts load through `next/font/google` (Nunito, Fraunces Soft, JetBrains Mono), exposed as the `--font-sans`, `--font-display` and `--font-mono` tokens
- [ ] `styleGuard.test.ts` fails if a color literal or a `font-family` appears in any `*.module.css` or `*.tsx` outside the tokens/global files (proven to fail by adding one)
- [ ] Shared primitives exist in `apps/web/src/components/ui/` for what the screens actually use, and screens compose them; the stroke icons, the Pop icons, the logo mark, the wordmark and the breakfast-scene illustration are ported as typed inline-SVG components (decorative, `aria-hidden`), with their colors as tokens (the Pop palette and an `--art-*` group, light and dark), not literals
- [ ] Layouts are mobile-first and reflow at phone widths with no horizontal scrolling; touch targets are at least 44px; focus is always visible; `prefers-reduced-motion` removes animation

### Screens (restyle only)

- [ ] Root layout/nav, sign-in, landing (`/`), dashboard (empty and populated), invite landing (signed-out preview, invalid-link and error states)
- [ ] Creation wizard (all four steps, including place search and the invitee list), with a progress bar derived from the existing step state
- [ ] Brunch detail (host and invitee views; RSVP, ballots, invite panel, suggestions)
- [ ] Manage page (options, voting controls, confirm, suggestion review)
- [ ] No role, accessible name, route, request or response changes; the pre-existing journeys pass **unmodified**

### Accessibility and responsive verification

- [ ] A unit test over `tokens.css` (`tokenContrast.test.ts`) checks the contrast of the token pairs the app draws, in both palettes, so a token edit cannot silently break readability
- [ ] An axe scan (`@axe-core/playwright`, WCAG 2.0/2.1 A and AA rules) reports no violations on every screen and state listed in the E2E section, in light and dark; token pairs that fail contrast are changed and recorded in `plan.md`
- [ ] A Playwright `mobile` project (emulated phone, Chromium) runs the core journeys alongside the desktop project, in CI
- [ ] `pnpm --filter @brunchsters/web screenshots` produces the review screenshots (not a regression test; no committed baselines)

### Docs

- [ ] ADR 0010 and its README index row
- [ ] A scoped `apps/web/CLAUDE.md` section: UI conventions (tokens only, CSS Modules, primitives, no hardcoded colors/fonts, accessible names are a contract with the e2e suite)
- [ ] `docs/SETUP.md`: the screenshots command, the axe and mobile projects, trying the app from a phone
- [ ] `PLANNING.md` §16 (#8 renumbered to 0010, #9 updated) and §17 reference the new numbering; spec 0008's forward references updated
- [ ] The parity table below is final, and a **Feedback log** with every item's outcome is in `tasks.md`
- [ ] Testing notes per milestone in `tasks.md`

### Sign-off

- [ ] The owner has reviewed the app on desktop and a real phone, light and dark, and signed off on the look (recorded in `tasks.md` with the date). Until then this spec is not Complete

---

## E2E Journeys

Existing journeys are the main safeguard: they must pass **unchanged** at every milestone (accessible names and roles are the contract). New coverage is accessibility and phone-width behavior. Journey IDs use `D` (design).

| ID     | People                | What is asserted                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | Signed-out visitor    | axe reports no violations on `/`, `/sign-in`, and an invite landing page (valid signed-out preview and the invalid-link state), in light and dark (`colorScheme` emulated); and the shell: the wordmark goes to `/` when signed out, with no Sign out                                                                                                                                                                           |
| **D2** | Host, with a brunch   | axe clean on the dashboard (empty, then with a draft, an active and a confirmed brunch), each wizard step, the brunch detail page as host and as invitee (voting open, a closed state, a confirmed state), and the manage page; light and dark; the signed-in shell (the wordmark goes to `/dashboard`, the picture named after the user, Sign out). Screens are added to this journey in the milestone that restyles them      |
| **D3** | Host, invitee (phone) | On the `mobile` project, the core journeys run at a phone width: sign in and dashboard, create a brunch through the wizard, accept an invite and RSVP, vote, host confirms. Beyond the existing assertions, the page has no horizontal scroll (`scrollWidth <= clientWidth`) and the primary action of each screen is on screen without scrolling sideways. Which existing journey files run on `mobile` is listed in `plan.md` |
| **D4** | Anyone                | Keyboard only: tab order reaches the primary action on the dashboard, the wizard and the RSVP control, and each focus stop shows a visible focus indicator (computed `outline` is not `none`). Reduced motion: with `prefers-reduced-motion: reduce` emulated, no element on those screens has a running animation or non-zero transition duration                                                                              |

No multi-person state is new, so no new cross-identity journeys are needed. The client-side behavior of the wizard (reducer, place search, invitee list) is already covered by the existing journeys, which is why they must pass unchanged; D3 re-runs the core ones at phone width, where layout rather than logic can break them.

**Regression proof:** a restyle cannot be proven by "break the behavior", so each new journey is proven to fail differently. D1/D2: set a known low-contrast color token pair temporarily and confirm axe fails. D3: add a fixed-width element and confirm the horizontal-scroll assertion fails. D4: remove the focus-ring rule and confirm the focus assertion fails.

---

## Parity table (prototype component → where it ships)

The goal is eventual parity with the prototype. This spec builds the foundation and every screen that already exists; everything else ships with the feature that gives it behavior, so nothing is a dead control.

**Built in this spec (styling of existing behavior)**

| Prototype component                                           | Becomes                                                                                                                                                      |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tokens.css`, `a11y.css`, typography, motion                  | Tokens, global base styles, focus ring, skip link, reduced motion                                                                                            |
| `Icons.jsx`, `IconsPop.jsx`, `Logos.jsx`                      | Stroke icons, Pop icons (the ones an existing screen has a place for), logo mark and wordmark, as inline-SVG components; Pop and art colors move into tokens |
| `EmptyDashboard.jsx` (the `BreakfastScene` illustration only) | The empty-dashboard illustration; the "How it works" strip and join-by-link tile wait for their features (below)                                             |
| `WelcomeScreen.jsx` background                                | The butter-to-paper gradient behind sign-in, landing and the invite page                                                                                     |
| `TopBar.jsx`                                                  | Root nav: wordmark, avatar, sign out (no drawer or tabs yet)                                                                                                 |
| `WelcomeScreen.jsx` / `SignIn.jsx`                            | Sign-in page (the `sessionExpired` variant is not built; no such state exists)                                                                               |
| `InvitePreview.jsx`                                           | Public invite landing page (signed-out preview, invalid-link and error states)                                                                               |
| `DashboardV3.jsx` (list and cards)                            | Dashboard as styled brunch cards, Upcoming and Past; empty state                                                                                             |
| `CreateBrunchWizard.jsx`, `PlateProgressBar.jsx`              | The four existing wizard steps and a step indicator (the plate artwork is plain-icon here)                                                                   |
| `HostDetailV3.jsx` / `InviteeDetailV3.jsx` (existing parts)   | Brunch detail: RSVP, ballots, invite panel, suggestions, and manage page controls, for what each does today                                                  |
| Buttons, inputs, cards, badges, inline errors                 | `components/ui` primitives                                                                                                                                   |

**Ships later, with the feature that needs it**

| Prototype component                                                                                                                                               | Waits for                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `InboxScreen.jsx`, `MuteBrunchControl.jsx`, `PushPermPrompt.jsx` (push is v2)                                                                                     | Notifications follow-up (now spec 0010)                                                                                             |
| `CancelChangeModals.jsx` (`ModalShell`), `CountdownRing.jsx` (host cancel/change)                                                                                 | Cancel / undo-cancel and change features (services do not exist); the first modal also decides the dialog approach (ADR 0010)       |
| `CalendarChip.jsx`                                                                                                                                                | Google Calendar chip feature (build order #10)                                                                                      |
| `PlusOneSetting.jsx`, `V11LateAdditions.jsx` (running late, host transfer)                                                                                        | Plus-ones, running late and host transfer features                                                                                  |
| `QuickBrunch.jsx` (and replan prefill from `PastBrunchDetail.jsx`)                                                                                                | Quick Brunch feature (a creation-flow change, not styling)                                                                          |
| `DashboardV3.jsx` hero ("Next up") and "Plan another" tile                                                                                                        | A change that gives the dashboard each brunch's date and place (`BrunchSummary` has neither today); ships with the past-brunch view |
| `PastBrunchDetail.jsx`                                                                                                                                            | A past-brunch view with "Do this again?" (needs the replan feature)                                                                 |
| `MobileShell.jsx` (bottom tab bar, FAB), `Drawer.jsx`, `MeTab.jsx`                                                                                                | Inbox and profile specs (they give the tabs something to point to)                                                                  |
| `ShareSheet.jsx`                                                                                                                                                  | Invite-link sharing feature (native share, copy, revoke)                                                                            |
| `DeleteAccount.jsx`, `SignOutModal.jsx`                                                                                                                           | Account management spec (sign out stays a plain button here; no confirm step)                                                       |
| `PhotoUpload.jsx`                                                                                                                                                 | Needs a storage provider                                                                                                            |
| `MarketingLanding.jsx`, `HelpFAQ.jsx`, `OpenGraphPreview.jsx`                                                                                                     | A public-site spec (landing here is a simple styled entry point, not the marketing page)                                            |
| `EmptyDashboard.jsx` ("How it works" strip, join-by-link tile), `FirstBrunchCoach.jsx`, `SkeletonStates.jsx`, `Toasts.jsx`, `SendingLoader.jsx`, `EdgeStates.jsx` | Loading, error-toast and onboarding spec; surfaces the silent failures in PLANNING §17                                              |

---

## What This Spec Does Not Cover

- Any behavior, route, request/response, schema or permission change
- UI copy and terminology (a follow-up copy pass, informed by `design-docs/Brand Voice.html`); the review's "Copy" list feeds it
- Every item under "Ships later" in the parity table
- A manual theme toggle or stored preference (ADR 0010; the operating system setting is followed)
- Visual-regression testing with committed baselines (the screenshots are for review, not a gate)
- Safari/WebKit and Firefox test projects (ADR 0007's triggers still apply; revisit before launch)
- Internationalization (ADR 0005)
- `next/image` for the avatar (needs remote image configuration; the plain `<img>` stays)
- A component library for complex widgets (decided when the first dialog arrives)

---

## Open Questions

1. **Is the June design still right?** The design is about four months old and was never seen on the real app. Review 1 and Review 2 exist to find out early. If big structural changes come out of them, they are raised with the owner rather than absorbed (see "Review points").
2. **Copy pass timing.** Should the copy/terminology pass be its own small spec right after this one, or ride along with the notifications spec (0010)? It is cheapest before more screens and tests accumulate strings.
3. ~~**Dashboard "Next up" hero.**~~ **Resolved in M3:** `BrunchSummary` carries no date or place (only title, status, host flag, going count and creation time), so the hero needs a new query. It is not built here; it is in the parity table.
4. ~~**The `Inter` vs `Nunito` mismatch**~~ **Resolved at Review 1:** Nunito is used, accepted provisionally (the owner may revisit once more screens are converted). `prototype/` is left unedited as reference.
