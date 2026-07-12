# Plan 0002 — Authentication

**Spec:** [spec.md](./spec.md)  
**Library:** Auth.js v5 (`next-auth@beta`) — chosen for native App Router support (see decision note below)

---

## Decision Note: Auth.js v5

Auth.js v5 is in beta but is the correct choice for Next.js 15 App Router. v4 has known friction with server components and middleware in App Router. v5 is designed for it and will become the stable release. Risk on a solo side project is acceptable.

---

## Architecture

### Files introduced

```
apps/web/src/
  auth.ts                          # Auth.js config — providers, adapter, callbacks
  middleware.ts                    # Route protection — runs on every request
  app/
    sign-in/
      page.tsx                     # Sign-in page
    api/
      auth/
        [...nextauth]/
          route.ts                 # Auth.js route handler (GET + POST)
    (authenticated)/               # Route group — all routes requiring auth
      dashboard/
        page.tsx                   # Placeholder dashboard (wired up in later spec)
      layout.tsx                   # Validates session for the group
```

### Session strategy: JWT (not database sessions)

The plan originally called for database sessions via `@auth/prisma-adapter`. On implementation, the adapter requires specific table names (`Account`, `Session`, `VerificationToken`) and field names (`emailVerified`, `image`) that conflict with our domain schema. Bending the schema to fit the adapter would be wrong — our schema is the source of truth.

**Decision: JWT sessions, no adapter.** We handle user upsert ourselves in the `jwt` callback and store our internal `User.id` (UUID) in the token. Tradeoffs:

- Session invalidation is not instant (token valid until expiry) — acceptable for v1
- No extra tables needed — keeps schema clean
- Full control over user creation logic — fits our `UserAuthProvider` pattern cleanly

`@auth/prisma-adapter` is not used and should not be installed.

### User upsert on sign-in

Auth.js calls our `signIn` callback with the Google profile. We:

1. Look up `UserAuthProvider` by `provider + providerUserId`
2. If found → return the linked `User` (existing user, repeat sign-in)
3. If not found → check if `User` exists by email
   - If yes → link this provider to the existing user (same person, new provider)
   - If no → create `User` + `UserAuthProvider` (brand new user)

This logic lives in `packages/core/src/auth/signInWithProvider.ts` — not in the route handler.

### Route protection via middleware

`middleware.ts` runs on every request. Pattern:

- **Public routes:** `/`, `/sign-in`, `/invite/[token]`, `/api/auth/**`
- **Protected:** everything else → redirect to `/sign-in?callbackUrl=<original-url>`

Middleware reads the session token — no DB call on every request.

### Invite link redirect

Auth.js v5 supports `callbackUrl` natively. When an unauthenticated user hits a protected route, middleware appends `?callbackUrl=<destination>` to the sign-in redirect. Post-auth, Auth.js redirects to `callbackUrl`. The invite route (`/invite/[token]`) is public so it handles its own auth check — but the `callbackUrl` pattern still applies if we redirect from there.

---

## Milestones

### M1 — Auth.js v5 install + Google provider + route handler

Install `next-auth@beta`. Configure `auth.ts` with Google provider and JWT session strategy (Prisma adapter not used — see session strategy note above). Wire `[...nextauth]/route.ts`. Verify Google OAuth flow completes end-to-end with a working session.

**Done when:** You can sign in with Google and `auth()` returns a session in a server component.

### M2 — User upsert + UserAuthProvider persistence

Implement `signInWithProvider` in `packages/core/src/auth/`. On sign-in: look up by `providerUserId`, create or link `User` + `UserAuthProvider`. Write unit + integration tests. Hook into `auth.ts` `jwt` callback.

**Done when:** First sign-in creates DB rows; repeat sign-in reuses them. Tests pass.

### M3 — Middleware + route protection

Add `middleware.ts`. Define public/protected route patterns. Unauthenticated requests to protected routes redirect to `/sign-in?callbackUrl=...`. Authenticated requests pass through.

**Done when:** Visiting `/dashboard` unauthenticated redirects to sign-in with correct `callbackUrl`; signing in redirects back.

### M4 — Sign-in page + nav UI

Build `/sign-in` page with "Sign in with Google" button. Add user avatar + name to nav when authenticated. Add sign-out action. Style is minimal — functional, not polished (UI spec comes later).

**Done when:** Full flow works in the browser: land → sign in → see avatar in nav → sign out → back to landing.

---

## Packages / Dependencies

```
next-auth@beta
@prisma/client (direct dep of apps/web — required for Turbopack externals resolution)
```

`@auth/prisma-adapter` is **not used** — see JWT session decision above.  
`@brunchsters/database` added as a direct dep of both `apps/web` and `packages/core`.

---

## Testing Strategy

- **Unit:** `signInWithProvider` logic in `packages/core` — new user, existing user (repeat sign-in), existing email different provider, db error. Mock Prisma client. (`pnpm test --filter @brunchsters/core`)
- **Integration:** `signInWithProvider` against real local Postgres — all three paths verified including DB row creation and `lastLoginAt` update. Requires `supabase start`. (`pnpm --filter @brunchsters/core test:integration`)
- **Manual:** Google OAuth end-to-end in the browser at M4.
- **Not tested:** Middleware redirect logic (Next.js framework guarantee), Auth.js internals.
