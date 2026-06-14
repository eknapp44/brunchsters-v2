# Plan 0001 — Repo Scaffold

**Spec:** [spec.md](./spec.md)  
**Branch:** `feat/0001-repo-scaffold`

---

## Package Names and Workspace Topology

```
brunchsters-v2/                     (root — private, no publish)
├── apps/
│   └── web/                        @brunchsters/web
├── packages/
│   ├── core/                       @brunchsters/core
│   ├── database/                   @brunchsters/database
│   └── shared/                     @brunchsters/shared
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── .eslintrc.js  (or eslint.config.mjs for v9 flat config)
├── .prettierrc
├── .env.example
└── package.json                    (root, scripts only)
```

**Dependency direction (strictly enforced):**
```
apps/web  →  packages/core
apps/web  →  packages/database
apps/web  →  packages/shared
packages/core  →  packages/shared
packages/database  →  packages/shared
```
`packages/core` never imports from `packages/database`, `apps/web`, or
any framework (`next`, `react`). This is Constitution Principle 15.

---

## Tool Versions

| Tool | Version | Rationale |
|------|---------|-----------|
| Node.js | 22 LTS | SETUP.md recommendation |
| pnpm | 9+ | CLAUDE.md |
| Turborepo | 2.x | PLANNING.md §15 explicit mention; build caching |
| Next.js | 15.x (latest stable) | CLAUDE.md |
| TypeScript | 5.x | Bundled with Next.js 15; strict |
| ESLint | 9.x flat config | Current standard for Next.js 15 |
| Prettier | 3.x | Standard |
| Prisma | 6.x (latest stable) | ORM choice per stack |
| Vitest | 2.x | CLAUDE.md; workspace mode for monorepo |
| Supabase CLI | latest | SETUP.md |

---

## Turborepo Pipeline

```json
// turbo.json
{
  "tasks": {
    "build":     { "dependsOn": ["^build"], "outputs": [".next/**", "dist/**"] },
    "typecheck": { "dependsOn": ["^typecheck"] },
    "lint":      {},
    "test":      { "dependsOn": ["^build"] },
    "dev":       { "persistent": true, "cache": false }
  }
}
```

Root scripts (`package.json`):
```
pnpm build      → turbo build
pnpm typecheck  → turbo typecheck
pnpm lint       → turbo lint
pnpm test       → turbo test
pnpm dev        → turbo dev
pnpm db:migrate → pnpm --filter @brunchsters/database prisma migrate dev
pnpm db:generate→ pnpm --filter @brunchsters/database prisma generate
pnpm db:seed    → pnpm --filter @brunchsters/database seed
pnpm db:validate→ pnpm --filter @brunchsters/database prisma validate
```

---

## tsconfig Strategy

`tsconfig.base.json` at root — strict options that every package extends:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

Each package extends this and sets its own `paths`, `outDir`, `rootDir`.
`apps/web` also includes `"lib": ["ES2022", "DOM"]` and
`"jsx": "preserve"`.

---

## ESLint Configuration

Use ESLint 9 flat config (`eslint.config.mjs`) at root, shared across
packages via Turborepo's lint task. Plugins:
- `@typescript-eslint` — strict TypeScript rules
- `eslint-plugin-import` — enforce import order, no circular deps
- `next/core-web-vitals` (in `apps/web` only)

Key rules:
- `@typescript-eslint/no-explicit-any: error`
- `@typescript-eslint/consistent-type-imports: error`
- `import/no-cycle: error`

---

## Prisma Schema Decisions

### Primary Keys
All PKs use `String @id @default(uuid()) @db.Uuid`. UUID generated at
the application layer by Prisma (not DB-generated), which keeps the
database portable per Constitution Principle 9.

### Soft Delete Pattern
Every major entity has `deletedAt DateTime?` and `deletedBy String?` 
(FK to User ID as String). Prisma middleware in `packages/database/src/middleware.ts`
auto-applies `WHERE deletedAt IS NULL` on all findMany/findFirst/findUnique
calls unless `{ where: { deletedAt: { not: null } } }` is explicitly
passed. Bypass by calling `db.$queryRaw`.

### Enums vs. Lookup Tables
PLANNING.md §8 explicitly defines `User.role` as `enum: user | admin`
(simplified from Role/UserRole tables for v1). We implement this as a
Prisma `enum UserRole { user admin }` — a Postgres enum — deliberately
departing from the "lookup tables for configurable values" constitution
principle. This is the one sanctioned exception documented in PLANNING.md.
If more roles are added, an ADR must be filed.

Similarly `UserDishPreference.preference` and `UserIngredientPreference.preference`
use Prisma enums (`DishPreferenceLevel`, `IngredientPreferenceLevel`).

### BrunchTime Timezone Display
`BrunchTime.scheduledAt` is stored UTC. The display rule documented in
PLANNING.md §8 (convert to location timezone post-confirmation, show
viewer's local timezone subline when they differ) is UI logic only —
no extra schema fields needed.

### Schema Comments
Each model block gets a brief `// [v1 schema + ui]` or `// [v1 schema only]`
comment matching the PLANNING.md tags so the schema file is self-documenting.

---

## Seed Strategy

One TypeScript seed script: `packages/database/src/seed.ts`.
Runs via `prisma db seed` (configured in `package.json` `prisma.seed` field).

Seeding is **idempotent**: each lookup entry uses `upsert` keyed on `code`.
Safe to re-run on an already-seeded DB without duplicating rows.

Seed order (respects FK dependencies):
1. NotificationChannel, NotificationChannel
2. BrunchStatus, BrunchDecisionType, RsvpStatus
3. BrunchInviteSuggestionStatus, NotificationType
4. FriendshipStatus
5. FeatureFlag
6. Dish, Ingredient

All seed values taken verbatim from PLANNING.md §12.

---

## packages/shared Contents (M3)

```
packages/shared/src/
  types/
    brand.ts          Brand<T, Tag> helper type
    ids.ts            UserId, BrunchId, InviteId, LocationId, TimeId branded types
  index.ts
```

No runtime code — types only. Framework-agnostic.

---

## packages/core Contents (M3)

```
packages/core/src/
  email/
    EmailService.ts   interface EmailService { send(...) }
  events/
    EventBus.ts       interface EventBus { emit(...) }
  places/
    PlaceProvider.ts  interface PlaceProvider { search(...); getDetails(...) }
  index.ts
```

Stubs only — interfaces with no implementations. Implementations live in
`apps/web/src/adapters/` (Resend, Inngest, Google Places).

---

## CI Workflow

`.github/workflows/ci.yml` — triggers on `pull_request` to `main`.

Jobs (all run in parallel after install):
1. **lint** — `pnpm lint`
2. **typecheck** — `pnpm typecheck`
3. **prisma-validate** — `pnpm db:validate` (no DB needed)
4. **test** — `pnpm test` (no DB in CI for M6; integration tests deferred)
5. **build** — `pnpm build`

Node 22, pnpm 9 (via `pnpm/action-setup`), cache pnpm store.

---

## .env.example

Every variable from SETUP.md §5. Variables needed for the local scaffold
(before any cloud accounts):

```
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
DIRECT_URL=postgresql://postgres:postgres@localhost:54322/postgres
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from supabase start output>
SUPABASE_SERVICE_ROLE_KEY=<from supabase start output>
AUTH_SECRET=<run: openssl rand -base64 32>
AUTH_URL=http://localhost:3000
# Auth (needed when you reach the auth spec)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
APPLE_CLIENT_ID=
APPLE_CLIENT_SECRET=
# Email (mock locally until the notifications spec)
RESEND_API_KEY=
# Maps (mock locally until the places spec)
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
# Inngest (local dev server needs no keys; fill in when using cloud)
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
# Token encryption (AES-256-GCM, per PLANNING.md §17)
TOKEN_ENCRYPTION_KEY=<run: openssl rand -base64 32>
```

---

## Vitest Config

Root `vitest.workspace.ts` points to each package's config file.
Each package has `vitest.config.ts` with:
- `environment: 'node'` (except future browser tests)
- `include: ['src/**/*.test.ts']`

For M6, each package contains one trivial smoke test (checks the package
exports something) so the test runner has ≥1 passing test to report.

---

## docs/adrs/ Setup

The `docs/adrs/` directory referenced in PLANNING.md §15 doesn't exist
on disk yet. Part of M7: create `docs/adrs/README.md` with the ADR template,
and stub files for the three ADRs already named in PLANNING.md:
- `0001-monorepo-structure.md`
- `0002-hosting-vercel-supabase.md`
- `0003-no-email-password-auth.md`

These stubs capture the decision (from PLANNING.md and the constitution)
and note that the detailed rationale predates the repo history. No need to
reconstruct the full deliberation — just the outcome and the key points.
