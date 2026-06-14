# 0002 — Hosting: Vercel + Supabase

**Date:** 2026-06-14  
**Status:** Accepted  
**Deciders:** Evan Knapp  

## Context

The app needs hosting for the Next.js frontend/API and a managed Postgres database with Realtime support. The choice of hosting provider affects local development workflow, cost, and how closely local dev mirrors production.

## Decision

**Vercel** for the Next.js app (automatic preview deploys on PR, zero-config Next.js support, generous hobby tier). **Supabase** for Postgres + Realtime (managed Postgres, built-in Realtime via WebSockets, local dev via `supabase start` CLI that mirrors production exactly).

## Consequences

- **Easier:** local dev with `supabase start` is identical in structure to production; Vercel + GitHub integration gives preview URLs on every PR automatically; both have generous free tiers for a side project.
- **Harder:** slight Supabase vendor dependency on Realtime (though the app accesses it through a `RealtimeProvider` interface per Constitution Principle 7, so swapping is contained); Vercel cold starts on hobby tier may affect first-load latency.

## Alternatives considered

- **Railway / Render** — good Postgres options, but lack the local CLI dev environment that Supabase provides. `supabase start` is a significant DX win.
- **Self-hosted Postgres on Fly.io** — more control, more ops burden. Not appropriate for a solo side project.
- **PlanetScale** — MySQL, not Postgres. Schema branching is appealing but Prisma + Postgres is the established combination here.
- **Netlify** — less optimal for Next.js App Router than Vercel. Vercel builds Next.js.

> **Note:** Detailed deliberation predates this repo's git history — this ADR captures the outcome and rationale retroactively from pre-development planning.
