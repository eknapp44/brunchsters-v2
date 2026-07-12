# Spec 0002 — Authentication

**Status:** Complete  
**Branch:** `feat/0002-auth`  
**PLANNING.md ref:** §4 Auth Strategy, §5 User Flows, §8 User & Auth schema, §9.2 Soft-Delete Email Collision

---

## What

Wire Google sign-in into the app using Auth.js v5. On first sign-in, create a `User` and `UserAuthProvider` record. On subsequent sign-ins, look up the existing user by provider ID. Protect all authenticated routes. Handle the invite link redirect flow so users land on the right page after auth.

Apple Sign-In is **deferred** — build and validate with Google first. The schema and Auth.js provider slot are designed for it; adding it later is additive.

---

## User Flows

### New user — direct visit

1. Visits `/` (unauthenticated) → sees landing page with "Sign in with Google" CTA
2. Clicks → Google OAuth flow → returns to app
3. `User` + `UserAuthProvider` created in DB
4. Redirected to `/dashboard`

### Returning user — direct visit

1. Visits any protected route → already has a session → lands directly
2. Or: session expired → redirected to `/sign-in` → signs in → returns to original destination

### New/returning user — via invite link

1. Clicks invite link (e.g. `/invite/[token]`) while unauthenticated
2. Redirected to `/sign-in?callbackUrl=/invite/[token]`
3. Signs in with Google
4. Redirected back to `/invite/[token]` — not to dashboard
5. This is the critical UX moment from PLANNING.md — it must feel invisible

### Sign-out

1. User clicks avatar → "Sign out"
2. Session destroyed, redirected to `/`

---

## Acceptance Criteria

- [x] Google sign-in completes end-to-end (OAuth flow → session → redirect)
- [x] First sign-in creates `User` + `UserAuthProvider` rows in DB
- [x] Repeat sign-in finds existing user — does not create duplicates
- [ ] Soft-deleted user email collision handled — deferred to account-deletion spec (see tasks.md)
- [x] All routes except `/`, `/sign-in`, and `/invite/[token]` require authentication
- [x] Unauthenticated access to protected routes redirects to `/sign-in` with `callbackUrl`
- [x] Post-auth redirect honors `callbackUrl` — invite links land correctly (verified with callbackUrl param)
- [x] Session strategy is JWT (not database-backed) — Prisma adapter incompatible with domain schema; user upsert handled in `jwt` callback, internal `userId` stored in token (see plan.md)
- [x] User avatar and name visible in nav when authenticated
- [x] Sign-out clears session and redirects to `/`
- [x] `pnpm typecheck` and `pnpm lint` pass
- [x] Unit + integration tests written for `signInWithProvider` upsert logic

---

## What This Spec Does Not Cover

- Apple Sign-In (deferred to near launch)
- Magic link auth (v2)
- Role-based access control beyond `isAuthenticated`
- User profile editing
- Account deletion / soft-delete flow (handled when we build user settings)
