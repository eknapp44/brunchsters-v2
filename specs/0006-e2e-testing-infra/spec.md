# Spec 0006 — End-to-End Testing Infrastructure

**Status:** Draft  
**Branch:** `feat/0006-e2e-testing-infra`  
**PLANNING.md ref:** §16 Build Order item 10, §17 Open Questions (E2E testing infra)  
**ADRs:** [0007 — End-to-end testing stack](../../docs/adrs/0007-e2e-testing-stack.md)

---

## What

Add automated, browser-driven end-to-end tests for the core brunch flow shipped in specs 0002–0005, and gate both PR merges and releases on them.

Today nothing exercises the app in a real browser or with more than one signed-in identity at once. That gap has already cost us: two real bugs in spec 0004 (self-invite batch rejection, already-member collision) were caught only by manual testing with two Google accounts, and the M7/M8 UI of spec 0005 shipped with its client-side behavior (checkbox → fetch → `router.refresh()`, debounced place search) unverified.

This spec delivers the infrastructure (Playwright, an isolated e2e database, session-cookie auth, fixtures, CI) **and** the journey suite that uses it. Infrastructure with a single smoke test would leave the real gap open, so journeys are in scope. The stack decisions are in ADR 0007 and are not re-litigated here.

---

## Principles for this suite

- **Journeys, not permutations.** E2E is expensive. Rule permutations and rejection matrices stay in unit and integration tests; E2E covers user journeys, prioritizing the ones that involve **two or more identities** and the ones with **client-side behavior** that nothing else can reach.
- **Every test owns its data.** Unique users and a fresh brunch per test; no shared mutable dataset, no ordering dependence, parallel-safe.
- **Fixtures use real core services** (`signInWithProvider`, `createBrunch`, `sendInvites`, `respondToInvite`) so seeded state is a state the app can actually reach. A Prisma shortcut to `active` once hid a real bug (spec 0005 M2).
- **UI only for the step under test.** Setup goes through fixtures.
- **Production code is not changed to be testable.** No bypass auth provider, no mock-injection seam.

---

## Journey inventory

Priority: **P0** = ship-blocking regression if broken (multi-identity, privacy, money-path of the core flow); **P1** = important; **P2** = nice to have, add if cheap. Source column points at the spec flow the journey verifies. "Historic" marks a bug class that has actually occurred.

### Auth (spec 0002)

| ID  | Journey                                                                                                                                                                                                                   | Actors  | Pri | Source                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --- | ------------------------------ |
| A1  | Signed-out visit to a protected route redirects to `/sign-in?callbackUrl=…`; `/` and `/sign-in` stay public                                                                                                               | anon    | P0  | 0002 Returning user            |
| A2  | Signed-in user lands on `/dashboard` with name/avatar in the nav; sign-out returns to `/` and protected routes redirect again                                                                                             | 1       | P1  | 0002 Sign-out                  |
| A3  | Signed-out invite link shows a brunch preview with no attendee list or PII and a sign-in CTA carrying `callbackUrl=/invite/<token>`; after sign-in (cookie minted) lands back and the invite is accepted → `/brunch/[id]` | invitee | P0  | 0002 via invite, 0004 new user |

The Google OAuth redirect itself is out of scope (ADR 0007); A3 is tested up to the sign-in click and resumed with a minted session.

### Create brunch (spec 0003)

| ID  | Journey                                                                                                                                                                                                                                      | Actors                   | Pri | Source                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | --- | ------------------------------- |
| C1  | Host completes the wizard: title, two intercepted place searches (multi-location hint appears), two times (multi-time hint and "Voting closes by" field appear), invitee emails; lands on `/brunch/[id]`; the brunch appears on `/dashboard` | host                     | P0  | 0003 Create, 0004 wizard step 4 |
| C2  | Place search: queries under 3 characters fire no request; selecting fetches details; a selected place can be removed; wizard back/next keeps entered data                                                                                    | host                     | P1  | 0003 Place search               |
| C3  | Access rule: an unrelated signed-in user gets 404 on `/brunch/[id]` (no existence leak); host and an attendee can open it                                                                                                                    | host, stranger, attendee | P0  | 0003 Access rule                |
| C4  | Dashboard shows an empty state with the "Plan a Brunch" CTA; with brunches, lists host and attendee brunches with status label and going count                                                                                               | 1–2                      | P2  | 0003 Dashboard                  |

### Invitations (spec 0004)

| ID  | Journey                                                                                                                                                                                               | Actors         | Pri | Source              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | --- | ------------------- |
| I1  | After creation with invitees, the detail page shows each invite (email, status) with a copyable link                                                                                                  | host           | P0  | 0004 wizard step 4  |
| I2  | Signed-in invitee opens the link, lands on the brunch, sees the RSVP control, answers yes/maybe/no; host's invite list reflects the answer                                                            | host, invitee  | P0  | 0004 existing user  |
| I3  | Host invites more people from the detail page; brunch moves `draft` → `active`                                                                                                                        | host           | P1  | 0004 invite later   |
| I4  | Expired and revoked tokens show the friendly "ask the host to resend" message and reveal no brunch details                                                                                            | anon/invitee   | P0  | 0004 expired token  |
| I5  | Attendee suggests someone → host sees it pending → approves → invite created and visible; a second suggestion is declined → no invite. Suggestion control hidden when `allowInviteSuggestions` is off | host, attendee | P0  | 0004 suggest/review |
| I6  | **Historic:** host inviting themselves in a batch does not reject the whole batch (0004 M5); inviting someone already a member does not collide (0004 M6)                                             | host (+member) | P0  | 0004 bug history    |

### Voting (spec 0005)

| ID  | Journey                                                                                                                                                                                                                         | Actors            | Pri | Source                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --- | --------------------- |
| V1  | A `yes`/`maybe` attendee checks options; the ballot saves and counts refresh; revising adds/removes; unchecking the last box explains it withdraws the vote and offers the suggestion control, and no empty ballot is submitted | host, attendee    | P0  | 0005 Attendee votes   |
| V2  | An `invited` or `no` attendee sees the ballot and counts read-only with the explanation; nothing is clickable                                                                                                                   | host, attendee    | P0  | 0005 Attendee votes   |
| V3  | Voter names are visible to the host and **not** to other attendees (privacy rule)                                                                                                                                               | host, 2 attendees | P0  | 0005 / PLANNING §17   |
| V4  | Attendee suggests a place/time → only they and the host see it, still pending, derived mode unchanged → host approves → it appears on the ballot, mode flips to vote, and an eligible voter can vote for it                     | host, attendee    | P0  | 0005 Suggests         |
| V5  | A kind with a single option renders display-only (no checkbox, no counts) — the exact bug found in the post-M8 review                                                                                                           | host, attendee    | P1  | 0005 post-M8 review   |
| V6  | When candidate locations span timezones, times show the location-zone subline during voting, and nothing shifts at confirmation (never verified in 0005)                                                                        | host, attendee    | P1  | 0005 Timezone display |

### Host manage and confirm (spec 0005)

| ID  | Journey                                                                                                                                                                                                                                         | Actors            | Pri | Source                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --- | ----------------------- |
| H1  | Host adds and removes locations and times on `/manage` (intercepted place search, datetime input); vote counts shown; a removed option's votes stop counting and the attendee's ballot updates                                                  | host, attendee    | P0  | 0005 Manages ballot     |
| H2  | With ≥3 eligible attendees and ≥66% voted, the nudge appears; host sets a deadline, closes voting; the attendee's ballot becomes read-only and a late vote is impossible                                                                        | host, 3 attendees | P0  | 0005 Closes voting      |
| H3  | Confirm: leader preselected; a tie preselects nothing; one action confirms both kinds; location, time, and ballot become read-only for everyone; RSVP stays live; attendee suggestion controls disappear; `/manage` shows the read-only summary | host, attendee    | P0  | 0005 Confirms           |
| H4  | A non-host gets 404 on `/manage`                                                                                                                                                                                                                | attendee          | P0  | 0005 Where screens live |
| H5  | Host removes the currently selected option in `/manage`; the confirm control falls back sensibly and cannot submit a vanished option (post-M8 bug 3)                                                                                            | host              | P2  | 0005 post-M8 review     |
| H6  | Confirming when nobody but the host has accepted shows a warning but does not block                                                                                                                                                             | host              | P1  | 0005 Confirms           |
| H7  | A voting deadline passing closes voting without the host acting (Playwright clock)                                                                                                                                                              | host, attendee    | P1  | 0005 Closes voting      |

**26 journeys:** 17 × P0 (A1, A3, C1, C3, I1, I2, I4, I5, I6, V1, V2, V3, V4, H1, H2, H3, H4), 7 × P1 (A2, C2, I3, V5, V6, H6, H7), 2 × P2 (C4, H5). Milestone assignment is in `tasks.md`. P2 items are built only if their milestone has room; they are listed so the gap is visible, not forgotten.

---

## Acceptance Criteria

### Infrastructure

- [ ] `pnpm test:e2e` runs the suite headlessly against an isolated e2e database and a dedicated-port server, locally and in CI
- [ ] `pnpm e2e:db:reset` creates (or recreates) the e2e database, applies migrations non-interactively (`migrate deploy`), and seeds reference data
- [x] Global setup refuses to run when `E2E_DATABASE_URL` does not look like a test target (local host, database named `e2e` or `*_e2e`)
- [x] The e2e server never attaches to a server it did not start (`reuseExistingServer: false`); it runs on its own port with `DATABASE_URL`/`AUTH_URL` set explicitly, and a probe confirmed it is on the e2e database (M1; replaces the originally planned "server-uses-e2e-db" runtime check)
- [ ] `apps/web/src/auth.ts` and the Places route handlers are unchanged by this spec
- [ ] Session cookies are minted for fixture users created via `signInWithProvider`; the helper works for the `http://localhost` cookie name
- [ ] Each test creates its own users and brunch; the suite passes with parallel workers and in any order
- [ ] Places requests are intercepted in the browser; no Google key is needed
- [ ] E2E files are excluded from the unit-test (`vitest`) run and covered by lint and typecheck (strict, no `any`)

### Coverage

- [ ] Every P0 journey in the inventory has an automated test
- [ ] Every P1 journey has an automated test, or an entry in `tasks.md` testing notes explaining the deferral
- [ ] P2 journeys are built or listed as deferred with a reason
- [ ] The historic bug classes (I6; the 0005 post-M8 findings V5 and H5) each have a regression test

### CI and release

- [ ] An E2E job runs on every PR to `main`, runs against a built app (`build && start`), and uploads Playwright traces as artifacts on failure
- [ ] The E2E job is documented as a required status check, together with "require branches to be up to date" (or E2E also runs on pushes to `main`)
- [ ] `release.yml` releases only when CI has passed for the same commit
- [ ] Retries: one in CI, none locally; any test that needs its retry to pass is investigated, not muted

### Docs

- [ ] `docs/SETUP.md` documents e2e database setup, `pnpm test:e2e`, headed/debug modes, and where traces land
- [ ] `docs/PLANNING.md` §16 item 10 marked complete; §17 E2E entry resolved and linked to ADR 0007
- [ ] Root `CLAUDE.md` Testing section points at the E2E conventions (location, fixture rule, journey-not-permutation rule)
- [ ] Testing notes per milestone in `tasks.md`

---

## What This Spec Does Not Cover

- The real Google sign-in flow and Apple sign-in (tested manually; nothing headless can drive Google)
- Visual-regression snapshots; accessibility scanning (axe is a cheap later addition)
- Browsers other than Chromium (WebKit, mobile viewport, Firefox are planned in ADR 0007 with triggers)
- Post-deploy smoke runs against INT/QA (no such environments exist yet; the `@smoke` tag convention is reserved)
- Notifications and email delivery (not built; `NoopEventBus`)
- Testcontainers (deferred in ADR 0007)

---

## Still Open

- The fixture process needs a Prisma client with the same soft-delete extension the app uses (`packages/database` middleware). Confirm in M2 whether it exports a ready factory or whether `apps/web/src/lib/db.ts` must be mirrored.
- Whether Next's own env loading lets `webServer.env` override `apps/web/.env.local` (process env should win; verify in M1 and record the result).
- Exact `@brunchsters/core` ctx needed by `createBrunch`/`sendInvites` in a non-Next process (event bus = `NoopEventBus`).
