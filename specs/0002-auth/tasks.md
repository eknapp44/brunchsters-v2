# Tasks 0002 — Authentication

**Spec:** [spec.md](./spec.md) | **Plan:** [plan.md](./plan.md)  
**Branch:** `feat/0002-auth`

---

## M1 — Auth.js v5 install + Google provider + route handler

- [ ] Install `next-auth@beta` and `@auth/prisma-adapter` in `apps/web`
- [ ] Create `apps/web/src/auth.ts` — configure Auth.js with Google provider, database session strategy
- [ ] Create `apps/web/src/app/api/auth/[...nextauth]/route.ts` — export GET and POST handlers
- [ ] Set `AUTH_SECRET`, `AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` confirmed in `.env.local` (already done)
- [ ] Verify Google OAuth flow completes — sign in, session returned from `auth()` in a server component
- [ ] `pnpm typecheck && pnpm lint` pass
- [ ] Commit: `feat: install Auth.js v5 and wire Google OAuth route handler (M1)`

---

## M2 — User upsert + UserAuthProvider persistence

- [ ] Create `packages/core/src/auth/signInCallback.ts` — upsert logic:
  - Look up `UserAuthProvider` by `provider + providerUserId`
  - Found → return linked `User`
  - Not found, email exists → link provider to existing `User`, create `UserAuthProvider`
  - Not found, email new → create `User` + `UserAuthProvider`
- [ ] Export `signInCallback` from `packages/core/src/index.ts`
- [ ] Wire `signInCallback` into `auth.ts` `signIn` callback
- [ ] Write unit tests `packages/core/src/auth/signInCallback.test.ts`:
  - New user (no existing User, no existing provider)
  - Repeat sign-in (existing UserAuthProvider found)
  - Existing email, new provider (link to existing User)
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass
- [ ] Commit: `feat: persist User and UserAuthProvider on sign-in (M2)`

---

## M3 — Middleware + route protection

- [ ] Create `apps/web/src/middleware.ts`
- [ ] Define public routes: `/`, `/sign-in`, `/invite/:token`, `/api/auth/:path*`
- [ ] Unauthenticated requests to all other routes → redirect to `/sign-in?callbackUrl=<original>`
- [ ] Authenticated requests → pass through
- [ ] Verify: visiting `/dashboard` unauthenticated redirects correctly; post-sign-in lands on `/dashboard`
- [ ] `pnpm typecheck && pnpm lint` pass
- [ ] Commit: `feat: add middleware for route protection with callbackUrl redirect (M3)`

---

## M4 — Sign-in page + nav UI

- [ ] Create `apps/web/src/app/sign-in/page.tsx` — "Sign in with Google" button, minimal styling
- [ ] Create `apps/web/src/app/(authenticated)/layout.tsx` — validates session for authenticated route group
- [ ] Create `apps/web/src/app/(authenticated)/dashboard/page.tsx` — placeholder ("Dashboard — coming soon")
- [ ] Add user avatar + name to nav when session exists
- [ ] Add sign-out button/action (server action calling `signOut()`)
- [ ] Full browser flow tested: `/` → sign in → nav shows avatar → sign out → back to `/`
- [ ] `pnpm typecheck && pnpm lint` pass
- [ ] Commit: `feat: sign-in page, nav avatar, and sign-out action (M4)`

---

## Testing Notes

### M2

- **What was tested:** All three sign-in paths (new user, repeat sign-in, existing email + new provider) and db error handling
- **How:** Unit tests with mocked DbClient in `packages/core/src/auth/signInWithProvider.test.ts`
- **What's deferred:** Full OAuth E2E (browser) — verified manually in M4
- **How to run:** `pnpm test --filter @brunchsters/core`

### M4

- **What was tested:** Full Google OAuth flow end-to-end in the browser — sign in, avatar in nav, sign out, callbackUrl redirect. Verified `/dashboard` → 307 redirect to `/sign-in?callbackUrl=%2Fdashboard` while unauthenticated, and successful sign-in landing on `/dashboard`.
- **How:** Manual browser test with local Supabase + `pnpm dev`. Also captured the raw Auth.js authorization redirect via curl to confirm the correct `client_id` is transmitted to Google.
- **What's deferred:** Invite link redirect flow (tested when invite feature is built); Apple Sign-In (deferred to near launch)
- **How to run:** `supabase start && pnpm dev` — navigate to `http://localhost:3000`, click sign in, complete Google OAuth
- **Gotcha fixed during verification:** A bare Auth.js v5 `Google` provider auto-infers `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`, not our `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` — which sent `client_id=undefined` and produced a misleading `invalid_client` error. Credentials are now wired explicitly in `auth.ts`.
