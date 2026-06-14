# Spec 0001 — Repo Scaffold

**Status:** In planning  
**Branch:** `feat/0001-repo-scaffold`  
**Created:** 2026-06-13

---

## Goal

Stand up the monorepo skeleton so every subsequent spec has a working,
typed, linted foundation to build on. When this spec is complete, a
developer can clone the repo, run `pnpm install`, `supabase start`, and
`pnpm dev` and get a running (stub) app with a fully migrated and seeded
local database — with no cloud accounts required.

---

## What This Spec Covers

1. **Monorepo init** — pnpm workspaces, Turborepo, root package scripts
2. **Base tooling** — tsconfig.base.json (strict), ESLint, Prettier
3. **Package skeletons** — `apps/web`, `packages/core`, `packages/database`,
   `packages/shared` with correct inter-package references
4. **Next.js 15 App Router** stub in `apps/web`
5. **`packages/shared`** — Brand<T, Tag> type helper and placeholder exports
6. **`packages/core`** — service interface stubs (EmailService, EventBus,
   PlaceProvider) and directory structure; no business logic yet
7. **`packages/database`** — full Prisma schema from PLANNING.md §8,
   initial migration, Prisma client generation
8. **Seed scripts** — all lookup and reference table seed data from
   PLANNING.md §12 (v1 schema seeds + v1 schema-only seeds)
9. **`.env.example`** — every variable from SETUP.md §5, with placeholder
   values and inline comments
10. **CI workflow** — GitHub Actions: lint, typecheck, test, prisma validate,
    build on every PR
11. **`docs/SETUP.md` cleanup** — all `[pending scaffold]` markers replaced
    with verified, real commands

---

## What This Spec Does NOT Cover

- Any auth, brunch-creation, or other feature logic — those are their own specs
- Deployment (Vercel, cloud Supabase) — deferred; no cloud accounts needed
- Inngest function registration — only the local dev server invocation is
  documented; no Inngest SDK usage yet
- Google OAuth credentials — flagged when auth spec begins (see SETUP.md §3
  account order: step 3)
- Resend, Google Places, Apple Sign-In — similarly deferred

---

## Third-Party Flag

This spec requires only:
- **Docker Desktop** (already on machine for Supabase CLI)
- **Supabase CLI** (local Postgres via Docker; no cloud account)
- **Inngest dev server** (`npx inngest-cli@latest dev`; no account)

No cloud accounts are required until the auth spec. The first flag will be
**Google OAuth** per SETUP.md §3 ordering.

---

## Success Criteria

- `pnpm install` — succeeds, all workspace packages resolve
- `pnpm lint` — exits 0
- `pnpm typecheck` — exits 0
- `pnpm build` — exits 0 (Next.js stub builds cleanly)
- `pnpm test` — exits 0 (test runner configured; trivial smoke tests pass)
- `supabase start` → `pnpm db:migrate` → `pnpm db:generate` → `pnpm db:seed`
  — all succeed; DB has all lookup tables populated
- `pnpm --filter @brunchsters/database prisma validate` — passes
- `pnpm dev` — Next.js app boots on :3000
- `docs/SETUP.md` has no `[pending scaffold]` markers remaining

---

## Constraints and Non-Negotiables

- TypeScript strict mode on every package — no exceptions
- No `any`, no `// @ts-ignore` without a comment explaining the escape
- Prisma schema derived directly from PLANNING.md §8 — any deviation must
  update PLANNING.md in the same commit
- Lookup tables seeded in the same migration commit per CLAUDE.md
  ("Things to Always Do")
- All packages use the `@brunchsters/` namespace
