# 0003 — No email/password authentication

**Date:** 2026-06-14  
**Status:** Accepted  
**Deciders:** Evan Knapp  

## Context

Brunchsters needs user accounts for brunch planning. The question was whether to support traditional email/password sign-in alongside social OAuth (Google, Apple) or to offer social sign-in only.

## Decision

**Social sign-in only** for v1: Google OAuth first, Apple Sign-In closer to launch. No email/password authentication.

## Consequences

- **Easier:** no password reset flow, no hashed password storage, no "forgot password" email, no credential stuffing attack surface, no OWASP password policy compliance burden; users don't need to create or remember a new password.
- **Harder:** users without a Google account can't sign in until Apple is added; Apple Developer account costs $99/year; some users distrust "sign in with Google."

## Alternatives considered

- **Email/password + OAuth** — rejected: doubles the auth surface for a solo developer. Password reset alone is a multi-screen flow with its own email deliverability dependencies. The first version should ship auth that works, not auth that's comprehensive.
- **Magic link (email only)** — considered: passwordless, low friction. Rejected because it adds Resend dependency to the auth flow immediately (can't create an account without a working transactional email pipeline). OAuth defers that dependency.
- **Passkeys** — attractive long-term; browser support is good but not universal. Adds complexity without enough user familiarity payoff at this stage. Worth revisiting post-launch.

> **Note:** Detailed deliberation predates this repo's git history — this ADR captures the outcome and rationale retroactively from pre-development planning.
