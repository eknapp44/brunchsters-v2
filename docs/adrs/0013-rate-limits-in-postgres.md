# 0013 — Rate limits: Postgres counters behind a `RateLimiter` interface

**Date:** 2026-10-22  
**Status:** Accepted  
**Deciders:** Evan Knapp

## Context

Nothing limits anything today (verified 2026-10-22). The surfaces that cost money or reputation:

- **Invite email.** `sendInvites` caps one request at `MAX_INVITES_PER_REQUEST = 50`; nothing caps requests. A signed-in person can loop on `POST /api/v1/brunches/[id]/invites` and email any address (a spam relay on our sending domain), and `POST /api/v1/invites/[id]/resend` has no cooldown.
- **Google Places.** `places/search` and `places/[placeId]` are billed per call by Google. Neither handler calls `auth()`; only `middleware.ts` keeps signed-out callers out. The client debounces; the server does not enforce anything.
- **Every other write** (RSVP, votes, options, suggestions, brunch creation) is unbounded.
- **The public invite-token routes** answer anyone, signed in or not.

Constraints that shape the answer:

- Hosting is Vercel serverless ([ADR 0002](./0002-hosting-vercel-supabase.md)): an in-memory counter lives and dies per instance and limits nothing.
- `middleware.ts` runs on the edge runtime, where Prisma does not run, so the limiter cannot live there.
- Constitution 9 (database is portable, plain Postgres) and 7/15 (providers behind interfaces, `packages/core` is framework-free).
- CLAUDE.md: the 404-for-outsiders rule. A limit must never let a caller tell a real brunch from a made-up id.
- CLAUDE.md: no test-only bypass in production code, and the e2e suite runs every worker from one IP against one server.
- Sign-in is Google only ([ADR 0003](./0003-no-email-password-auth.md)): there is no password to guess, so a sign-in limiter would only guard account creation, which Google already throttles.

## Decision

1. **A `RateLimiter` interface in `packages/core`** (`consume({ policy, subject, cost })` returning a `Result` of allowed-with-remaining or denied-with-`retryAfterSeconds`), a **`PostgresRateLimiter`** implementation that takes the injected `db`, and an in-memory implementation for unit tests. Callers depend on the interface, so moving to Redis later is an adapter swap.
2. **One table, `RateLimitBucket`** (`key`, `windowStart`, `count`; primary key `[key, windowStart]`), a **fixed window** counter. `consume` is one atomic `INSERT ... ON CONFLICT DO UPDATE SET count = count + cost WHERE count + cost <= limit`: no read-modify-write race, and a denied request does not inflate the count. The key is `<policy>:<subject>`.
3. **Keyed by the caller, never by the brunch's existence.** The subject is the signed-in user id (or, on the public token routes, the client IP). A made-up brunch id and a real one spend the same budget and get the same 429, so the limiter cannot be used to confirm a brunch. Limits that name a brunch or invite (per-brunch invite cap, resend cooldown) are consumed **after** the host check, so an outsider never reaches them.
4. **Policies are named constants in `packages/shared`** (no configuration, Constitution 2), starting at: invite emails 100 per host per day and 50 per brunch per day; resend 1 per invite per 10 minutes (and it spends one invite email); place search 30 per person per minute; place details 20 per person per minute; every other authenticated write 60 per person per minute; invalid invite-token attempts 30 per IP per minute. They are starting points to be tuned with beta data. Approving an invite suggestion (including the automatic approval when a brunch does not ask the host) is an invite email too, so it spends one unit of the brunch and host budgets: approvals are not a way round the cap.
5. **The write catch-all is applied in route handlers** (one helper, called right after `auth()`), not in middleware (edge cannot reach Postgres). A test scans `app/api/v1/**/route.ts` and fails when a handler that exports POST, PUT, PATCH or DELETE does not call it, so a new endpoint cannot ship unlimited.
6. **Order in a handler:** session (401) → limit (429) → parse → service (membership, then the rules). The limit only reads the caller's own counter, so it reveals nothing about any brunch.
7. **What a limited caller gets:** HTTP 429 with a `Retry-After` header and `{ error, policy, retryAfterSeconds }` (the policy name lets a control word its message). The invite panel disables the send button (and the one invite's Resend) after a 429, with one inline line in the Brand Voice; the end time is stored as an absolute timestamp in `localStorage` per user, so a refresh or sign-out and sign-in keeps it. Place search shows its line and stays usable. Every other control keeps its generic error until the feedback-surfaces spec.
8. **Fail closed.** If the limiter cannot reach the database the request is refused (503). The app cannot do anything useful without that database anyway, and failing open would make the cost controls disappear exactly when something is wrong.
9. **Retention.** Counters are operational data, not a domain entity: no soft delete (the table is not in the soft-delete set), and an Inngest daily job hard-deletes buckets older than two days (Constitution 11 allows a justified hard delete; 30 asks for a retention rule). The table holds a user id or an IP, nothing else.
10. **The client IP** is read in one function (`clientIp`) from the first `x-forwarded-for` entry. Vercel sets that header for deployed traffic; the e2e suite sends its own so a journey gets its own bucket. Confirming that Vercel overwrites a client-supplied value is a deployment-spec check.

## Consequences

- **Supersedes** the deferred-items row in `PLANNING.md` that said a rate-limit log should use Redis with TTL keys and not be a database table; that row now points here.
- Windows are fixed and aligned to the Unix epoch, so a "daily" limit resets at 00:00 UTC for everyone, and a refused caller can be told a short wait late in the day.

- Easier: one pattern for every limit; real counting in unit, integration and e2e tests with no seam in production code; no new account, key or environment variable; swapping the store is one adapter.
- Harder: a Postgres write on every limited request (fine at beta scale; the first thing to revisit if write latency shows it); a fixed window allows up to twice the limit across a window boundary (accepted: these limits stop volume abuse, not a precise quota); the catch-all runs inside handlers, so a new route must call it (the scanning test enforces that).
- **Deliberately not done** (also in the spec and PLANNING §17): no sign-in limiter (Google throttles it, there is no password); no per-IP limit on signed-in traffic (one NAT, one office); no proactive "you have N left" UI and no server-side wait on page load (a control disables after its first 429; another device learns on its first click); approving a suggestion that is refused shows the line but its Approve buttons do not wait or remember the wait, and a wait is not shared between tabs or between components on one page (each control learns on its first click; sharing it needs `storage` events and a shared store, more than a beta needs); the creation wizard ignores its invite response today, so a limited batch there fails silently (the feedback-surfaces spec owns that known gap); no limit on the server-rendered `/invite/[token]` page (a token is a random UUID, and the page already answers a bad one the same way as an expired one); no alerting on limit hits (logged only; the deployment spec decides where logs go).

## Alternatives considered

- **Upstash Redis / Vercel KV.** The textbook store, faster, with native expiry. Rejected for the beta: a new vendor account, key and environment variable in the pre-launch checklist, and e2e would need a fake or a live instance. The interface keeps it open.
- **Vercel Firewall rate-limit rules only.** No code, but it cannot key by signed-in user, cannot be run locally or in e2e, and ties a business rule to the host (Constitution 8). Reasonable as an extra layer on the deployment; not the policy.
- **In-memory counters.** Do nothing on serverless.
- **Middleware enforcement.** One place for all routes, but edge cannot run Prisma, and calling a Postgres-over-HTTP service from the edge brings back the vendor question.
- **Sliding window or token bucket.** Smoother, more SQL, and more to test for no benefit at these numbers.
- **Env-configurable limits so tests can lower them.** A test-only seam in production code, which CLAUDE.md forbids; tests spend the real budget instead (cheap ones first: resend, places and the write cap need no email).
