# Spec 0012 — Security Hardening

**Status:** In progress (grilled 2026-10-22; M1 to M5 done: dependencies, the limiter, invite and resend limits, place search, writes, invite tokens, and the report-only CSP; M6 (enforce the CSP, close-out) to do)  
**Branch:** `feat/0012-security-hardening`  
**PLANNING.md ref:** §16 roadmap step 5, §17 "Security and session follow-ups"  
**ADRs:** [0013 — Rate limits in Postgres](../../docs/adrs/0013-rate-limits-in-postgres.md), [0014 — CSP with a per-request nonce](../../docs/adrs/0014-content-security-policy-with-nonce.md)  
**Builds on:** [spec 0008](../0008-email-notifications/spec.md) (the invite email path and its 50-per-request guard), [spec 0011](../0011-design-fidelity/spec.md) (the basic headers, `safeCallbackPath`, `forbidden()`)

> **Numbering note.** Older docs call the notifications spec "0012". Directories are numbered in the order they are written, so security hardening is 0012 and the notifications spec takes the next free number when it is written. The docs commit that adds this spec rewrites those references to say "the notifications spec".

---

## What

Put limits and a few defenses in place **before the beta opens** (PLANNING §16: step 5, ahead of deployment). Three pieces, in this order of risk:

1. **Rate limits** (the main goal): invite email, resend, Google Places, every other write, and requests to the public invite-token routes.
2. **Known-vulnerable dependencies** patched, and a CI gate so they cannot creep back.
3. **A Content-Security-Policy** with a per-request nonce, report-only first, then enforced.

No new screen. Two existing controls gain one inline line of copy for a limited state.

### Grounded in the current code (verified 2026-10-22)

- **Nothing limits anything.** The only guard is `MAX_INVITES_PER_REQUEST = 50` (`packages/shared/src/invites.ts`), per request. `POST /api/v1/brunches/[id]/invites` (`sendInvites`) and `POST /api/v1/invites/[id]/resend` (`resendInvite`, which re-tokens and emits `invite/resent` every call) can be looped. The invite email job is capped at 5 concurrent runs (`inngest/functions.ts`), which bounds load, not volume.
- **The Places routes do not check the session themselves.** `places/search/route.ts` and `places/[placeId]/route.ts` have no `auth()`; only `middleware.ts` answers a signed-out caller with 401. To limit by person the handlers must read the session, which also hardens them if the middleware matcher ever changes. Their unit tests call `GET` with a bare `Request`, so they gain a session mock.
- **`middleware.ts` runs on the edge**, where Prisma does not, so the write limit is a helper called in each route handler, not middleware. There are 26 `route.ts` files under `app/api` (24 under `v1`); the mutating ones (POST, PUT, PATCH, DELETE) are the catch-all's target.
- **Sign-in is Google only** (ADR 0003): no password, so there is nothing to brute-force. The public token routes (`/api/v1/invites/token/[token]`, `.../respond`) are the only unauthenticated API surface; no e2e journey calls them (the invite page reads the token through core, not the API), so their limit cannot be tripped by the suite.
- **The e2e suite runs every worker from one IP** against one server, and CLAUDE.md forbids a test-only bypass. Limits keyed by the person are safe (each journey makes its own users); the address limit applies only to the two public invite-token routes, which nothing in the suite called before spec 0012, and its journey sends its own `x-forwarded-for`.
- **`apps/web/src/app/(authenticated)/brunch/[id]/InvitePanel.tsx`** shows `Failed to send invite` / `Failed to resend invite` / `Failed to revoke invite` in an `InlineAlert` (`role="alert"`); `PlaceSearchInput.tsx` debounces with a `setTimeout` and a `sessionToken` for Google's per-session billing. Both keep local `useState` (ADR 0011: a single control's state), so no Redux change.
- **Dependencies are behind.** Installed `next` is 15.5.19; `pnpm audit --prod` (2026-10-22) reports 32 advisories (6 critical, 15 high) on 250 production dependencies: `next` (fixed in 15.5.28, which exists), `next-auth` 5.0.0-beta.31 and its `@auth/core` (fixed in `@auth/core` 0.41.3, which `next-auth@5.0.0-beta.32` depends on), plus `postcss`, `sharp`, `nanoid`, `deepmerge-ts`, `source-map-js` (mostly transitive). **The advisories name `next-auth` ≥ 5.0.0 as the fix, but 5.0.0 is not published** (npm `beta` is 5.0.0-beta.32; `latest` is the v4 line). M1 finds out whether beta.32 clears them. One of the advisories is "configuration errors can cause existence-based auth checks to fail open", and every handler here gates on `session === null` and the middleware on `req.auth`, so M1 also proves a bad session still gets a 401 (journey S2 below).
- **CSP inputs:** `next.config.ts` carries the basic headers and says why CSP is missing; `next/font` is self-hosted; two components set a computed inline `style` width; sign-in is a server action that redirects to Google; images are initials plus a `data:` image in fixtures.

### Principles

- **A limit never confirms a brunch.** It reads only the caller's own counter, and anything that names a brunch or invite is consumed after the host check.
- **No configuration, no bypass.** Limits are named constants; tests spend the real budget.
- **Business rules in core** (`RateLimiter`, the policy table, the decision), the route only maps "limited" to 429 (CLAUDE.md).

---

## User flows

1. **A host sends too many invites.** They paste addresses; the cap has been reached; the send button disables (`aria-disabled`, still focusable) with "Easy there, that's a lot of invites for one day. Try again in about N hours." beside it, and the list stays as it was. A refresh, or signing out and back in as the same person, keeps it disabled until the same moment; it re-enables when the wait is over.
2. **A host hits Resend twice.** The second click inside 10 minutes is refused; that invite's Resend disables with "That one just went out. Give it N minutes." and re-enables when the wait is over (other invites' buttons are unaffected). No second email.
3. **A person types in a place search very fast, or a script loops on it.** After 30 calls in a minute the input shows "Slow down a sec, then try again." with the existing results kept. The input stays usable (the wait is seconds) and the line clears when the wait passes; nothing is billed by Google for the refused calls.
4. **A person (or a script) hammers any write.** After 60 in a minute the route answers 429 with `Retry-After`; the control shows its existing generic error (feedback-surfaces owns real wording). A second signed-in person is unaffected.
5. **An outsider probes brunch ids.** Real and made-up ids behave identically at every budget level: 404 under budget, 429 over it.
6. **Someone guesses invite tokens.** After 30 requests in a minute from one address, the invite-token routes answer 429, a real token included, before anything is looked up. (Every request counts, not only the ones for a token that does not exist: nothing in the app's own screens calls these routes, and refusing a limited address outright is what stops it probing.)
7. **A page loads with a CSP.** Nothing visible changes; an injected inline script would not run.

---

## Acceptance Criteria

### Schema

- [x] `RateLimitBucket` model (`key`, `windowStart`, `count`, primary key `[key, windowStart]`, index on `windowStart`) and its migration, committed with the schema; not in the soft-delete set (comment says why)
- [x] Migration applies on an empty database and over the existing e2e and dev databases

### Services (`packages/core`)

- [x] `RateLimiter` interface, `PostgresRateLimiter` (atomic upsert, denied requests do not increment, cost greater than the limit is denied outright), and an in-memory implementation for unit tests
- [x] Policies and their limits as named constants in `packages/shared`; the time-until-reset math is pure and unit-tested
- [x] `sendInvites` consumes the per-brunch and per-host budgets after the host check, for the de-duplicated, self-filtered count, and returns a `rate_limited` error with `retryAfterSeconds`; a denied send creates nothing and emits nothing
- [x] `resendInvite` consumes the per-invite cooldown and one host invite-email unit after the host check, with the same error
- [x] Approving an invite suggestion spends the same two budgets, one email each (`reviewInviteSuggestion`, which `suggestInvitee` also calls itself when the brunch does not ask the host to approve): after the host and pending checks, only for an approval, never for a decline. A refused approval leaves the suggestion pending and nothing is sent; a refused auto-approval leaves it pending too. **Corrects this spec's first draft, which said `suggestInvitee` sends no email: with approval not required it does, and without this the host's daily cap could be walked round one approval at a time.**
- [x] `pruneRateLimitBuckets` deletes buckets older than two days; an Inngest cron function calls it (registered in `functions.ts`)
- [ ] Limiter database errors fail closed (503 from the route)

### API routes

- [x] One helper (`apps/web/src/lib/rateLimit.ts`) builds the 429 (status, `Retry-After`, body `{ error, policy, retryAfterSeconds }`: the policy name lets a control word its message) and the fail-closed 503
- [x] `clientIp(headers)` (first `x-forwarded-for` entry, then `x-real-ip`, then one shared "unknown" bucket: stricter, never looser)
- [x] Both Places handlers call `auth()` (401 when signed out, as middleware already answers) and consume 30 and 20 per person per minute **before** calling Google
- [x] Every POST, PUT, PATCH and DELETE under `app/api/v1` calls the write limiter right after `auth()`, with **no exceptions and no allowlist**: the invite response route (reachable signed out) spends the address budget first and its person's write budget after the session check, like the rest. The two invite routes take it as well as their own budgets in core.
- [x] A scanning test (`routeLimits.test.ts`) fails when a mutating handler does not make the call, makes it before the session or after it reads the request, or when a Places or token route loses its budget, and when any budget is keyed by something other than the person or the address
- [x] The token GET and the respond POST spend the caller's address budget (30 per minute) on every request, before anything is looked up, and the respond route does so before its session check
- [x] Handler tests per route family: 429 shape, header, order (401 → 429 → parse → service), and that no service runs when limited
- [x] `api-authorization` e2e gains the cases below

### Dependencies

- [x] `next` at 15.5.28 or newer within 15.x; `next-auth` and `@auth/core` at the newest versions that clear the advisories (or, if none does, each remaining one recorded in `package.json`'s audit config with a reason and a date); the lockfile regenerated
- [x] CI runs `pnpm audit --prod --audit-level=high` as a step of an existing job (or its own job) and fails on a new high or critical; every ignore has a reason and a date in one place
- [x] The whole suite, `pnpm build` and a real Google sign-in on the dev server pass after the bump; the CHANGELOG-visible commit is `fix(deps):`

### CSP

- [x] Middleware sets a nonce-based `Content-Security-Policy-Report-Only` on every response (pages, API JSON, redirects), and Next stamps its scripts with the nonce
- [x] A journey (S3) fails on any `securitypolicyviolation` along the main paths
- [ ] The header is flipped to enforcing after a manual real sign-in and a clean full run; S1 asserts the header name and the key directives
- [x] The policy is built by a pure function with unit tests (nonce present, no `unsafe-eval` outside development, `frame-ancestors 'none'`, `form-action` allows Google)

### UI

- [x] `InvitePanel` disables the send button, and the one invite's Resend button, after a 429 (`aria-disabled`, focusable, label unchanged) with the limited line beside it (`InlineAlert`, `role="status"`: it is news about a wait, not an error); approving a suggestion that hits the same cap shows the same line in the suggestions panel's existing alert (no disabling there). `PlaceSearchInput` shows its line and stays usable (M4). One hook, `useLimitedUntil`, keeps the end time as an absolute timestamp in `localStorage` (key: control + user id + the invite or brunch, e.g. `brunchsters:limit:resend:<userId>:<inviteId>`), so a refresh or a sign-out and sign-in as the same person keeps the wait; every storage access is in `try/catch` and falls back to in-memory. The wording comes from one function in `src/lib` with a unit test (hours, minutes, seconds, never "0 minutes")
- [ ] No new Redux state; the message is the control's own `useState` (ADR 0011)

### Docs

- [ ] `PLANNING.md` §16 (step 5 now links this spec and names what is in it), §17 "Security and session follow-ups" updated item by item (rate limits and CSP done; HSTS, expired session, invite GET, account deletion still open with their owners)
- [ ] `docs/SETUP.md`: the audit command, how to run the limit journeys, the `x-forwarded-for` note for local runs
- [ ] The deployment spec's pre-launch checklist in `PLANNING.md` §17 gains: HSTS, "confirm Vercel overwrites a client-supplied `x-forwarded-for`", "load every screen and read the console for CSP violations", "decide where limit-hit logs go, and confirm the daily `prune-rate-limits` job is registered and runs in Inngest Cloud"
- [ ] `apps/web/CLAUDE.md`: a short "Limited state" note (where the wording lives, 429 handling) and the rule for new endpoints; root `CLAUDE.md` gets one line under Architectural Rules (every mutating route limits writes; limits are keyed by caller)
- [ ] `.claude/skills/spec-grill` prompts: ask "what limit does a new endpoint need"

---

## E2E Journeys

| ID  | Who                                                             | Asserted                                                                                                                                                                                                                                                                                                                                                           | Milestone |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| L1  | host                                                            | the 51st invite email address in a day (50-per-brunch cap, one batch of 50 then one more) is refused with 429 and `Retry-After`; the send button is `aria-disabled` with the limited line beside it, the list is unchanged, and after a reload it is still disabled (the browser clock then moved past the wait: it re-enables); no extra email reaches the outbox | M3        |
| L1b | host and one attendee                                           | the attendee suggests an address; the host has used the brunch's 50 invites for the day; approving shows the limited line, the suggestion stays pending, no invite is created; declining still works                                                                                                                                                               | M3        |
| L2  | host                                                            | clicking Resend twice: the first sends, the second shows the cooldown line and that invite's Resend is `aria-disabled`, still so after a reload, re-enabled once the browser clock passes the wait, the outbox holds one resend; a different invite on the same brunch still resends                                                                               | M3        |
| L3  | one signed-in person                                            | 31 place searches in a minute through the real route (the e2e server's Places key is blank, so under budget the answer is the existing 502): 30 are answered, the 31st is 429 with `Retry-After`; and the real input, with the browser intercept answering 429, shows the limited line and keeps the earlier results                                               | M4        |
| L4  | two members of one brunch                                       | one member makes 61 RSVP writes in a minute: the 61st is 429 with `Retry-After`; the other member's RSVP still works (keyed per person). Window reset is proved in the limiter's integration test with an injected clock, because e2e cannot move the server's clock                                                                                               | M4        |
| L5  | outsider, member, made-up id                                    | under budget the outsider gets the identical 404 for a real brunch and a made-up id; over budget both get the identical 429; a member over budget gets 429, not 403 (edits `api-authorization`)                                                                                                                                                                    | M4        |
| L6  | signed-out visitor                                              | a run of requests from one address ends in a 429 (not before the 30th); a real token and the invite response are then refused from that address too; another address is untouched and its real token still previews. ("Works again afterwards" is the limiter's own window test: e2e cannot move the server's clock.)                                              | M4        |
| S2  | signed-in person with a corrupt, then an expired session cookie | every API route answers 401 (never 200, never a 500) and a page redirects to sign-in; guards against the "auth fails open" advisory after the bump                                                                                                                                                                                                                 | M1        |
| S3  | host and invitee                                                | the main paths (dashboard, wizard, brunch page, manage, invite landing, sign-in page) raise no `securitypolicyviolation` and no CSP console error, light and dark                                                                                                                                                                                                  | M5        |
| S1  | (existing, edited)                                              | also asserts the CSP header name and its key directives                                                                                                                                                                                                                                                                                                            | M5, M6    |

Journeys that change: `front-door.spec.ts` (S1), `api-authorization.spec.ts` (L5 cases added), `invitations-host.spec.ts` or the file that owns Resend (checked by grep at M3; L2 is added beside it). **Accessible names that change: none.** The limited lines are new text inside the existing `role="alert"` regions, found by their text.

**Phone:** nothing is left out; the limited line is the same inline alert at phone width. No phone board needed: the alert is an existing primitive in an existing place (the `D3` layout check already covers both screens).

**Voice:** the three new strings (invites, resend, place search) are the only copy this spec adds. They follow Brand Voice ("friend, not service"; no "successfully", no "rate limit", no promise to retry automatically). They are the one deliberate exception to "error wording belongs to the feedback-surfaces spec" in `apps/web/CLAUDE.md`, because a person told only "Failed to send invite" will keep clicking.

---

## What This Spec Does Not Cover

Each is recorded in ADR 0013 or 0014 and in PLANNING §17.

- **A sign-in limiter.** Google is the only provider and throttles it; no password exists to guess.
- **A per-IP limit on signed-in traffic** (shared networks).
- **Showing remaining budget, or disabling a control before its first refusal.** A control disables only after a 429; a different device or browser (or cleared site data) learns on its first click, which gets the 429 and disables from then on. Making that accurate needs a read-only budget check on every page load.
- **Waiting Approve buttons, and sharing a wait between tabs or components.** Approving a suggestion that is refused shows the line but its Approve buttons do not wait or remember the wait, and a wait is not shared between tabs or between components on one page (each control learns on its first click; sharing it needs `storage` events and a shared store, more than a beta needs).
- **The creation wizard's ignored invite response** (spec 0004): a limited batch in the wizard fails silently, like any failure there today. Owned by the feedback-surfaces spec ("Silent failures to surface").
- **Real error wording for every other control** that receives a 429 from the write catch-all (feedback-surfaces).
- **A limit on the server-rendered `/invite/[token]` page** (a token is a random UUID; the page already answers bad tokens uniformly).
- **Alerting or a dashboard for limit hits** (they are logged; the deployment spec decides where logs go).
- **HSTS and `upgrade-insecure-requests`** (they break `http://localhost`; the deployment spec sets them with the domain).
- **Dependabot** (a repository setting; proposed in `docs/SETUP.md`, never written by the agent).
- **A CSP violation-report endpoint.**
- **The invite-link GET that RSVPs "yes"**, **expired or invalid session wording**, and **account deletion**: unchanged in PLANNING §17, with the feedback-surfaces and Settings specs.
- **The brunch size cap** (separate product decision, §17).
- **Tuning the numbers.** They are starting points; the beta decides.

## Open Questions

1. **Are the starting numbers right?** 100 invite emails per host per day, 50 per brunch per day, resend every 10 minutes, 30 and 20 place calls a minute, 60 writes a minute, 30 bad tokens a minute. Chosen as roomy for a real host and tight for a script; no data yet.
2. **Does `next-auth@5.0.0-beta.32` clear the advisories** that name a `5.0.0` that does not exist? **Answered in M1: yes**, every Auth.js advisory is cleared (and `next` 15.5.28 and five transitive overrides clear the rest); nothing is on the ignore list. Recheck when Auth.js v5 goes stable.
3. **Does Chromium apply `form-action` to the redirect after the sign-in form post?** The policy allows Google's origin for that case; M6's manual sign-in confirms the minimal list. **Owner defers to the recommendation:** keep Google's origin only if the manual sign-in shows it is needed.
4. **Does Vercel overwrite a client-supplied `x-forwarded-for`?** Checked on the real deployment (deployment spec), not here.
