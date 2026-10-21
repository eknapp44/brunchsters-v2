# Plan 0011 — Design Fidelity

What is decided, per screen, is in [`spec.md`](./spec.md); why the rules live where they do is in [ADR 0012](../../docs/adrs/0012-design-fidelity-and-presentation-rules.md). This plan is the how: files, types, the order of checks, the copy table, risks and tests.

The target look is `mockups/build.mjs` (owner-approved 2026-10-21; `node specs/0011-design-fidelity/mockups/build.mjs`, needs network for fonts, writes `./out`). Where a milestone's board and the mockup disagree, the owner decides at the review; the mockup is a target, not a contract.

## Files

**New**

| File                                                                                                         | Purpose                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/scripts/boards.ts` (+ `package.json` script `boards`)                                              | copies `prototype/` + the Design v3 HTML into a temp folder, serves it, photographs prototype and app side by side (light/dark, desktop/phone), writes `.screenshots/board-*.png`, stops the server |
| `apps/web/src/components/ui/{Eyebrow,DateTile,InitialsAvatar}.tsx` (+ CSS modules)                           | primitives from the mockups (`Badge` gained an optional decorative icon and is the "Pill"); `InitialsAvatar` takes a seed, never an image                                                           |
| `packages/shared/src/people.ts` (+ test)                                                                     | `formatPersonName`, `initialsOf`, `avatarColorIndex`                                                                                                                                                |
| `packages/core/src/brunch/presentation/{isVoteWaiting,pickNextUp,isPastBrunch,leadingOptionId}.ts` (+ tests) | the pure rules (ADR 0012, decision 4); no framework, no Prisma                                                                                                                                      |
| `packages/core/src/brunch/getBrunchRoster.ts` (+ unit and integration tests)                                 | the roster, membership first                                                                                                                                                                        |
| `apps/web/src/app/(authenticated)/dashboard/{Greeting,NextUpCard,UpcomingRow}.tsx`                           | dashboard compositions; `Greeting` is the only client component here                                                                                                                                |
| `apps/web/src/app/(authenticated)/brunch/[id]/{BrunchHeader,WhosComing,ConfirmedBanner,VoteBar}.tsx`         | brunch-page compositions                                                                                                                                                                            |
| `apps/web/src/lib/brunchCopy.ts` (+ test)                                                                    | `dashboardStatusLabel(code, lookupLabel)` display mapping; exhaustive over the seeded codes, falling back to the lookup label                                                                       |
| `apps/web/src/app/{not-found,error}.tsx`                                                                     | branded 404 and error boundary                                                                                                                                                                      |
| `e2e/journeys/design-fidelity.spec.ts`                                                                       | P1–P11                                                                                                                                                                                              |

**Changed**

- `apps/web/src/styles/tokens.css`: wash, butter panel, vote-bar tint, avatar palette (each with a dark value); `tokenContrast.test.ts`
- `components/nav/TopBar.tsx` (initials, visually hidden name on phone), `app/layout.tsx` (passes no image)
- `packages/core`: `getBrunchesForUser.ts` (new `BrunchSummary` fields), `getBrunchById.ts` (`hostName`), `index.ts` (exports)
- The dashboard, brunch, wizard, landing, sign-in, invite and manage pages; `detail.module.css`
- Emails (M6): `packages/core/src/email/templates/{inviteEmail,confirmedEmail}.ts` and their tests
- E2E: the journeys listed per milestone in `tasks.md`; `e2e/support/wizard.ts`; a new `e2e/support/dashboard.ts` helper (`expectDashboard`) so no journey waits on a greeting string directly
- Docs: `apps/web/CLAUDE.md`, `docs/PLANNING.md` (§16, §17), `docs/SETUP.md`, `specs/0009-styling-foundation/spec.md` (Outcome pointer), the `/spec-grill` skill

No schema change, no migration, no new route, no new dependency.

## Key design

### Pure rules in core (ADR 0012)

```ts
// shape, not final code
export function leadingOptionId(
  options: readonly { id: string; voteCount: number }[],
): string | undefined;
// the single option with the most votes, > 0; a tie for first, or no votes: undefined

export function isVoteWaiting(input: {
  readonly brunch: ClosableBrunch; // reuses isVotingClosed (the single source of "closed")
  readonly viewerCanVote: boolean; // RsvpStatus.canVote, not countsAsAttendee
  readonly lists: readonly { readonly liveOptionCount: number; readonly viewerVoted: boolean }[];
}): boolean;
// open, canVote, and some list is group_vote (> 1 live option, deriveDecisionMode's rule) with no ballot from the viewer

export function pickNextUp(brunches: readonly BrunchSummary[]): BrunchSummary | undefined;
// soonest confirmed (not past) else newest active (not closed); ties: newest createdAt

export function isPastBrunch(brunch: BrunchSummary, now: Date): boolean;
// completed, cancelled, or confirmed with scheduledAt < now
```

`now` is a parameter (no hidden clock) so the rules unit-test without fake timers. The dashboard page calls them with `new Date()`.

### `getBrunchesForUser`

One `findMany` already includes the brunch and status; M2 adds, in the same query: the confirmed `BrunchLocation` and `BrunchTime` (`isConfirmed`, `deletedAt: null`; the soft-delete extension only covers the top-level model, so relation filters spell it out), per-kind live option counts, and the viewer's own votes (`votes: { where: { userId } }`) plus the viewer's `rsvpStatus.canVote`. `votesWaiting` is computed in the mapper with `isVoteWaiting`. A test counts queries to prove it stays one round trip as the brunch count grows.

`BrunchSummary` gains `description`, `scheduledAt`, `placeName`, `timezone` (the confirmed ones, `undefined` until confirmed), `votingDeadline`, `votesWaiting`. All `T | undefined`, never `null` (the Prisma `null` is mapped at the boundary). Existing tests that build a summary get the new fields from a builder, not by hand.

### Roster (`getBrunchRoster`)

```ts
type BrunchRoster =
  | { kind: 'host'; people: readonly HostRosterPerson[]; counts: RosterCounts }
  | { kind: 'member'; people: readonly MemberRosterPerson[]; counts: RosterCounts };
// HostRosterPerson:   { name (full) | email (un-accepted invite); state: yes|maybe|no|pending; initials; colorIndex }
// MemberRosterPerson: { name ('First L.' | 'You'); state: yes|maybe; initials; colorIndex }   // never no or pending
// RosterCounts: { yes, maybe, no, pending }
```

**Order of checks:** (1) `isBrunchMember` → otherwise return `undefined`, exactly what a made-up id returns, before anything that could reveal existence; (2) host vs member; (3) build the view. A member's view never contains an email, a user id, or a "no" or pending name; a type test and an assertion on the serialized output both say so. `colorIndex` is `avatarColorIndex(userId or email)` computed in core so ids never leave it. The viewer is "You". Soft-deleted attendees are excluded, with the filter spelled out. The Server Component calls it directly (no route), so the 404 case is an integration test plus journey P5.

The next-up card calls it for one brunch only; the brunch page calls it once.

### Greeting

`Greeting` is a client component. It reads the clock through `useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot)`: the server snapshot is neutral ("Hey, Name", no date eyebrow), the client snapshot is the real time bucket and date; React reconciles without a hydration warning, and there is no `useEffect` state to flash. The eyebrow's height is reserved so the page does not jump. It receives `firstName` as a prop. Single control, no shared state: not a slice (`apps/web/CLAUDE.md` "State").

### Display mapping and exact-text rule

`dashboardStatusLabel` is used by the dashboard rows and next-up card only. The brunch page keeps `brunch.statusLabel`, so "Active", "Draft" and "Confirmed" still appear once there. The test iterates the seeded status codes (`packages/database` seed) and fails if one has no mapping.

### Tokens and primitives

New tokens (light and dark): `--wash-a`, `--wash-b` (the page gradient) and `--bar` (vote-bar tint, quieter than a selected row). **As built (M1):** no `--butter` and no `--avatar-*`: the next-up right panel is the existing `--accent-soft` / `--accent-soft-fg` (`Card tone="accent"`), and `InitialsAvatar` draws from the existing `--pop-*` family, because `tokenContrast.test.ts` reads literal `oklch()` values only, so an alias would be untestable and a copy would be a second place to edit. The Eyebrow uses `--fg-muted`, not the mockup's `--fg-subtle` (about 3.7:1, below AA at 12px). Every text pair is added to `tokenContrast.test.ts`. A selected row keeps a bolder border and a tick, so selection never relies on tint alone (`Accessibility Pass.html`).

### Phone

Mobile-first as ever: phone is the base style, `min-width` adds desktop. The omissions list lives in CSS as `[data-phone-hide]`-style utility classes only where a block is pure repetition; blocks that are the only source of a fact are never hidden. Wizard step icons 48px.

### Boards

`boards.ts` takes the screens from the existing screenshots spec (`e2e/screenshots/review.spec.ts`, extended) and the prototype scenes from the scratch copy; the clock is frozen so the greeting is stable. It needs network (React and Babel come from unpkg) and the local database for the app side; both are named in `docs/SETUP.md`. Nothing in the shipped app depends on it.

## Copy table

"Adopted" strings are exact. "Extrapolated" ones follow a Copy Pass pattern for a line it does not contain. "Not adopted" ones are deliberate.

| Where                                           | String                                                                                                                                                                                                                                 | Source                                    | Status                                                                                                     |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Dashboard greeting                              | "Morning/Afternoon/Evening, {first} 👋"; neutral "Hey, {first} 👋"                                                                                                                                                                     | prototype                                 | adopted                                                                                                    |
| Dashboard summary                               | "You've got N brunches coming up and ＋ N vote(s) waiting on you."                                                                                                                                                                     | prototype, singular/plural handled        | adopted                                                                                                    |
| Next-up                                         | "In 7 days", "Who's coming", "Open →"                                                                                                                                                                                                  | prototype, Copy Pass ("Open →")           | adopted                                                                                                    |
| Share link                                      | —                                                                                                                                                                                                                                      | Copy Pass                                 | not adopted (no backend)                                                                                   |
| Status pills (dashboard)                        | "Open for votes" (active), "In the works" (draft)                                                                                                                                                                                      | Copy Pass                                 | adopted as a display mapping                                                                               |
| Empty dashboard                                 | "The table's set. Now invite some people."                                                                                                                                                                                             | Copy Pass (kept)                          | adopted                                                                                                    |
| Empty sub-line                                  | "Pick a spot, pick a time, send it. We'll handle the invites and the votes."                                                                                                                                                           | Brand Voice landing                       | adopted                                                                                                    |
| Empty CTA                                       | "Plan a Brunch"                                                                                                                                                                                                                        | existing (Copy Pass: "Round up the crew") | **kept** by the owner; Open Question 1                                                                     |
| Join-by-link                                    | "Got a link from a friend?"                                                                                                                                                                                                            | Copy Pass                                 | not adopted (no backend)                                                                                   |
| Invitee header                                  | "{Host} wants you at brunch"                                                                                                                                                                                                           | Copy Pass                                 | adopted                                                                                                    |
| RSVP                                            | "You in?", "I'm in", "Maybe", "Can't"                                                                                                                                                                                                  | Copy Pass, prototype                      | adopted (emoji `aria-hidden`)                                                                              |
| Voting headings                                 | "Where to?"; "When?"                                                                                                                                                                                                                   | Copy Pass; "When?" extrapolated           | adopted                                                                                                    |
| Voting subline                                  | "Pick any you like — change it anytime before voting closes."                                                                                                                                                                          | Copy Pass, changed from "your one"        | adapted (ballots take several picks)                                                                       |
| Deadline chip                                   | "Votes coming in · closes in 1d 4h"                                                                                                                                                                                                    | Copy Pass                                 | adopted                                                                                                    |
| Roster                                          | "Who's coming", "Hasn't said yet", "Can't make it", "N can't make it"                                                                                                                                                                  | Copy Pass, prototype                      | adopted                                                                                                    |
| Confirmed                                       | "Brunch on. 💕", "Locked in"                                                                                                                                                                                                           | Brand Voice, Copy Pass                    | adopted                                                                                                    |
| Host invite button                              | "Round up the crew →" (was "Send Invite")                                                                                                                                                                                              | Copy Pass                                 | adopted; edits the invite journeys                                                                         |
| Manage: close voting                            | "Call it" (was "Close voting")                                                                                                                                                                                                         | Copy Pass                                 | **decided in M5** (touches `closing-voting` and `confirm`)                                                 |
| Manage: confirm                                 | "Lock in {Place}" (was "Confirm …")                                                                                                                                                                                                    | Copy Pass                                 | **decided in M5**                                                                                          |
| Manage: 66% banner                              | "{N} people haven't voted yet. {Place}'s up 4–2. Call it now?"                                                                                                                                                                         | Copy Pass                                 | **decided in M5**                                                                                          |
| Wizard                                          | "Give it a name", "Pick a spot", "Pick a time", "Round up the crew"; "Step N of 4 · …"; Back / Continue / Cancel                                                                                                                       | Copy Pass, prototype                      | adopted; "Create Brunch" kept                                                                              |
| Landing hero                                    | "Your friends are hungry. Probably. 🥂"                                                                                                                                                                                                | Brand Voice                               | adopted in M5 after its board                                                                              |
| Invite preview                                  | "{Host} wants you at brunch 🥂"                                                                                                                                                                                                        | Brand Voice                               | adopted in M5                                                                                              |
| Emails (M6)                                     | subject "{Host} wants you at brunch 🥂"; confirmation "Brunch on. 💕"                                                                                                                                                                  | Brand Voice                               | adopted in M6                                                                                              |
| Errors                                          | "Couldn't send that just now. We'll try again — your tap stuck."                                                                                                                                                                       | Brand Voice                               | **not adopted**: promises a retry the app does not do; error wording belongs to the feedback-surfaces spec |
| Cancel and change                               | "Call it off", "Tweak details", modals                                                                                                                                                                                                 | Copy Pass                                 | not adopted (features do not exist)                                                                        |
| Tiebreaker, quiet nudge                         | "Tied at 3 each", "Run a tiebreaker", "It's been crickets on …"                                                                                                                                                                        | Copy Pass                                 | not adopted (features do not exist)                                                                        |
| Pick-one                                        | "Pick your one — change it anytime before voting closes."                                                                                                                                                                              | Copy Pass                                 | **not adopted** (contradicts multi-pick ballots)                                                           |
| Notifications (kept for the notifications spec) | "Maya's in 🥂 — that's 4 yeses so far for Sunday at Tartine."; "⏳ Voting closes in 2h. Tartine's leading by 2."; "Sam called off Sunday — said next month for sure 💕"; "It's gone quiet on Sunday catch-up. Want to nudge the gang?" | Brand Voice                               | recorded only                                                                                              |

## Risks

| Risk                                                                               | Mitigation                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A roster leaks an email, id, or "no" name to a member                              | Discriminated union (a member type has no such fields); an assertion on the serialized member view; the outsider case equals a made-up id; membership checked first                                                               |
| `getBrunchesForUser` grows into N+1 queries as it gains fields                     | One query with includes; a query-count test; `votesWaiting` computed in the mapper from included rows                                                                                                                             |
| The greeting causes a hydration warning or a flash                                 | `useSyncExternalStore` with a neutral server snapshot; reserved height; journey P1 sets the browser clock and watches the console                                                                                                 |
| Journey churn hides a real regression                                              | Edits are listed per milestone and made in the same commit; helpers (`expectDashboard`, the RSVP locators in the page objects) so a string changes in one place; each edited journey is proven to still fail on a real regression |
| The vote bar reads as "selected"                                                   | A quieter tint token plus a bolder border and tick on a selected row; the owner reviews it on the board                                                                                                                           |
| Display mapping drifts from the lookup labels                                      | The completeness test; mapping used on the dashboard only; Open Question 5                                                                                                                                                        |
| The derived Past rule moves a brunch the host still cares about                    | Only confirmed brunches whose time passed; completed and cancelled already were Past; integration test with a real past time                                                                                                      |
| Boards need network and a local database, so a review cannot be reproduced offline | Named in `docs/SETUP.md`; the committed mockup generator needs only the network for fonts                                                                                                                                         |
| The phone omissions hide the only source of a fact                                 | The rule in `apps/web/CLAUDE.md`; each omission is a repetition (listed); the layout journey asserts the facts are still reachable on phone                                                                                       |

## Test strategy

- **Unit (vitest, node):** every pure rule (ties, zero votes, closed, cannot-vote, single-option lists, a single confirmed brunch, past boundaries), the people helpers (single names, trailing spaces, emoji), the status-mapping completeness test, `tokenContrast`, `styleGuard`.
- **Integration (local Postgres):** the roster for host, member and outsider; soft-deleted attendees excluded; `getBrunchesForUser` fields and `votesWaiting` against real rows; the query count; the derived Past rule with a real past time.
- **E2E:** P1–P11, plus deliberate edits to the existing journeys listed in `tasks.md`; axe (D2), layout (D3) and keyboard/motion (D4) extended for each new screen and state, light and dark; the `mobile` project gets the dashboard and the invitee page.
- **Proving they can fail:** for each new journey and rule, the milestone's testing note records the one-line change that makes it fail (a tie that picks a leader, a roster that returns a "no" name, a greeting that uses the server's clock, a bar that is not `aria-hidden`).
- **Nothing tests that React renders** (root `CLAUDE.md`): components are covered through the journeys.
