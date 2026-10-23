# 0014 — Content-Security-Policy with a per-request nonce

**Date:** 2026-10-22  
**Status:** Accepted  
**Deciders:** Evan Knapp

## Context

Spec 0011 shipped the basic security headers (`apps/web/next.config.ts`, journey S1). A Content-Security-Policy was left out because Next.js App Router pages carry inline scripts (the flight data and bootstrap), which a strict `script-src` blocks unless each carries a per-request nonce. A static header in `next.config.ts` cannot do that.

What the code does today (verified 2026-10-22): `src/middleware.ts` already runs on every route through `auth(...)`; fonts come from `next/font/google`, self-hosted at build (ADR 0010); two components set an inline `style` attribute (`StepIndicator`, `BallotChecklist`, a computed width); avatars are initials, with a `data:` image in the e2e fixtures; there is no third-party script, and the Inngest and Google Places calls happen on the server. Sign-in is a server action that redirects to Google's consent page.

## Decision

- **Set the CSP in `middleware.ts`**, per request, with a fresh nonce, and pass it to Next on the request headers so Next stamps its own scripts. Because the nonce is per request, every page is rendered dynamically; they all are already (every screen reads the session).
- Directives, confirmed on every main screen in spec 0012 M5 (journey S3, on a production build): `default-src 'self'`; `script-src 'self' 'nonce-…' 'strict-dynamic'` (plus `'unsafe-eval'` in development only, which React's dev tooling needs); `style-src 'self' 'nonce-…'`; **`style-src-attr 'unsafe-inline'`** (a nonce cannot cover a `style=""` attribute; the two computed widths are the only users, and attribute styles cannot run script); `img-src 'self' data:`; `font-src 'self'`; `connect-src 'self'`; `object-src 'none'`; `base-uri 'self'`; `frame-ancestors 'none'` (matches `X-Frame-Options: DENY`); `form-action 'self'` plus Google's sign-in origin (a form post that redirects to another origin is checked against `form-action` in Chromium).
- **Report-Only first, then enforced.** The first milestone ships `Content-Security-Policy-Report-Only` and an e2e journey that fails on any `securitypolicyviolation` while the suite's main paths run; the second flips the header to enforcing after a manual click-through of the real Google sign-in (which e2e cannot do) and a clean full run. The header name is the only difference, so the flip is one line.
- **What M5 found.** The policy as written raised no complaint on any screen, signed out or in, light or dark, in a production build; the dev server needs the development allowances and no more. Two facts the design had not pinned: **Next reads the nonce from the response header as well as the request header** (the app renders correctly with only the response header set), so setting it on the request too, as Next's guide shows, is belt and braces that no test can tell from its absence; and **`style-src-attr 'unsafe-inline'` is needed**: with it removed, the production build reports `style-src-attr blocked inline` on the brunch page and the wizard's step indicator (the computed widths).
- **No `upgrade-insecure-requests`** and no HSTS here: both break `http://localhost`, where CI serves a production build. They belong to the deployment spec with the domain.
- **No report endpoint.** Nothing would read it before launch; the browser console and the e2e journey are the signal. The deployment spec's checklist loads every screen on the real deployment and checks the console once.

## Consequences

- Easier: an injected script no longer runs, which is the point of a CSP; the headers live next to the session gate that already owns every request.
- Harder: the middleware gets longer and now sets headers on all responses (including the 401 JSON and redirects); a future third-party script (analytics, a map embed, Google photos in avatars when the opt-in Settings spec arrives) must be added to the policy deliberately, which is the feature. Pages can no longer be statically cached (none are).
- `style-src-attr 'unsafe-inline'` is a known, bounded weakness; removing it means replacing the two inline widths with CSS custom properties set from a class or a `data-` attribute and a stylesheet rule, a small follow-up if a reviewer cares.
- **Deliberately not done:** HSTS and the host-level redirect (deployment spec); a violation-report endpoint (revisit after the beta opens); a nonce-free "hash" policy (breaks on every build).

## Alternatives considered

- **A static CSP in `next.config.ts` with `'unsafe-inline'` for scripts.** Passes a scanner and stops almost nothing: the main XSS payload is an inline script.
- **Next's experimental SRI (hash-based) CSP.** Avoids dynamic rendering, but is experimental and tied to the build; revisit if a page ever wants static rendering.
- **Skipping CSP until after launch.** Cheap now and expensive later (every new page and library would be written against no policy). The surface is small today, which is the best time.
