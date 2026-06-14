# Brunchsters

A web app for socially planning brunch with friends. It fills the gap between Google Maps (where) and Google Calendar (when) by making the planning collaborative.

Built as a solo side project with a focus on learning and shipping. See [`docs/constitution.md`](docs/constitution.md) for the principles that guide every decision.

---

## Stack

| Layer     | Choice                                       |
| --------- | -------------------------------------------- |
| Framework | Next.js 15+ (App Router) + TypeScript strict |
| State     | Redux Toolkit                                |
| ORM       | Prisma + PostgreSQL                          |
| Auth      | NextAuth.js (Google + Apple)                 |
| Realtime  | Supabase Realtime                            |
| Jobs      | Inngest                                      |
| Email     | Resend                                       |
| Hosting   | Vercel + Supabase                            |

---

## Repo Structure

```
apps/web/          Next.js app (frontend + API routes)
packages/core/     Business logic, framework-agnostic
packages/database/ Prisma schema, migrations, seed scripts
packages/shared/   Types, constants, utilities
docs/              Constitution, planning doc, ADRs
specs/             Per-feature specs, plans, and tasks
```

---

## Getting Started

See [`docs/SETUP.md`](docs/SETUP.md) for the full local setup guide — tools, environment variables, local Supabase, and how to run tests.

Quick start once prerequisites are installed:

```bash
pnpm install
pnpm db:generate
pnpm dev
```

---

## Documentation

| Doc                                            | What it covers                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| [`docs/constitution.md`](docs/constitution.md) | Non-negotiable principles — read before any architectural decision |
| [`docs/PLANNING.md`](docs/PLANNING.md)         | Product spec, data model, architecture overview, build order       |
| [`docs/SETUP.md`](docs/SETUP.md)               | Local environment setup, third-party accounts, startup, testing    |
| [`docs/adrs/`](docs/adrs/)                     | Architecture Decision Records — why specific decisions were made   |
| [`specs/`](specs/)                             | Per-feature specs, implementation plans, and task breakdowns       |

---

## Development

```bash
pnpm dev          # start Next.js dev server
pnpm test         # run all tests
pnpm typecheck    # TypeScript strict check across all packages
pnpm lint         # ESLint across all packages
pnpm db:migrate   # run pending Prisma migrations
pnpm db:seed      # seed lookup tables
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org). Merges to `main` trigger automated versioning and GitHub releases via semantic-release.
