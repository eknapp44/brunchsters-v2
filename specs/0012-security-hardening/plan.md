# Plan 0012 — Security Hardening

## Files

_As built (this section was rewritten at the pre-merge review; the first draft predicted names that moved.)_

**New**

- `packages/database/prisma/schema.prisma` + migration `20261022204018_rate_limit_bucket`: `RateLimitBucket`.
- `packages/shared/src/rateLimits.ts` (+ test): the policy constants (`RATE_LIMIT_POLICIES`), `RATE_LIMIT_RETENTION_DAYS`, and `MAX_RATE_LIMIT_WINDOW_SECONDS` (the longest window, which the client clamps a wait to).
- `packages/core/src/rateLimit/`: `RateLimiter.ts` (the interface), `PostgresRateLimiter.ts` (takes `db` and an optional `now`), `InMemoryRateLimiter.ts` (+ test; for unit tests, can be told to fail), `RecordingRateLimiter.ts` (test support: records spends), `rateLimiterContract.ts` (the behavior both implementations must have, run against each), `retryAfter.ts` (+ test: window math), `consumeBudgets.ts` (+ test: spends several budgets in order, names the one that refused, fails closed), `pruneRateLimitBuckets.ts` (+ test), `rateLimit.integration.test.ts` (the contract and the races against Postgres).
- `apps/web/src/lib/`: `rateLimitHttp.ts` (+ test: the 429, the 503, `clientIp`; pure), `rateLimit.ts` (+ test: `enforceLimit`, `enforceWriteLimit`; uses the counter), `limitedCopy.ts` (+ test: the strings, `formatWait`, `holdsAllInvites`), `readRateLimit.ts` (+ test: reads a 429), `limitedUntil.ts` (+ test: the pure storage half: keys, read, write, handoff, sweep), `useLimitedUntil.ts` (the persisted, shared wait), `contentSecurityPolicy.ts` (+ test: the pure policy builder).
- `apps/web/vitest.setup.ts` (stubs `@/lib/rateLimit` for route tests) and `apps/web/src/app/api/v1/routeLimits.test.ts` (the scanning test).
- `apps/web/e2e/journeys/`: `rate-limits.spec.ts` (L1, L1b, L1c, L2, L2b, L3, L4, L6, L7), `session-integrity.spec.ts` (S2), `content-security-policy.spec.ts` (S3); `apps/web/e2e/support/rateLimits.ts` (`untilRefused`, `alignToWindow`). L5 is in `api-authorization.spec.ts`; S1 in `front-door.spec.ts`.

**Changed**

- `packages/core/src/invite/`: `sendInvites`, `resendInvite`, `reviewInviteSuggestion` (and `suggestInvitee`, which calls it) take `rateLimiter` in `ctx` and return `rate_limited` / `rate_limiter_unavailable`; about a hundred test call sites gained a limiter.
- Route handlers: every mutating route under `app/api/v1` (`enforceWriteLimit` after `auth()`); both Places routes (`auth()` and a per-person budget); both invite-token routes (the address budget); the invites, resend and suggestion-review routes (map the two new errors).
- `apps/web/src/lib/services.ts` (`getRateLimiter()`), `apps/web/src/inngest/functions.ts` and `events.ts` (the prune job), `apps/web/src/middleware.ts` (the policy on every response), `next.config.ts` (comment).
- UI: `InvitePanel.tsx`, `SuggestionsPanel.tsx`, `PlaceSearchInput.tsx`, the creation wizard (`new/page.tsx`, `wizardSlice.ts`), `Button.module.css` (`aria-disabled` looks disabled), `detail.module.css`.
- `package.json` and `pnpm-workspace.yaml` (overrides), the lockfile, `.github/workflows/ci.yml` (the audit step), `docs/*`, the `CLAUDE.md` files and the `spec-grill` skill.

## Key design

### Counter (ADR 0013)

```text
RateLimitBucket(key text, windowStart timestamptz, count int, PK(key, windowStart), INDEX(windowStart))

consume({ policy, subject, cost = 1 }):
  if cost > policy.limit → denied, spends nothing (retryAfter = seconds to the window end, like any denial)
  windowStart = floor(now / windowSeconds) * windowSeconds
  INSERT (key, windowStart, cost) ON CONFLICT (key, windowStart)
    DO UPDATE SET count = count + cost WHERE RateLimitBucket.count + cost <= limit
    RETURNING count
  row returned → allowed, remaining = limit - count
  no row       → denied, retryAfterSeconds = windowStart + windowSeconds - now (at least 1)
```

One statement, so two concurrent requests cannot both squeeze under the limit, and a denied request leaves the count alone. Raw SQL goes through the injected `db.$queryRaw` (the `packages/core` rule is "no `@prisma/client` import", not "no SQL"). The key is `${policy.name}:${subject}`; subjects are a user id, a brunch id, an invite id, or an IP, so no key can collide across policies.

`Date` comes from the injected `now`, defaulting to `new Date()`: the integration test proves window reset without sleeping.

### Order of checks (permission-sensitive)

| Endpoint                                                                                                  | Order                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| any mutating `v1` route                                                                                   | `auth()` → 401 · **write limit (caller)** → 429 · parse/validate · service (membership first: 404, then 403, as today)                                                                                                                     |
| `POST brunches/[id]/invites`                                                                              | the above · service: brunch lookup → host check (404/403 unchanged) → de-dupe and self-filter → **per-brunch cap, then per-host cap, cost = remaining addresses** → transaction → emit                                                     |
| `POST invites/[id]/resend`                                                                                | the write limit · service: invite lookup → host check (404/403) → **cooldown (subject = invite id), then per-host cap (cost 1)** → update → emit                                                                                           |
| `POST suggestions/[id]/review` (approve only), and `POST brunches/[id]/suggestions` when it auto-approves | the write limit · service: suggestion lookup → host check (404/403) → pending check (409) → **brunch budget, then host budget, one unit each** → write → emit. A refused approval leaves the suggestion pending; a decline spends nothing. |
| `GET places/search`, `[placeId]`                                                                          | `auth()` → 401 · **place limit (caller)** → 429 · query validation (400) · Google                                                                                                                                                          |
| token `GET` and `respond POST`                                                                            | **address budget (every request, valid token or not)** → 429 · (respond: `auth()` → 401 as today → **write limit (person)** → 429) · lookup. A limited address is refused before anything is looked up, so it cannot keep probing for free |

Why this is safe for the 404/403 rule: the write limit and the Places limit only read the caller's own counter. The per-brunch and per-invite limits run after the host check, so only a host reaches them. An outsider hits the write limit first (same 429 for real and made-up ids). The per-brunch cap uses the cost of the de-duplicated list, so a re-sent address that already exists still costs one (it re-emails), which matches what is actually sent.

Counting happens before the transaction. If the transaction then fails the units are spent; a failed attempt costing budget is acceptable and simpler than refunds (recorded in the ADR's consequences if it proves wrong in practice).

### What each limit counts

- **Invite email:** one unit per address that will be emailed (create, revive or re-send). A host who already invited an address and lists it again re-emails it, so it counts.
- **Place details:** counted on `GET places/[placeId]` (the call Google bills as the end of a session).
- **Writes:** one unit per mutating request, including requests the service will then reject (400, 403, 404): it is a request-rate limit, not a success counter.

### The 429 and the copy

`rateLimitedResponse` returns `NextResponse.json({ error: 'Too many requests', policy, retryAfterSeconds }, { status: 429, headers: { 'Retry-After': String(seconds) } })`. Controls read `retryAfterSeconds` from the body. `limitedCopy.ts` exports `invitesLimitedMessage(seconds)`, `resendLimitedMessage(seconds)`, `placeSearchLimitedMessage()` and one `formatWait(seconds)` ("about 3 hours", "12 minutes", "a minute"; never "0"). Windows are aligned to the Unix epoch, so a "daily" window is a UTC day and a refused host can be told a short wait late in the day: the wording says "about {wait}", never "tomorrow" or "24 hours". Draft strings (finalized in M3 with the `ui-screen` skill and `design-docs/Brand Voice.html`): "Easy there, that's a lot of invites for one day. Try again in {wait}."; "That one just went out. Give it {wait}."; "Slow down a sec, then try again."

### Client state

Each control keeps its own state in `useState` (ADR 0011: a single control's state); no slice. **The wait is the server's** (M7, M8; ADR 0013 addendum). The earlier design kept an absolute time in `localStorage` and shared it by `storage` events, a handoff key from the wizard and a sweep; it was replaced because every one of those was browser machinery standing in for a question the server can answer.

- **Core:** the limiter gains `peek(inputs)`, a read-only question answered in one round trip by the same rule `consume` applies (`blocked` with the seconds to the end of the window, or `remaining`). `getInviteWaits` (`packages/core/src/invite/getInviteWaits.ts`) asks about the brunch's budget, the host's budget and one cooldown per invite, and returns `send` (the longer of the brunch's and host's waits) and `resend` per invite (the longer of its cooldown and the host's wait). A limiter failure is `rate_limiter_unavailable`.
- **Page:** the brunch page calls it only for the host, after the host-only invite list loaded (so membership is established first), and passes the waits to `InvitePanel` and `SuggestionsPanel`. If the counters cannot be read the page still renders with nothing held; the server still refuses on the click.
- **Hook:** `useWait(fromServer)` (`apps/web/src/lib/useWait.ts`) starts from the server's answer, takes a new one when the page is refreshed, can be told a 429 at once (`start`), and clears at the end of the wait. There is no storage. A control that gets a 429 shows it and calls `router.refresh()`.
- Disabled means `aria-disabled="true"` plus ignoring the click, so the button stays in the tab order and the line beside it (an `InlineAlert`, `role="status"`: it is news about a wait, not an error) stays attached. The wait is static text, not a ticking countdown. The label does not change.
- **One budget, one wait:** the send button and the Approve buttons get the same `send` answer; a Resend held by the host's day shows it and so does the send button. Another tab, another device, a cleared browser and the creation wizard's refused batch (the new brunch's page simply asks) all need no code of their own.
- Place search shows its line and clears it when the wait passes, but the input stays usable (the wait is seconds) and does not remember it.

It does not trigger a "Redux follow-up" in §17 beyond the one it names (showing the server's real message), done only for 429.

### Pruning

An Inngest cron function (`prune-rate-limits`, daily) calls `pruneRateLimitBuckets({ db })`, which `deleteMany`s `windowStart < now - 2 days`. Registered in `functions.ts` so the e2e dev server syncs it. The service is integration-tested; the function wrapper follows the existing pattern (id, trigger, one step).

### CSP (ADR 0014)

`buildContentSecurityPolicy({ nonce, isDevelopment })` returns the header value. `middleware.ts` generates a nonce (`crypto.randomUUID()` base64), puts the policy on the request headers (so Next stamps its inline scripts) and on the response (`Content-Security-Policy-Report-Only` in M5, `Content-Security-Policy` in M6). The `auth(...)` wrapper's early returns (401 JSON, sign-in redirect) set the header too, through one small `withSecurityHeaders(response, policy)`. The matcher already excludes `_next/static`, `_next/image` and the favicon.

### Dependencies

M1 order: bump `next` within 15.x to the newest patched version → `pnpm install` → typecheck, tests, build → bump `next-auth` to `5.0.0-beta.32` → re-run `pnpm audit --prod` → handle what remains (`pnpm.overrides` for patched transitive ranges such as `postcss`, `nanoid`, `sharp`, `source-map-js`; `pnpm.auditConfig.ignoreGhsas` only for an advisory with no available fix, each with a reason and date in a comment-adjacent doc line in `docs/SETUP.md`). Verify a real Google sign-in on the dev server by hand (e2e never reaches Google). Journey S2 (corrupt and expired cookies give 401, never a fail-open) is written before the bump and must pass after it.

## Decisions already made

Counters in Postgres behind `RateLimiter` · fixed window · fail closed · caller-keyed · catch-all in handlers with a scanning test · three user-visible strings · no sign-in limiter · patch `next`/`next-auth` and gate CI · CSP by nonce, report-only then enforced · HSTS and the invite-link GET and session expiry stay out (owner, 2026-10-22).

## Risks

| Risk                                                                                          | Mitigation                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| e2e trips its own limits (one IP, parallel workers)                                           | person-keyed limits only; each journey owns its users; the address limit applies only to the two token routes, which no screen and no earlier journey calls; L6 sends its own `x-forwarded-for` |
| L1 needs 50 invites seeded                                                                    | seeded through the factory (real budget, no queued mail): the first version queued about 100 real emails and starved other journeys of the queue                                                |
| The write catch-all misses a future route                                                     | the scanning test (fails on an unlisted mutating handler)                                                                                                                                       |
| A shared limit makes a real person trip it (two tabs, a busy vote)                            | 60 a minute is roomy for hand use; the counter is per person; tune with beta data                                                                                                               |
| CSP breaks a page in a way e2e cannot see (the real Google redirect, a font, a dev-only eval) | report-only first, S3 fails on any violation, manual real sign-in before enforcing, and the deployment checklist rechecks on the real host                                                      |
| `next-auth@5.0.0-beta.32` is not enough                                                       | recorded per advisory, owner decides (Open Question 2); the audit gate still ships with a dated ignore list                                                                                     |
| The Next patch bump changes behavior                                                          | its own commit in M1, full suite in dev and CI mode, no other change in that commit                                                                                                             |
| A journey that checks "still refused" straddles a window boundary                             | each segment starts only when enough of the server window is left (`alignToWindow`); found by the stress run failing three times in five seconds                                                |
| The Next dev server answers a burst on a cold route with a transient 500                      | the first request of each loop goes alone (`untilRefused`); a production build cannot do this (the log named `ENOENT next-font-manifest.json`)                                                  |
| A fixed window double-bursts at the boundary                                                  | accepted (ADR 0013); the numbers are volume guards                                                                                                                                              |
| Limiter DB errors lock everyone out                                                           | the same database is already required by every route; a 503 with the cause logged                                                                                                               |

## Test strategy

- **Unit (vitest):** policy math and window boundaries; `InMemoryRateLimiter`; the decision-to-429 mapping; `clientIp`; `formatWait`; the CSP builder; every service change (denied send creates nothing and emits nothing; budgets consumed after the host check and not before; the de-duplicated count is what is charged; outsider and made-up ids give identical results); handler order tests per route family; the scanning test.
- **Integration (real local Postgres, `pnpm --filter @brunchsters/core test:integration`):** `PostgresRateLimiter` under concurrency (50 parallel `consume` calls at limit 10 allow exactly 10), denial does not increment, window rollover with the injected clock, cost greater than the limit, prune keeps today's buckets, and `sendInvites` against a real brunch with the real limiter.
- **E2E:** L1 to L7 (with L1b, L1c, L2b), S1 to S3, and `api-authorization` (L5). Each new journey is proven to fail with its fix removed (the proof is listed in the milestone).
- **Manual:** real Google sign-in after the dependency bump (M1) and after enforcing CSP (M6).
