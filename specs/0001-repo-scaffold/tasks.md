# Tasks 0001 — Repo Scaffold

**Spec:** [spec.md](./spec.md) | **Plan:** [plan.md](./plan.md)  
**Branch:** `feat/0001-repo-scaffold`

Legend: ✅ done · 🔲 not started · 🔄 in progress

---

## Milestone 1 — Root workspace + tooling

**Goal:** `pnpm install` works, workspace packages resolve, lint and
typecheck scripts exist and run (even with nothing to check).

**Requires:** Node 22, pnpm 9+. No Docker needed yet.

### Tasks
- 🔲 Create `pnpm-workspace.yaml` declaring `apps/*` and `packages/*`
- 🔲 Create root `package.json` (private, no version) with workspace scripts:
  `build`, `typecheck`, `lint`, `test`, `dev`, `db:migrate`, `db:generate`,
  `db:seed`, `db:validate`
- 🔲 Add Turborepo: `turbo.json` with build/typecheck/lint/test/dev pipeline
- 🔲 Create `tsconfig.base.json` (strict mode, all options from plan.md)
- 🔲 Create root `.eslintrc.js` / `eslint.config.mjs` with TS + import rules
- 🔲 Create `.prettierrc`
- 🔲 Update `.gitignore` (node_modules, .next, dist, .env.local, .turbo)
- 🔲 Create package skeletons — each with `package.json` + `tsconfig.json`
  extending `tsconfig.base.json`:
  - `apps/web/` (`@brunchsters/web`)
  - `packages/core/` (`@brunchsters/core`)
  - `packages/database/` (`@brunchsters/database`)
  - `packages/shared/` (`@brunchsters/shared`)
- 🔲 Add placeholder `src/index.ts` (empty export) to core, database, shared
- 🔲 Run `pnpm install` — verify all packages resolve

### Green checkpoint
- `pnpm install` — exits 0
- `pnpm lint` — exits 0 (nothing to lint yet)
- `pnpm typecheck` — exits 0 (nothing to check yet)
- Commit: `chore: monorepo workspace and tooling scaffold`

### Testing note
- **What was tested:** Workspace resolution, package install, lint/typecheck scripts
- **How:** Manual `pnpm install && pnpm lint && pnpm typecheck`
- **What's deferred:** Actual lint/type rules — nothing to check yet
- **How to run:** `pnpm install && pnpm lint && pnpm typecheck`

---

## Milestone 2 — Next.js 15 app in `apps/web`

**Goal:** `pnpm dev` boots the Next.js stub app on :3000. Build passes.

**Requires:** Nothing beyond M1.

### Tasks
- 🔲 Initialize Next.js 15 in `apps/web`:
  - `app/layout.tsx` — root layout (minimal HTML shell)
  - `app/page.tsx` — stub page ("Brunchsters — coming soon")
  - `next.config.ts` — minimal config, transpilePackages for workspace pkgs
  - `public/` — empty or placeholder favicon
- 🔲 Configure `apps/web/tsconfig.json` to extend base + add DOM lib, jsx preserve
- 🔲 Add `next` and `react`/`react-dom` dependencies to `apps/web/package.json`
- 🔲 Wire `@brunchsters/shared` and `@brunchsters/core` as workspace
  dependencies in `apps/web/package.json`
- 🔲 Verify `next/core-web-vitals` ESLint rules are scoped to `apps/web` only

### Green checkpoint
- `pnpm dev` — Next.js starts, page loads on :3000
- `pnpm build` — clean build, no errors
- `pnpm typecheck` — still exits 0
- `pnpm lint` — still exits 0
- Commit: `feat: Next.js 15 App Router stub in apps/web`

### Testing note
- **What was tested:** App boots and builds; TypeScript strict mode enforced
- **How:** `pnpm dev` then browser check; `pnpm build` clean exit
- **What's deferred:** Any actual app pages — this is a stub
- **How to run:** `pnpm dev` (then visit http://localhost:3000)

---

## Milestone 3 — `packages/shared` and `packages/core` scaffolds

**Goal:** Type helpers and service interfaces in place. `apps/web` can
import from both packages. Clean typecheck across the workspace.

**Requires:** M1, M2.

### Tasks
- 🔲 **packages/shared:**
  - `src/types/brand.ts` — `Brand<T, Tag>` helper type
  - `src/types/ids.ts` — `UserId`, `BrunchId`, `InviteId`, `BrunchLocationId`,
    `BrunchTimeId` branded types
  - `src/index.ts` — re-export all types
- 🔲 **packages/core:**
  - `src/email/EmailService.ts` — `EmailService` interface with
    `send(input: SendEmailInput): Promise<Result<EmailId, EmailError>>`
  - `src/events/EventBus.ts` — `EventBus` interface stub
  - `src/places/PlaceProvider.ts` — `PlaceProvider` interface with
    `search()` and `getDetails()`
  - `src/index.ts` — re-export all interfaces
  - Add `neverthrow` as a dependency (for Result<T, E> types in interfaces)
- 🔲 Verify `apps/web` can import `Brand` from `@brunchsters/shared`
  (add a trivial import to the stub page to force the typecheck)

### Green checkpoint
- `pnpm typecheck` — exits 0 across all packages
- `pnpm lint` — exits 0
- Commit: `feat: packages/shared Brand types and packages/core service interfaces`

### Testing note
- **What was tested:** Package cross-references, type exports, neverthrow import
- **How:** `pnpm typecheck` across workspace
- **What's deferred:** Implementations of all interfaces (future specs)
- **How to run:** `pnpm typecheck`

---

## Milestone 4 — Full Prisma schema (validate only, no DB yet)

**Goal:** `prisma validate` passes against the full schema from PLANNING.md §8.
No migrations run yet — just the schema file.

**Requires:** M1. No Docker needed.

### Tasks
- 🔲 Add Prisma to `packages/database`:
  - `prisma/schema.prisma` — full schema (see scope below)
  - `packages/database/package.json` — add `prisma` dev dep, `@prisma/client` dep,
    configure `prisma.seed` to point to `src/seed.ts`
- 🔲 Write the full schema — all models from PLANNING.md §8 in order:
  - Enums: `UserRole`, `DishPreferenceLevel`, `IngredientPreferenceLevel`
  - Lookup tables: `BrunchStatus`, `BrunchDecisionType`, `RsvpStatus`,
    `BrunchInviteSuggestionStatus`, `NotificationType`, `NotificationChannel`
  - User & Auth: `User`, `UserAuthProvider`, `UserNotificationPreference`,
    `UserFeatureFlag`
  - Audit: `AuditLog`
  - Feature & Settings: `FeatureFlag`, `AppSetting`
  - Notifications: `Notification`
  - Brunch: `Brunch`
  - Invites: `BrunchInvite`, `BrunchAttendee`, `BrunchInviteSuggestion`
  - Location & Time: `BrunchLocation`, `BrunchTime`
  - Votes: `BrunchLocationVote`, `BrunchTimeVote`
  - Chat: `Message` [v1 schema only]
  - Social: `FriendshipStatus`, `Friendship`, `FriendGroup`,
    `FriendGroupMember` [v1 schema only]
  - Favorites: `UserFavoritePlace` [v1 schema only]
  - Preferences: `Dish`, `Ingredient`, `UserDishPreference`,
    `UserIngredientPreference` [v1 schema only]
- 🔲 Annotate each model block with its PLANNING.md release tag as a comment
- 🔲 Run `pnpm db:validate` — must pass

### Green checkpoint
- `pnpm db:validate` — exits 0
- `pnpm typecheck` — exits 0
- `pnpm lint` — exits 0
- Commit: `feat: full Prisma schema from PLANNING.md §8`

### Testing note
- **What was tested:** Schema correctness (relations, indexes, constraints)
  via `prisma validate`
- **How:** `pnpm db:validate`; no database needed
- **What's deferred:** Migration and seeding (M5); Prisma middleware (M5)
- **How to run:** `pnpm db:validate`

---

## Milestone 5 — Database migration + seed (requires Supabase CLI)

**Goal:** Local Supabase running, initial migration applied, Prisma client
generated, seed script populates all lookup tables.

**Requires:** M4. **Docker Desktop running, Supabase CLI installed.**

### Pre-requisite check
```
supabase --version   # must print a version
docker info          # must succeed (Docker running)
```
If either fails, see SETUP.md §2 before continuing.

### Tasks
- 🔲 Initialize Supabase config: `supabase init` in repo root
  (creates `supabase/config.toml`)
- 🔲 Start local stack: `supabase start`
  — note the DB URL, anon key, service role key
- 🔲 Copy `supabase start` output values into `.env.local`
- 🔲 Run `pnpm db:migrate` (prisma migrate dev --name init)
  — applies the full schema as a single initial migration
- 🔲 Run `pnpm db:generate` — generates Prisma client in
  `packages/database/node_modules/.prisma/client`
- 🔲 Write seed script `packages/database/src/seed.ts`:
  - Idempotent upserts (keyed on `code`)
  - Seed order: channels → statuses → types → feature flags → dishes/ingredients
  - All values from PLANNING.md §12 (v1 seeds + v1 schema-only seeds)
  - Inactive entries (`isActive: false`) seeded with that flag set
- 🔲 Run `pnpm db:seed` — verify exit 0
- 🔲 Inspect seeded tables via Supabase local Studio or psql
- 🔲 Add Prisma soft-delete middleware in
  `packages/database/src/middleware.ts` and wire it into a `createDb()`
  factory function that returns a configured `PrismaClient`
- 🔲 Export `createDb` from `packages/database/src/index.ts`

### Green checkpoint
- All commands in the sequence succeed
- Seeded rows visible in local DB
- `pnpm typecheck` — exits 0
- `pnpm lint` — exits 0
- Commit: `feat: initial DB migration, Prisma client, and seed scripts`

### Testing note
- **What was tested:** Migration applies cleanly to local Postgres;
  seed populates all lookup tables with correct row counts; idempotency
  (seed runs twice, counts unchanged)
- **How:** Manual run of full sequence; `supabase start` → migrate → seed
  → `psql` or Supabase Studio row count check
- **What's deferred:** Integration tests against real DB (future milestone
  per feature spec); soft-delete middleware unit test (auth spec)
- **How to run:** See SETUP.md §4 steps 4–6

---

## Milestone 6 — Vitest config + CI workflow

**Goal:** `pnpm test` passes. GitHub Actions CI runs lint, typecheck,
test, prisma validate, and build on every PR.

**Requires:** M1–M5.

### Tasks
- 🔲 Add Vitest to the root workspace + each package:
  - Root `vitest.workspace.ts` pointing to package configs
  - `packages/core/vitest.config.ts`
  - `packages/database/vitest.config.ts`
  - `packages/shared/vitest.config.ts`
  - `apps/web/vitest.config.ts`
- 🔲 Write one trivial smoke test per package to give the runner ≥1 test:
  - `packages/shared/src/types/brand.test.ts` — Brand helper compiles
  - `packages/core/src/index.test.ts` — re-exports are defined
  - `packages/database/src/index.test.ts` — createDb export is a function
- 🔲 Create `.github/workflows/ci.yml`:
  - Trigger: `pull_request` targeting `main`
  - Node 22 + pnpm 9 setup
  - `pnpm install --frozen-lockfile`
  - Parallel jobs: lint, typecheck, test, prisma-validate, build
  - (No local DB in CI for now — integration tests deferred to feature specs)

### Green checkpoint
- `pnpm test` — exits 0, ≥3 tests passing
- CI YAML is syntactically valid (validate locally with `yamllint` or
  paste into GitHub's workflow editor)
- `pnpm typecheck` — exits 0
- `pnpm lint` — exits 0
- Commit: `feat: Vitest config and GitHub Actions CI workflow`

### Testing note
- **What was tested:** Test runner setup, trivial package smoke tests
- **How:** `pnpm test`; CI YAML reviewed but not yet triggered (needs a PR)
- **What's deferred:** Real business logic tests (each feature spec); DB
  integration tests in CI (needs a DB service — deferred to first spec
  that needs it)
- **How to run:** `pnpm test`

---

## Milestone 7 — .env.example + SETUP.md cleanup + ADR stubs

**Goal:** `docs/SETUP.md` has no `[pending scaffold]` markers. `.env.example`
covers every variable. ADR directory stubs created.

**Requires:** M1–M6 all complete and verified.

### Tasks
- 🔲 Finalize `.env.example` — verify every variable from SETUP.md §5 is
  present with placeholder and one-line comment
- 🔲 Update `docs/SETUP.md`:
  - Remove every `[pending scaffold]` marker
  - Replace with real, verified commands and exact pnpm script names
  - Add the "30-second smoke test" section (shortest sequence to verify local
    stack health)
  - Add exact port numbers from `supabase start` output
- 🔲 Create `docs/adrs/README.md` — ADR template and index
- 🔲 Create stub ADRs for the three decisions named in PLANNING.md §15:
  - `docs/adrs/0001-monorepo-structure.md`
  - `docs/adrs/0002-hosting-vercel-supabase.md`
  - `docs/adrs/0003-no-email-password-auth.md`
  - Each stub captures the decision outcome, key reasons (from PLANNING.md
    and the constitution), and notes that detailed deliberation predates
    the repo's git history
- 🔲 Update `docs/PLANNING.md` §16 build order: mark item 2 (Project scaffold)
  as done ✅
- 🔲 Final verification: run the full SETUP.md §4 sequence start-to-finish
  in a clean shell and confirm it works exactly as written

### Green checkpoint
- `pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build`
  — all exit 0
- `supabase start && pnpm db:migrate && pnpm db:generate && pnpm db:seed`
  — all exit 0
- `pnpm dev` — boots on :3000
- SETUP.md has zero `[pending scaffold]` occurrences
- Commit: `docs: finalize SETUP.md, .env.example, and ADR stubs`

### Testing note
- **What was tested:** Full SETUP.md walkthrough in a clean shell from top
  to bottom; every command verified to produce the described output
- **How:** Manual
- **What's deferred:** Nothing — this is a docs/config milestone
- **How to run:** Follow SETUP.md §4

---

## Milestone Summary

| # | Name | Key output | DB needed? | External accounts? |
|---|------|-----------|-----------|-------------------|
| 1 | Root workspace + tooling | `pnpm install` works | No | No |
| 2 | Next.js 15 app | `pnpm dev` :3000 | No | No |
| 3 | packages/shared + core | Type helpers + interfaces | No | No |
| 4 | Prisma schema | `prisma validate` passes | No | No |
| 5 | Migration + seed | DB migrated and seeded | **Yes — local Supabase** | No |
| 6 | Vitest + CI | `pnpm test` passes | No | No |
| 7 | SETUP.md + ADRs | Docs clean, no stale markers | Supabase running | No |

**No third-party cloud accounts required anywhere in this spec.**
First external account needed: Google OAuth (spec 0002 — auth).
