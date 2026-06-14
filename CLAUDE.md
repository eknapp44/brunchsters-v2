# CLAUDE.md

This file provides Claude with always-loaded context for the Brunchsters repository. Keep it minimal and high-signal. Detailed docs are referenced, not duplicated.

## Project

Brunchsters is a web app for socially planning brunch with friends. It fills the gap between Google Maps (where) and Google Calendar (when) by making the planning collaborative. Solo developer, side project, learning-focused.

## Documentation Hierarchy

Always-loaded baseline is in this file. For deeper context, reference these on demand:

- `@docs/constitution.md` — non-negotiable principles (read before any architectural decision)
- `@docs/PLANNING.md` — product spec, data model, architecture overview
- `@docs/SETUP.md` — local environment setup, third-party accounts, startup, and local testing
- `@docs/adrs/` — historical decision rationale
- `@specs/NNNN-feature/` — per-feature spec, plan, and tasks

When in doubt about *why* something is done a certain way, check the ADRs before assuming.

## Stack

- Next.js 15+ App Router, TypeScript strict mode, Redux Toolkit
- Prisma + PostgreSQL (Supabase-hosted)
- NextAuth.js (Google + Apple)
- Inngest for async jobs
- Resend for email
- Vercel hosting

## Repo Structure (monorepo, npm/pnpm workspaces)

```
apps/web/            Next.js app
packages/core/       Business logic, framework-agnostic
packages/database/   Prisma schema, migrations, seed scripts
packages/shared/     Types, constants, utilities used across packages
docs/                constitution, PLANNING, ADRs
specs/               per-feature specs
infrastructure/      IaC (future)
```

Each major directory may have its own scoped `CLAUDE.md` with local conventions.

## TypeScript Conventions (strict — author has Java/Spring background)

- **Strict mode is non-negotiable.** No `any`, no `// @ts-ignore`, no `// @ts-expect-error` without an inline comment explaining why and what's needed to remove it.
- **Explicit types at boundaries, inference inside.** Public/exported functions always have explicit param and return types. Class members and module exports are explicit. Local variables, callback returns in `.map()`/`.filter()`, and JSX use inference. Java instinct will be to type everything — resist for locals; embrace for boundaries.
- **Branded types for domain primitives.** `UserId`, `BrunchId`, `Email`, `IanaTimezone` etc. are not raw `string`. Use a `Brand<T, Tag>` helper. Functions accepting a `BrunchId` should not silently accept any `string`.
- **`readonly` by default.** Object fields, array parameters, and class properties are `readonly` unless mutation is required and justified.
- **Prefer discriminated unions over flags.** A `BrunchStatus` is a union type, not a string with magic values. Pattern-match exhaustively with `never` checks.
- **`Result<T, E>` for fallible operations in `packages/core`.** Use the `neverthrow` library (`Ok`, `Err`, `Result`). Don't throw for expected failure modes (validation errors, not-found, permission denied). Throw only for true exceptional/unrecoverable cases (programming errors, infrastructure outages).
- **No `null` in domain types.** Use `T | undefined` consistently. `null` is reserved for places where it crosses a JSON/SQL boundary.
- **Zod schemas live next to the types they validate.** Infer TypeScript types from Zod schemas (`z.infer<typeof schema>`) — schema is the source of truth.

### Function parameters
- **2+ params → single object parameter.** Named arguments via destructuring. 1-param functions stay positional.
- **Naming convention:** `input` for service-layer functions (matches input/output mental model and pairs with Zod schemas). `params` for utilities/helpers. `props` for React components (already an object by convention).
- **Why:** readability at call sites, no positional ordering bugs, additive changes don't break callers.

```typescript
// 1 param — positional
function getBrunchById(brunchId: BrunchId): Promise<Brunch | undefined> { ... }

// 2+ params — single object input
type CreateBrunchInput = {
  readonly title: string;
  readonly description?: string;
  readonly hostId: UserId;
  readonly locations: readonly LocationInput[];
};

function createBrunch(input: CreateBrunchInput): Promise<Result<Brunch, CreateBrunchError>> { ... }
```

### Type categories (replaces Spring's "DTO" catch-all)

Split DTOs by purpose:
- **Domain types** — what services pass around (`Brunch`, `BrunchAttendee`). Branded IDs, discriminated unions.
- **Input types** — what enters a function or API (`CreateBrunchInput`). Validated by Zod.
- **Output types** — what leaves an API (`BrunchResponse`). Stripped of internal-only fields.
- **DB types** — Prisma-generated. Used internally; don't leak directly to API responses.

## Architectural Rules

- **Business logic lives in `packages/core`.** Never in React components, never in Next.js page files. UI calls services; services do the work.
- **`packages/core` imports nothing framework-specific.** No `next`, no `react`, no `prisma/client` directly (Prisma is injected). It must be runnable from Node, browser, or React Native.
- **External providers are accessed through interfaces.** `PlaceProvider`, `EmailService`, `RealtimeProvider`, `EventBus`. Direct calls to Google/Resend/Supabase happen only in adapter implementations.
- **Synchronous APIs handle the DB transaction. Side effects go to the queue.** Never make an API response depend on email delivery or notification creation.
- **Soft delete is the default.** Major entities have `deletedAt`/`deletedBy`. Queries filter `deletedAt IS NULL` automatically via Prisma middleware. Hard deletes require justification.
- **Lookup tables, not enums, for configurable values.** Status, type, and category fields are FKs to lookup tables.

### Interface + Implementation pattern
Every external dependency has an interface and 1+ implementations:

```typescript
// packages/core/src/email/EmailService.ts
export interface EmailService {
  send(input: SendEmailInput): Promise<Result<EmailId, EmailError>>;
}

// apps/web/src/adapters/ResendEmailService.ts
export class ResendEmailService implements EmailService {
  send(input: SendEmailInput): Promise<Result<EmailId, EmailError>> { ... }
}

// packages/core/src/email/MockEmailService.ts (for tests)
export class MockEmailService implements EmailService {
  send(input: SendEmailInput): Promise<Result<EmailId, EmailError>> { ... }
}
```

Naming: interface is the bare role (`EmailService`); implementations prefix with provider/purpose (`ResendEmailService`, `MockEmailService`, `LoggingEmailService`).

### Dependency injection (no framework needed)
Services receive dependencies via parameters, not via global imports.

```typescript
// Good — testable, explicit dependencies
async function createBrunch(
  input: CreateBrunchInput,
  ctx: { db: PrismaClient; emailService: EmailService; eventBus: EventBus }
): Promise<Result<Brunch, CreateBrunchError>> { ... }

// Bad — hidden dependencies, hard to test
import { db, emailService } from '@/lib/global-instances';
async function createBrunch(input: CreateBrunchInput) { ... }
```

This is Spring's DI pattern without the framework. Same benefits.

### Layering (Spring Boot mental model → Brunchsters mapping)

| Spring Boot | Brunchsters | Where it lives |
|-------------|-------------|----------------|
| `@RestController` | Next.js route handler | `apps/web/src/app/api/v1/.../route.ts` |
| `@Service` | Service function | `packages/core/src/<domain>/<action>.ts` |
| `@Repository` | Prisma client (injected) | Don't add a wrapper — Prisma is the repo |
| `@Entity` | Prisma model (generated) | `packages/database/prisma/schema.prisma` |
| `@Transactional` | `prisma.$transaction(async tx => ...)` | Wrap multi-step DB writes |
| DTO | Input / Output / Domain types | Co-located with services |
| `@Autowired` | Function parameter | Pass `ctx` into services |

**Don't** create a `BrunchRepository` class wrapping Prisma calls. Prisma is already a typed repository — wrapping it adds overhead with no benefit. This is the most common Spring-to-TS anti-pattern.

## Naming

- Functions describe the domain action: `confirmBrunch`, not `updateBrunchStatus`.
- Booleans read as predicates: `isHost`, `canVote`, `hasResponded`. Not `host`, `vote`, `responded`.
- Files match what they export: a file exporting `createBrunch` is `createBrunch.ts`.
- Tests sit next to source: `createBrunch.test.ts` next to `createBrunch.ts`.

## Testing

- **Unit tests for `packages/core` and API route handlers.** This is where business logic lives, this is what we test.
- **No tests for framework code.** We don't test that React renders or Next.js routes — those are framework guarantees.
- **Co-located tests.** `foo.test.ts` next to `foo.ts`.
- **Vitest** is the runner. Playwright for E2E.
- **Test against a real local Postgres for integration tests**, not mocks, where the thing under test is a DB interaction. Use the local Supabase/Postgres instance described in `docs/SETUP.md`. Mock only true external boundaries (Resend, Google Places) via the `MockEmailService` / mock-provider pattern.
- **Every milestone writes its tests as part of the milestone**, not afterward. Tests-after is not the workflow here; a milestone with no tests is incomplete.

### Testing notes (required per milestone)

Each milestone records a short **testing note** in the spec's `tasks.md` (or a `TESTING-NOTES.md` in the spec folder) capturing:
- **What was tested** — the behaviors/paths covered
- **How** — unit, integration (local DB), or E2E; what was mocked
- **What's deferred** — known gaps, edge cases not yet covered, and why
- **How to run it** — the exact command(s), if non-obvious

These notes are the running record of test coverage and intent. They make it possible to pick the project back up after a break and know exactly what's verified. Keep them short and honest — "happy path + expired-token case covered; concurrent-vote race deferred to milestone 4" is ideal.

## Process

- **Spec before code for any real feature.** A `specs/NNNN-feature/` directory with spec/plan/tasks comes before the first line of implementation. Trivial changes (typos, dep bumps) skip this.
- **ADR for significant decisions.** New library, new pattern, deviation from constitution — write an ADR. See `docs/adrs/README.md` for the template.
- **Update docs in the same PR as the change.** Stale docs are worse than no docs.
- **Constitution overrides convenience.** If a request conflicts with a constitution principle, surface the conflict before complying.

## Milestone-Driven Implementation (how to actually build)

This is a solo, learning-focused project. The goal is steady, verifiable progress in small pieces — never a giant unreviewable change. Work in **small, testable milestones**, not big batches.

- **Break every spec into milestones.** A milestone is the smallest slice that is independently testable and leaves the repo in a working (green) state. Example for "create brunch": (1) Prisma model + migration + seed, (2) `createBrunch` service + unit tests, (3) API route + handler tests, (4) UI wiring. Each is its own milestone.
- **One feature branch per spec.** `feat/NNNN-feature`. For large specs, milestones can each get a short-lived branch off the feature branch, but the default is to commit milestones sequentially on the feature branch.
- **Commit at every green checkpoint.** A milestone is done when typecheck passes, lint passes, and its tests are written and passing. Commit then — don't batch multiple milestones into one commit. Frequent small commits with clear Conventional Commit messages are the norm, not the exception.
- **Never leave the branch red between commits.** If a milestone can't be finished, commit a `wip:` checkpoint with a note, but prefer to scope milestones so they finish green.
- **Each milestone produces testing notes** (see Testing below). No milestone is "done" without them.
- **Pause for review at milestone boundaries.** After completing a milestone, summarize what was built, what was tested, and what's next — then wait for confirmation before starting the next milestone. Don't run several milestones unattended.

## Documentation Cadence

- **Docs are updated continuously, not at the end.** Every milestone updates the relevant doc(s) in the same commit: the spec's `tasks.md` checkboxes, testing notes, any new ADR, and `PLANNING.md`/`SETUP.md` if reality diverged from them.
- **When implementation reveals a planning gap or contradiction, fix the doc, don't silently diverge.** `PLANNING.md` is the source of truth; if the code needs to differ, update the doc (or flag it) first.
- **`SETUP.md` stays runnable.** If a setup step, env var, or local-dev command changes, update `docs/SETUP.md` in the same commit. A new contributor (or future-you) should be able to follow it start-to-finish without surprises.

## Git / PRs

- Commit messages follow Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.
- Branch names match the spec they implement: `feat/0001-create-brunch`.
- PRs reference the spec: `Implements specs/0001-create-brunch`.
- No direct pushes to `main`.

## Things to Always Do

- Run `pnpm typecheck` and `pnpm lint` before considering work done.
- When adding a new lookup table, also add the seed entries in the same PR.
- When changing the Prisma schema, generate the migration and commit it alongside the schema change.
- When asked for a "quick fix" that violates a principle, push back before complying.

## Things to Never Do

- Use `any` to make a type error go away. Find the actual type.
- Add a configuration option when a smart default would do (Constitution Principle 2).
- Expose business logic in a React component or Next.js page file.
- Bypass the spec/ADR process to "just ship it" — the discipline is the point.
- Reproduce content from search results or third-party sources verbatim into our code or docs.

## Reminders for Long Sessions

- The constitution is in `docs/constitution.md`. Re-check it when making cross-cutting decisions.
- The data model is in `docs/PLANNING.md` Section 8. Don't infer schema from code if the doc disagrees — fix the code.
- "I'm not sure if this matters" → it's worth a quick ADR or spec note rather than a silent decision.
