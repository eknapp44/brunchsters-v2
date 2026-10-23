# Plan 0012 — Security Hardening

## Files

**New**

- `packages/database/prisma/schema.prisma` (+ migration `…_rate_limit_bucket`): `RateLimitBucket`.
- `packages/shared/src/rateLimits.ts`: the policy constants (`name`, `limit`, `windowSeconds`) and `RATE_LIMIT_POLICIES`; re-exported from the package index.
- `packages/core/src/rateLimit/RateLimiter.ts`: the interface, `RateLimitDecision`, `RateLimitError`.
- `packages/core/src/rateLimit/PostgresRateLimiter.ts` (+ `.test.ts`, `.integration.test.ts`): takes `db` and an optional `now: () => Date`.
- `packages/core/src/rateLimit/InMemoryRateLimiter.ts`: for unit tests of services and handlers (named for what it is, like `MockEmailService`).
- `packages/core/src/rateLimit/retryAfter.ts` (+ test): window math (`windowStart`, `retryAfterSeconds`), pure.
- `packages/core/src/rateLimit/pruneRateLimitBuckets.ts` (+ integration test).
- `apps/web/src/lib/rateLimit.ts` (+ test): `rateLimitedResponse(decision)`, `clientIp(headers)`, `enforceWriteLimit(session)`; builds the `PostgresRateLimiter` from `db`. (M3 ships `rateLimitedResponse` and the fail-closed 503; `clientIp` and `enforceWriteLimit` arrive in M4)
- `apps/web/src/lib/limitedCopy.ts` (+ test): the three strings and the duration wording.
- `packages/core/src/rateLimit/consumeBudgets.ts` (+ test): spends several budgets in order, names the one that refused, fails closed; `RecordingRateLimiter.ts`: test support that records spends.
- `apps/web/src/lib/readRateLimit.ts` (+ test): reads a 429 (body, then `Retry-After`, then a minute); `limitedUntil.ts` (+ test): the pure storage half of the hook.
- `apps/web/src/lib/useLimitedUntil.ts` (+ test of the pure parts: read, expiry, blocked storage): the persisted wait.
- `apps/web/src/app/api/v1/routeLimits.test.ts`: the scanning test.
- `apps/web/src/lib/contentSecurityPolicy.ts` (+ test): the pure policy builder.
- `apps/web/e2e/journeys/rate-limits.spec.ts` (L1–L6), `apps/web/e2e/journeys/session-integrity.spec.ts` (S2, or added to `sessions.spec.ts` if it fits), CSP journey S3 in `front-door.spec.ts`.

**Changed**

- `packages/core/src/invite/sendInvites.ts`, `resendInvite.ts`: take `rateLimiter` in `ctx`; new `rate_limited` error variant (`retryAfterSeconds`).
- Route handlers: `brunches/[id]/invites`, `invites/[id]/resend` (map `rate_limited` to 429); both Places routes (add `auth()` and the limit); every mutating route under `app/api/v1` (one line after `auth()`); the two token routes (count invalid attempts).
- `apps/web/src/lib/services.ts`: `getRateLimiter()` next to `getEmailService()` (one construction point, as ADR 0009).
- `apps/web/src/inngest/functions.ts`, `events.ts`: the prune cron function.
- `apps/web/src/middleware.ts`: nonce + CSP (M5/M6).
- `InvitePanel.tsx`, `PlaceSearchInput.tsx`: read 429 and show the limited line.
- `package.json` files, lockfile, `.github/workflows/ci.yml` (audit step), `docs/*`, `CLAUDE.md` files, `apps/web/e2e/journeys/front-door.spec.ts`, `api-authorization.spec.ts`.

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

Each control keeps its own state in `useState` (ADR 0011: a single control's state); no slice. A new hook, `apps/web/src/lib/useLimitedUntil.ts`, holds "limited until" for a control:

- `limitedUntil` is an **absolute timestamp** (`Date.now() + retryAfterSeconds * 1000`), written to `localStorage` under `limit:<control>:<userId>[:<id>]` (the Resend button adds its invite id). On mount it reads the key and, if the time is still ahead, starts disabled; a timer re-enables at that moment, and the key is removed.
- A refresh, a closed tab, or a sign-out and sign-in as the same person keeps the wait. A different person in the same browser has a different key. The windows are fixed, so the saved time is the exact moment the counter resets: the next click after it succeeds.
- Every `localStorage` call is in `try/catch`; when storage is blocked the hook keeps the time in memory and the server's 429 remains the real enforcement.
- It does not cover another device or cleared site data: those learn on their first click (the server answers 429, the control disables). An accurate answer there needs a read-only budget check on page load, not built (spec "Does Not Cover").
- Disabled means `aria-disabled="true"` plus ignoring the click, so the button stays in the tab order and the line beside it (an `InlineAlert`, `role="status"`: it is news about a wait, not an error) stays attached. The wait is static text, not a ticking countdown. The label does not change.
- Invites and Resend use it. Place search shows its line and clears it when the wait passes, but the input stays usable (the wait is seconds).

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

| Risk                                                                                          | Mitigation                                                                                                                                                           |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| e2e trips its own limits (one IP, parallel workers)                                           | person-keyed limits only; each journey owns its users; the IP limit counts only 404s and no existing journey calls the token API; L6 sends its own `x-forwarded-for` |
| L1 needs 51 queued emails                                                                     | the outbox is files and the queue runs 5 at a time; if it is too slow the test asserts on the 429 and the unchanged list and does not wait for delivery              |
| The write catch-all misses a future route                                                     | the scanning test (fails on an unlisted mutating handler)                                                                                                            |
| A shared limit makes a real person trip it (two tabs, a busy vote)                            | 60 a minute is roomy for hand use; the counter is per person; tune with beta data                                                                                    |
| CSP breaks a page in a way e2e cannot see (the real Google redirect, a font, a dev-only eval) | report-only first, S3 fails on any violation, manual real sign-in before enforcing, and the deployment checklist rechecks on the real host                           |
| `next-auth@5.0.0-beta.32` is not enough                                                       | recorded per advisory, owner decides (Open Question 2); the audit gate still ships with a dated ignore list                                                          |
| The Next patch bump changes behavior                                                          | its own commit in M1, full suite in dev and CI mode, no other change in that commit                                                                                  |
| A fixed window double-bursts at the boundary                                                  | accepted (ADR 0013); the numbers are volume guards                                                                                                                   |
| Limiter DB errors lock everyone out                                                           | the same database is already required by every route; a 503 with the cause logged                                                                                    |

## Test strategy

- **Unit (vitest):** policy math and window boundaries; `InMemoryRateLimiter`; the decision-to-429 mapping; `clientIp`; `formatWait`; the CSP builder; every service change (denied send creates nothing and emits nothing; budgets consumed after the host check and not before; the de-duplicated count is what is charged; outsider and made-up ids give identical results); handler order tests per route family; the scanning test.
- **Integration (real local Postgres, `pnpm --filter @brunchsters/core test:integration`):** `PostgresRateLimiter` under concurrency (50 parallel `consume` calls at limit 10 allow exactly 10), denial does not increment, window rollover with the injected clock, cost greater than the limit, prune keeps today's buckets, and `sendInvites` against a real brunch with the real limiter.
- **E2E:** L1–L6, S2, S3, and the edited S1 and `api-authorization`. Each new journey is proven to fail with its fix removed (the proof is listed in the milestone).
- **Manual:** real Google sign-in after the dependency bump (M1) and after enforcing CSP (M6).
