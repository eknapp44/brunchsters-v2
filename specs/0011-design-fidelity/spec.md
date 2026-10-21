# Spec 0011 — Design Fidelity

**Status:** Draft (grilled with the owner 2026-10-21 against rendered boards and mockups; not started)  
**Branch:** `feat/0011-design-fidelity`  
**PLANNING.md ref:** §1 design principles, §16 Build Order #9 (UI) and the roadmap, §17 (RSVP visibility, new deferrals)  
**ADRs:** [0012 — Design fidelity: compositions, voice, and where presentation rules live](../../docs/adrs/0012-design-fidelity-and-presentation-rules.md)  
**Builds on:** [spec 0009](../0009-styling-foundation/spec.md) (the foundation; its "Outcome" says this spec exists) and [spec 0010](../0010-redux-ui-state/spec.md) (the store; nothing here changes it)

> **Roadmap (revised 2026-10-21).** Design fidelity (this spec) → **brunch lifecycle** (cancel, archive, delete) → **feedback surfaces** (shared mutation slice, toasts, real server errors) → **notifications** → **deployment** (cloud private beta, last; the owner reviews on a real phone then, and on phone-width boards until then). Later specs are named, not numbered. Every milestone here is deployable.

---

## What

Bring the built screens closer to the owner's Claude Design prototype: its **compositions**, its **copy and tone** (`design-docs/Brand Voice.html`, `Copy Pass.html`), and the small **read-only data** a few compositions need. The owner's own design choices are kept where they prefer them: the dark palette, the two-column desktop layout, and the lighter voting rows.

**No state-logic change.** No new mutation, route, schema change or permission, and the Redux store is untouched. The feedback-surfaces spec is next.

### How the decisions were made

Per screen and per element the owner chose **adopt / keep ours / blend**, with the prototype's boards (`apps/web/.screenshots/compare-*.png`, Oct 19; the app's UI has not changed visually since, only Redux refactors) and then **mockups of the outcome** (light, dark, desktop, phone) in front of them. The decisions are in the tables below; `mockups/build.mjs` regenerates the mockups, and the milestone that builds each screen reproduces them as real boards.

### Grounded in the current code (verified 2026-10-21)

- `BrunchSummary` (`getBrunchesForUser.ts`) carries id, title, status, `isHost`, `goingCount`, `createdAt`. No date, place, description, deadline or "vote waiting".
- `BrunchDetail` (`getBrunchById.ts`) has no host name and no confirmed date or place; the confirmed ones are the `isConfirmed` options inside `getBrunchVoting`. `votingDeadline` is there.
- `getInvitesForBrunch` returns **emails**, not names. Every `BrunchAttendee` has a `userId` and `User.name` is required, so everyone who has accepted has a name; only people who have not responded are just an email. (An earlier note that attendees could lack names was wrong.)
- The host already sees voter names on vote counts (`voters`, host only). A roster is not a new kind of exposure for the host.
- Ballots take a **list** of option ids (`optionIds`, minimum 1), so the prototype's radio-style "Pick your one" would be a rule change. Checkboxes stay.
- **Opening an invite link while signed in RSVPs "yes" at once** (`app/invite/[token]/page.tsx` calls `respondToInvite` with `yes`, then redirects). The "You in?" card therefore opens with "I'm in" selected. Existing behavior (spec 0004); the copy has to work with it. See Open Questions.
- **Sign-out has no screen.** It is a server action that redirects to `/` (`app/layout.tsx`), and `/` is a "Coming soon." placeholder. The landing page is the sign-out destination and the beta's front door.
- **There is no `not-found.tsx` or `error.tsx`.** Every outsider gets Next's default 404, which is the page the 404-vs-403 rule leans on.
- Statuses seeded: `draft`, `active`, `confirmed`, `completed`, `cancelled`. Nothing produces the last two (no scheduler), so a confirmed brunch is "Upcoming" forever; harmless without dates, wrong once date tiles show.
- The dashboard journeys count `listitem`s (C4), so the next-up card's roster cannot be a list, and the next-up brunch is not repeated in the Upcoming list.
- `Avatar` already falls back to initials; callers pass the Google photo today, in the nav only.
- Both existing emails (`inviteEmail.ts`, `confirmedEmail.ts`) are plain strings; `safeSubject` only strips control characters, so an emoji in a subject is fine.
- Design v3's canvas renders (144 artboards) once `design-canvas.jsx` and `tweaks-panel.jsx` sit next to the HTML (they were added under `prototype/components/`; the board script copies them into a scratch folder, so the reference files are untouched).

### Principles

1. **Presentation only, and the rules behind it live in `packages/core`.** "Leading", "vote waiting", "next up", "past" and the roster are pure, unit-tested functions; components format and draw (ADR 0012).
2. **A deliberate journey edit is a feature of this spec, not a surprise.** Each milestone lists the journeys and accessible names it changes; none changes silently. The exact-text rule for "Active", "Draft" and "Confirmed" holds on the brunch page.
3. **Phone leaves things out.** Phone-width screens drop repetition and secondary lines instead of squeezing them (see "Phone rules"); nothing hidden is the only way to learn something.
4. **Accessibility overrides the drawing.** Emoji and bars are decorative; names stay words; new color pairs go through `tokenContrast.test.ts` in both palettes.
5. **Every milestone ends with a board** (prototype vs app, light and dark, desktop and phone) and the owner's review. Green checks prove it works; only the owner can say it is right.

---

## Decisions by screen

### Dashboard

| Element                   | Choice                                | What                                                                                                                                                                                                                                                                                                                 |
| ------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Greeting and date eyebrow | Adopt (time-aware, client-side)       | "Morning/Afternoon/Evening, Evan 👋" and "Tuesday, October 21", from the browser clock; neutral "Hey, Evan 👋" and no eyebrow on the server snapshot. Morning 05–12, afternoon 12–17, evening 17–22, otherwise "Hey".                                                                                                |
| Summary line              | Adopt, with `votesWaiting`            | "You've got 2 brunches coming up and [＋ 1 vote waiting] on you." A brunch is _waiting_ when its voting is open, the viewer can vote, and on at least one open group-vote list they have cast no vote (host included). Counts brunches, not ballots.                                                                 |
| `Dashboard` h1            | Replaced by the greeting              | Edits the journeys that wait on `heading "Dashboard"`.                                                                                                                                                                                                                                                               |
| Next-up card              | Adopt, two panels                     | Left: status pill, "In 7 days" chip, serif title, date, place, "N going", **Open →**. Right (butter): **Who's coming** with names under the visibility rule. **Share link** dropped (no backend; links are per invite).                                                                                              |
| Which brunch is next up   | Soonest confirmed, else newest active | Ties: newest created. Drafts, past and cancelled never. Not repeated in Upcoming.                                                                                                                                                                                                                                    |
| Upcoming list             | Adopt rows with date tiles            | Full-width rows: date tile (`NOV 8`, or `TBD`), title with `(Host)`, one line (description if present, else place when confirmed, else "closes Thu" when voting, else "Not set yet"), status pill and "N going". Our card grid is replaced. If the next-up card is the only upcoming brunch, the section is omitted. |
| Status pill wording       | Copy Pass, as a display mapping       | `active` → "Open for votes", `draft` → "In the works", `confirmed` → "Confirmed"; Past rows keep the status lookup labels. The brunch page's badge keeps the lookup label (about 37 journey lines mention those labels). Unifying is an Open Question.                                                               |
| Past                      | Keep our section, new rows            | Same rows, muted. A **confirmed brunch whose time has passed is Past** (derived at read time).                                                                                                                                                                                                                       |
| Empty state               | Adopt                                 | "The table's set. Now invite some people." sub-line, **Plan a Brunch** (name kept), a static 3-step strip (name it, pick spots and times, round up the crew). The prototype's join-by-link tile is dropped (no backend).                                                                                             |
| Top bar                   | Keep ours, polish                     | Avatar (initials), name, Sign out. On phone: initials and Sign out only; the name stays in the accessibility tree, visually hidden. No avatar menu (it would be the app's first popover).                                                                                                                            |
| Option counts in rows     | Not adopted                           | "3 options · 3 places proposed" would add two more fields for little value.                                                                                                                                                                                                                                          |

### Brunch page (host and invitee)

| Element                 | Choice                              | What                                                                                                                                                                                                                                                                                                                |
| ----------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header                  | Adopt, with `hostName`              | Invitee: avatar and "**Sam Liu** wants you at brunch". Host: "You're hosting" pill. Serif title, description as the subtitle. The status badge keeps its exact text; a separate "Votes coming in · closes in 1d 4h" chip sits beside it (coarse, rendered on the server, refreshes with the page).                  |
| RSVP                    | Adopt, big card                     | Heading **You in?**, three equal buttons **🙌 I'm in / 🤔 Maybe / 😬 Can't** (owner's choice of emoji; they are `aria-hidden`, so the names are "I'm in", "Maybe", "Can't"). Opens with "I'm in" selected when the link already counted as yes.                                                                     |
| Voting rows             | Keep ours (checkboxes, count badge) | Plus a **quiet butter bar** behind each row, proportional to the top option, and a **leading** tag on the single top option (ties and zero votes: none). The bar is decorative (`aria-hidden`), so the count badge stays the information. The tint is quieter than a selected row, which keeps its border and tick. |
| Where / When            | Adopt cards per list                | "Where to?" and "When?" cards with a header chip; once confirmed, the card leads with the winner in serif and a **Locked in** pill. Subline: "Pick any you like — change it anytime before voting closes." (not "Pick your one"). **Add to calendar** is out (no backend).                                          |
| Who's coming            | Adopt, with the roster              | Host: full names and states, plus invited-but-silent people as their email, **Hasn't said yet**. Other members: `First L.` for yes and maybe, "You" for themselves, and counts for "can't" and "hasn't said yet". Outsiders: nothing (404).                                                                         |
| Confirmed state         | Adopt                               | A **Brunch on. 💕** banner above the Locked-in cards; the "Confirmed" badge keeps its exact text.                                                                                                                                                                                                                   |
| Suggest / invite panels | Keep ours, restyled                 | Right column below Who's coming. The host's invite button reads **Round up the crew →** where it currently reads "Send Invite" (see the copy table).                                                                                                                                                                |
| Phone order             | Reorder and thin                    | RSVP, then Where, When, Who's coming, Suggest. Collapsing is not added; it is decided after a real-phone review.                                                                                                                                                                                                    |

### Creation wizard

Adopt fully: a step eyebrow ("Step 1 of 4 · a name everyone will see"), a big per-step heading and helper text ("Give it a name", "Pick a spot", "Pick a time", "Round up the crew"), a **Cancel** at the top (leaves without saving) and a **Back / Continue** footer on each step (the top Cancel is hidden on phone, where the footer has one), step names Title / Where / When / Who, and larger step icons on phone (48px). "Plan a Brunch" stays the page's h1, visually quieter (the page object waits on it). The last button keeps "Create Brunch" (the Copy Pass has no line for it).

### Front door and edges (boards first, in M5)

Landing (brand voice hero, "Your friends are hungry. Probably. 🥂", a static how-it-works strip, a minimal footer; no claim about a feature that does not exist), sign-in, the invite preview (first screen a friend sees from a link: "Sam wants you at brunch", still only the title and host name, since showing more to a link-holder is a privacy decision), the invalid-invite and error states, a branded `not-found.tsx` (identical text for every 404) and `error.tsx`, and tone on the host's manage page. M5 starts by rendering these prototype scenes next to ours and confirming the adopt/keep/blend choices with the owner.

### Emails (copy only, M6, can be cut)

The invite and confirmation emails get the voice (the Brand Voice invite email is the model). Layout, delivery and events are untouched.

### Phone rules

Hide on phone, never the only source of a fact: the "N brunches" count, the helper line under Where/When, the repeated "closes in…" chip on each card, the top bar's name (visually only), the top Cancel in the wizard. The next-up roster shows three names plus "+N more". Upcoming rows are vertical (tile left; title; one line; pill and count). The approved mockups are regenerable from `specs/0011-design-fidelity/mockups/build.mjs`.

---

## User flows

1. **Anyone opens the dashboard.** They see a greeting, a summary line, the next-up card when they have an upcoming brunch (with who's coming under the visibility rule), then their other upcoming brunches as date-tile rows, then Past. With none, the empty state.
2. **An invitee opens the brunch page.** They see who invited them, the status and deadline, the "You in?" card, the Where and When cards with bars and the leading option, and who's coming. They pick as many options as they like.
3. **A host opens the brunch page.** Same, plus the full roster (with emails for people who have not responded) and the invite panel.
4. **A host confirms the brunch.** The page shows "Brunch on. 💕" and the Locked-in cards.
5. **A friend follows an invite link.** They see the invite preview, sign in, land on the brunch page with "I'm in" selected.
6. **A stranger or outsider follows a brunch link.** The branded 404, with the same text whether or not the brunch exists.
7. **Someone signs out.** They land on the real landing page.

---

## Acceptance Criteria

### Tooling and shared look (M1)

- [x] `pnpm --filter @brunchsters/web boards` photographs the prototype scenes and writes side-by-side boards with the app's screenshots, light and dark, desktop and phone (the prototype's phone scenes draw in its own `ios-frame.jsx` frame; the prototype has no dark mode, so a dark board shows its light scene and says so in its caption); it serves from a scratch copy so `prototype/` and `design-docs/` are never edited, and stops its server when it ends. The Design v3 canvas is placed in the scratch copy but not photographed yet (nothing needs its artboards until M5)
- [x] The warm page wash (`--wash-a`, `--wash-b`) and the vote-bar tint (`--bar`) are tokens with dark values; the butter panel is the existing `--accent-soft` (`Card tone="accent"`) and the avatar colors are the existing `--pop-*` family, so no duplicate tokens; every pair that carries text is in `tokenContrast.test.ts` (initials are held to the 4.5:1 text ratio); `styleGuard.test.ts` still passes
- [x] New primitives in `components/ui/`: `Eyebrow`, `DateTile`, `InitialsAvatar` (deterministic color from a seed, no image path); `Badge` gains an optional decorative icon (it is the "Pill"); the nav avatar is initials too
- [x] Phone top bar: initials and Sign out, name visually hidden but still announced (the hiding already existed from spec 0009; M1 made the avatar initials)

### Schema

- [x] No schema or migration change.

### Services (`packages/core`, `packages/shared`)

- [x] `@brunchsters/shared`: `formatPersonName` (`First L.`; single names and trailing spaces handled; host sees the full name) and `initialsOf` and `avatarColorIndex` shared by the web `InitialsAvatar` and the roster
- [x] `getBrunchesForUser` also returns `description`, the confirmed `scheduledAt` with its place name and timezone, `votingDeadline`, `votingClosed` and `votesWaiting`, in one query (no per-brunch round trips)
- [x] Pure, unit-tested rules: `isVoteWaiting`, `pickNextUp` (ties by newest created), `isPastBrunch` (confirmed and its time has passed, or completed or cancelled) and `groupDashboard` and `leadingOptionId` (single top option only) are done (M2 and M3)
- [x] `getBrunchRoster({ brunchId, viewerId })` returns `undefined` unless the viewer is the host or a live attendee (membership first, via `isBrunchMember`); host view: every attendee by full name and state, plus un-accepted invites as email; other members: `First L.` for yes and maybe, "You" for the viewer, counts for no and not-yet; soft-deleted attendees excluded; integration tests against the local database, including an outsider case indistinguishable from a made-up id
- [x] `getBrunchById` also returns `hostName` (members only, same row)

### API routes

- [x] No new route. The roster is a service called from Server Components; the API-authorization e2e test needs a case only for a new brunch-scoped _endpoint_, so the 404 case lives in the roster's integration test and in the page-level journey (P5)

### UI (dashboard, brunch page, wizard, front door)

- [ ] Each screen above matches its "Decisions" table, light and dark, desktop and phone, and passes axe (D2), layout (D3) and, where it adds a main path, keyboard and motion (D4)
- [x] The next-up roster uses no `listitem`s; the next-up brunch is not repeated in Upcoming; the Upcoming rows are the page's only `listitem`s
- [x] The greeting renders neutral on the server and time-aware on the client without a hydration warning (`useSyncExternalStore` with a server snapshot), and the heading is announced once
- [x] A display mapping turns status codes into Copy Pass wording on the dashboard, with a test that fails when a seeded status code has no entry; the brunch page badge keeps the lookup label
- [x] Emoji are `aria-hidden` everywhere; the RSVP names are "I'm in", "Maybe", "Can't"
- [ ] `not-found.tsx` and `error.tsx` exist, use the tokens and voice, and the 404 text is identical for every case; `error.tsx` offers the framework's retry
- [ ] The landing page replaces "Coming soon."; sign-out lands on it
- [ ] The invite and confirmation emails carry the voice; layout and events unchanged (M6, may be cut)

### Docs (adoption, not tacked on)

- [ ] `apps/web/CLAUDE.md` (the three sections are written in M1; the accessible-names list is filled as each milestone changes names): new "Voice and copy" (the rules, the copy table pointer, emoji dial, the display mapping), "Phone" (the omissions rule) and "Derived presentation rules live in core" sections; the accessible-names section lists the names this spec changed
- [x] `PLANNING.md` §17: RSVP visibility reworded (ADR 0012); deferrals added (below); §16 roadmap marks this spec
- [x] `specs/0009-styling-foundation/spec.md` "Outcome" points to this spec and ADR 0012
- [x] `docs/SETUP.md`: the `boards` command
- [ ] The `/spec-grill` skill asks about phone behavior and voice for any new screen

---

## E2E Journeys

Existing journeys that change are edited in the same commit as their screen (named per milestone in `tasks.md`). New journeys:

| ID  | Who                                      | Asserted                                                                                                                                                                                            | Milestone |
| --- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| P1  | one signed-in person                     | the greeting is time-aware: with the browser clock set to morning, afternoon, evening and late night it reads Morning, Afternoon, Evening and Hey; the date eyebrow matches the browser's date      | M2        |
| P2  | host, a "yes", a "maybe", a "no"         | next-up card: soonest confirmed wins over a newer active one; host sees full names; the "yes" sees `First L.` for yes and maybe and only a count for the "no"; the card is not repeated in Upcoming | M2        |
| P3  | host and invitee                         | "vote waiting" shows for an invitee who has not voted, clears after they vote, never shows for a closed or confirmed brunch; the host counts                                                        | M2        |
| P4  | host and a guest                         | a confirmed brunch whose time has passed leaves the next-up card and is a row under Past for both, still labelled "Confirmed"; the dashboard says nothing is upcoming                               | M2        |
| P5  | host, member, outsider                   | brunch-page roster by viewer (full names and emails for the host; `First L.` and counts for a member); an outsider and a made-up id get the identical 404 text                                      | M3        |
| P6  | invitee                                  | RSVP card: choose I'm in / Maybe / Can't; a failed save keeps the card and shows the error (edits `failure-paths`); the **leading** tag sits on the single top option and disappears on a tie       | M3        |
| P7  | host and invitee                         | confirmed: "Brunch on. 💕" banner, Locked in cards, the serif winner, for both people                                                                                                               | M3        |
| P8  | host                                     | wizard: top Cancel leaves without saving (nothing created), Back keeps entries, Continue advances, step headings change                                                                             | M4        |
| P9  | outsider, signed-out                     | the branded 404 text is identical for a real brunch the viewer cannot see, a made-up id and a malformed id; the landing page's sign-in link works and sign-out returns to it                        | M5        |
| P10 | friend with an invite link               | invite preview copy and the invalid-invite message (existing C-journeys edited)                                                                                                                     | M5        |
| P11 | host and invitee on the `mobile` project | the dashboard and the invitee page at phone width: vertical rows, initials-only bar, no sideways scroll, the main action on screen                                                                  | M2, M3    |

The derived "past" rule has journey **P4** (M2): a confirmed brunch whose time has passed moves from the next-up card to Past for the host and a guest, still labelled "Confirmed". It reaches that state the way `passVotingDeadline` reaches a passed deadline (`passConfirmedTime` in `e2e/support/voting.ts` writes the database directly, as a test-side exception; the production code has no seam). Not covered by an e2e journey, and why: `error.tsx` (no way to cause a render error without a production seam).

---

## What This Spec Does Not Cover

Each is recorded in ADR 0012, here, and `PLANNING.md` §17.

- **Settings and profile photos** (Google photo or upload, opt-in, dark mode toggle, edit profile): its own spec.
- **Collapsible or auto-collapsing phone sections**: decide after a real-phone review on the deployment.
- **Link-preview images (Open Graph)**, **privacy and terms pages and a footer**, a `theme-color`: deployment-adjacent (need the public URL and copy).
- **Notifications, inbox, toasts, bell, push prompt, mute, reminders**: the notifications and feedback-surfaces specs. Planned for, not built: the leading and vote-waiting rules are core functions the notifications spec can reuse; the top bar leaves room for a future bell; the Copy Pass's notification strings are kept in `plan.md` for that spec.
- **Features the prototype draws that do not exist**: cancel and change ("Call it off", "Tweak details"), the tiebreaker, quiet-nudge, running late, plus-ones, dietary notes, mute, past-brunch "do this again", Quick Brunch, share sheet, add to calendar, join-by-link. Their Copy Pass strings wait for their specs.
- **Live regions for vote counts** (flagged in `Accessibility Pass.html`): the feedback-surfaces spec.
- Any change to state logic, routes, permissions, or schema; the Redux store.
- A visual-regression gate with baselines (the boards are for review).

---

## Open Questions

1. **Assumed from the approved mockups, veto at the M2 review:** the primary action stays **Plan a Brunch** (the Copy Pass says "Round up the crew"; the owner chose to keep it, before reading the Copy Pass), and status wording is a display mapping on the dashboard only.
2. **Derived Past rule.** A confirmed brunch whose time has passed moves to Past. Recommended default; it is the one observable rule this spec changes.
3. ~~**Nav avatar.**~~ **Resolved 2026-10-21 (owner):** initials in the nav too; the Google photo is not shown anywhere until the Settings spec.
4. **Auto-"yes" on opening an invite link** (spec 0004). Is that still wanted now that the card says "You in?"? Not changed here.
5. **Unify status wording** (dashboard "Open for votes" vs the brunch page's "Active"): when the lookup labels move to a copy source.
6. **How many names on desktop** before "+N more" in the next-up card (three on phone). Decided at the M2 review.
7. **The wizard's last button** keeps "Create Brunch"; revisit if the owner wants a voiced line.
