# 0001 — Monorepo structure with pnpm + Turborepo

**Date:** 2026-06-14  
**Status:** Accepted  
**Deciders:** Evan Knapp  

## Context

Brunchsters needs a web app (`apps/web`), framework-agnostic business logic (`packages/core`), database schema and migrations (`packages/database`), and shared types (`packages/shared`). These pieces have different deployment targets and testing needs but share code. The question was whether to keep them in one repo or split them.

## Decision

Single monorepo using **pnpm workspaces** for package management and **Turborepo** for build orchestration. Four packages: `@brunchsters/web`, `@brunchsters/core`, `@brunchsters/database`, `@brunchsters/shared`.

## Consequences

- **Easier:** atomic commits across packages; one `pnpm install`; shared lint/typecheck config; `packages/core` is importable by a future mobile app with no changes.
- **Harder:** pnpm workspace nuances (allowBuilds, exec vs run syntax); monorepo tooling adds a thin layer of complexity over a simple single-package repo.

## Alternatives considered

- **Separate repos per package** — rejected: cross-repo PRs for schema + service changes are painful for a solo developer with no team boundaries to enforce.
- **npm workspaces without Turborepo** — viable for v1, but Turborepo's task caching makes `typecheck` and `test` fast as the codebase grows. Low setup cost for meaningful benefit.
- **Single flat package** — rejected: `packages/core` must be framework-agnostic (Constitution Principle 6). Mixing Next.js imports with core logic would violate that immediately.

> **Note:** Detailed deliberation predates this repo's git history — this ADR captures the outcome and rationale retroactively from pre-development planning.
