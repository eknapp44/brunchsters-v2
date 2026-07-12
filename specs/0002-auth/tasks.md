# Tasks 0002 — Authentication

**Spec:** [spec.md](./spec.md) | **Plan:** [plan.md](./plan.md)  
**Branch:** `feat/0002-auth`

---

## M1 — Auth.js v5 install + Google provider + route handler

- [x] Install `next-auth@beta` in `apps/web` (Prisma adapter skipped — see plan.md)
- [x] Create `apps/web/src/auth.ts` — configure Auth.js with Google provider, JWT session strategy
- [x] Create `apps/web/src/app/api/auth/[...nextauth]/route.ts` — export GET and POST handlers
- [x] Set `AUTH_SECRET`, `AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` in `apps/web/.env.local`
- [x] Verify Google OAuth flow completes — sign in, session returned from `auth()` in a server component
- [x] `pnpm typecheck && pnpm lint` pass
- [x] Commit: `feat: install Auth.js v5 and wire Google OAuth route handler (M1)`

---

## M2 — User upsert + UserAuthProvider persistence

- [x] Create `packages/core/src/auth/signInWithProvider.ts` — upsert logic:
  - Look up `UserAuthProvider` by `provider + providerUserId`
  - Found → return linked `User`
  - Not found, email exists → link provider to existing `User`, create `UserAuthProvider`
  - Not found, email new → create `User` + `UserAuthProvider`
- [x] Export `signInWithProvider` from `packages/core/src/index.ts`
- [x] Wire `signInWithProvider` into `auth.ts` `jwt` callback
- [x] Write unit tests `packages/core/src/auth/signInWithProvider.test.ts` (all branches + db error)
- [x] Write integration test `packages/core/src/auth/signInWithProvider.integration.test.ts` against local Postgres
- [x] `pnpm typecheck && pnpm lint && pnpm test` pass
- [x] Commit: `feat: persist User and UserAuthProvider on sign-in (M2)`

---

## M3 — Middleware + route protection

- [x] Create `apps/web/src/middleware.ts`
- [x] Define public routes: `/`, `/sign-in`, `/invite/:token`, `/api/auth/:path*`
- [x] Unauthenticated requests to all other routes → redirect to `/sign-in?callbackUrl=<original>`
- [x] Authenticated requests → pass through
- [x] Verify: visiting `/dashboard` unauthenticated redirects correctly (307 → `/sign-in?callbackUrl=%2Fdashboard`)
- [x] `pnpm typecheck && pnpm lint` pass
- [x] Commit: `feat: add middleware for route protection with callbackUrl redirect (M3)`

---

## M4 — Sign-in page + nav UI

- [x] Create `apps/web/src/app/sign-in/page.tsx` — "Sign in with Google" button
- [x] Create `apps/web/src/app/(authenticated)/layout.tsx` — passthrough for authenticated route group
- [x] Create `apps/web/src/app/(authenticated)/dashboard/page.tsx` — placeholder
- [x] Add user avatar + name to nav when session exists
- [x] Add sign-out button/action (server action calling `signOut()`)
- [x] Full browser flow tested: `/sign-in` → Google OAuth → nav shows avatar → sign out → back to `/`
- [x] `pnpm typecheck && pnpm lint` pass
- [x] Commit: `feat: sign-in page, nav avatar, and sign-out action (M4)`

---

## Deferred / Known gaps

- **Soft-deleted user re-activation** — `UserAuthProvider` has no `deletedAt`. If a user's `User` record is soft-deleted, a repeat sign-in via the same provider will still find the `UserAuthProvider` row and return that `userId`, effectively re-activating the account. Safe to defer until account-deletion is built — handle it there.
- **Concurrent first-time sign-in race** — Two simultaneous first sign-ins for the same email both pass the `findFirst` checks; the second hits the `email @unique` constraint and returns `db_error`. Self-correcting on retry, low probability. Revisit if signup volume makes it observable.
- **`session` callback `userId` type** — reads `token.userId` via `token as Record<string, unknown>` cast because augmenting `next-auth/jwt`'s `JWT` interface conflicted with Auth.js v5 internal types. Revisit when Auth.js v5 types stabilise.
- **Invite link redirect flow** — tested when invite feature is built
- **Apple Sign-In** — deferred to near launch ($99/year account)

---

## Testing Notes

### M2 — Unit tests

- **What was tested:** All three sign-in paths (new user, repeat sign-in, existing email + new provider) and db error handling
- **How:** Unit tests with mocked DbClient in `packages/core/src/auth/signInWithProvider.test.ts`
- **What's deferred:** See integration test note below
- **How to run:** `pnpm test --filter @brunchsters/core`

### M2 — Integration test

- **What was tested:** All three paths against real local Postgres — new user creates rows, repeat sign-in updates `lastLoginAt`, existing email links new provider. Verified soft-delete middleware doesn't interfere with test cleanup.
- **How:** Vitest against local Supabase Postgres; unique email per test run via `Date.now()` suffix; cleanup in `afterAll`
- **What's deferred:** Concurrent sign-in race (low probability, see Deferred section)
- **How to run:** `supabase start` then `pnpm --filter @brunchsters/core test:integration`

### M4 — Browser verification

- **What was tested:** Full Google OAuth flow end-to-end — sign in, avatar in nav, sign out, callbackUrl redirect. Verified `/dashboard` → 307 redirect to `/sign-in?callbackUrl=%2Fdashboard` while unauthenticated.
- **How:** Manual browser test with local Supabase + `pnpm dev`. Also captured the raw Auth.js authorization redirect via curl to confirm the correct `client_id` is transmitted to Google.
- **What's deferred:** Invite link redirect flow; Apple Sign-In
- **How to run:** `supabase start && pnpm dev` — navigate to `http://localhost:3000/sign-in`
- **Gotcha fixed during verification:** A bare Auth.js v5 `Google` provider auto-infers `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`, not our `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`. This sent `client_id=undefined` and produced a misleading `invalid_client` error. Credentials are now wired explicitly in `auth.ts`.
