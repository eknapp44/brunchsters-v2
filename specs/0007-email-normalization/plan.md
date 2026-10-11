# Plan 0007 — Email Normalization

**Companion to:** `spec.md`

---

## Architecture

### Files introduced or changed

```
docs/adrs/0008-normalize-email-addresses.md                         (new — committed with the spec)

packages/shared/src/email.ts                                        (new — M1: normalizeEmail)
packages/shared/src/email.test.ts                                   (new — M1)
packages/shared/src/index.ts                                        (updated — M1: export it)

packages/core/src/invite/sendInvites.ts                             (updated — M1: schema transform, Email[])
packages/core/src/invite/suggestInvitee.ts                          (updated — M1: schema transform, Email)
packages/core/src/auth/signInWithProvider.ts                        (updated — M1: normalize provider email)
packages/core/src/**/*.test.ts, *.integration.test.ts               (updated — M1: use normalizeEmail / Email)

packages/database/prisma/migrations/<ts>_normalize_emails/migration.sql   (new — M2)

apps/web/e2e/support/factories.ts                                   (updated — M3: createUser/inviteToBrunch normalize)
apps/web/e2e/journeys/invitations-host.spec.ts                      (updated — M3: I7)
```

### `normalizeEmail`

```ts
export function normalizeEmail(raw: string): Email {
  return raw.trim().toLowerCase() as Email; // the one place a plain string becomes an Email
}
```

Idempotent. Not validation: `z.email()` still validates; the transform runs after it, so the schema's output type is `Email`.

### Boundaries

| Where an address enters                 | Change                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------- |
| `sendInvitesRequestSchema.emails`       | `z.array(z.email().transform(normalizeEmail))` → `readonly Email[]`     |
| `suggestInviteeRequestSchema.email`     | `z.email().transform(normalizeEmail)` → `Email`                         |
| `signInWithProvider` (Google's address) | normalize before the account lookup and create                          |
| Services comparing the host's address   | keep their defensive `toLowerCase()`; the data is now already lowercase |

Services that receive an address are typed `Email`, so tests and callers that pass a bare string stop compiling; they pass `normalizeEmail(…)` (or an `Email` already).

### Migration (M2)

One migration, in this order:

1. **Collision check** — for each unique key (`User.email`; `BrunchInvite[brunchId, invitedEmail]`; `BrunchInviteSuggestion[brunchId, suggestedEmail]`), find rows that become equal after `lower(btrim(…))`. If any exist, `RAISE EXCEPTION` with the table and the offending values and tell the operator to resolve them by hand. (Soft-deleted rows count: the unique keys include them.)
2. **Backfill** — `UPDATE … SET col = lower(btrim(col))` on the four columns.
3. **Check constraints** — `CHECK (col = lower(col))` on each, named `<table>_<column>_lowercase`.

Rollback is dropping the three constraints; the lowercased data stays (the original casing is not worth keeping — ADR 0008).

### Verification of the migration

There is no production data, and the dev database has no mixed-case rows, so the migration is verified against a scratch database: apply every earlier migration, insert mixed-case rows (including a deliberate collision), then apply the new one and check the outcomes. The script and results go in the M2 testing notes.

### Test strategy

- Unit: `normalizeEmail`; each boundary (schemas, `signInWithProvider`) with mixed-case input.
- Integration (real Postgres): invite the same address in two cases → one row; invite a lowercase address for an account with a capitalized stored address (created through `signInWithProvider`, so normalized) → known-user path; a direct mixed-case insert fails the check constraint.
- E2E: journey I7.

---

## Decisions already made

See ADR 0008.

## Risks

| Risk                                                       | Mitigation                                                                                           |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| A code path forgets to normalize                           | The `Email` type makes it a compile error; the check constraint makes it a runtime error in tests    |
| Existing mixed-case rows collide when lowercased           | Migration checks first and stops with a readable message; no such rows exist today                   |
| Tests that insert mixed-case emails directly start failing | Intentional — they are the cases the constraint exists to catch; update them to use `normalizeEmail` |
| Two real people share an address differing only in case    | Not a real-world case (providers treat the local part as case-insensitive)                           |
