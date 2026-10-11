# 0008 — Normalize email addresses to lowercase at the boundary

**Date:** 2026-10-11  
**Status:** Accepted  
**Deciders:** Evan Knapp

## Context

Email addresses identify people across the app (a user's account, an invite, an invite suggestion), but they are compared **exactly**: the unique keys are plain strings (`User.email`, `BrunchInvite[brunchId, invitedEmail]`, `BrunchInviteSuggestion[brunchId, suggestedEmail]`) and the account lookups are `user.findFirst({ where: { email } })`.

The e2e suite (spec 0006, M5) showed the consequence: inviting `Case-X@Example.com` and later `case-x@example.com` creates **two** invites — two links, two lines in the host's list — for one person. The same gap means an invite typed in lowercase can miss an existing account whose Google profile address has capitals, so a known user is treated as a stranger. Within a single batch, and against the host's own address, `sendInvites` already compares case-insensitively; everywhere else it does not.

In practice every mail provider treats the local part as case-insensitive, even though the RFC technically allows case-sensitive local parts.

## Decision

**Store and compare emails in one canonical form — trimmed and lowercased — produced at the boundary by a single function, and make the type system enforce it.**

1. `normalizeEmail(raw: string): Email` in `packages/shared` (`trim().toLowerCase()`) is the **only** way to produce the branded `Email` type. Services that handle an address take `Email`, so a raw string cannot reach them without passing through it; the compiler enforces the rule instead of reviewers remembering it.
2. Every entry point normalizes: the request schemas that accept addresses (`z.email().transform(normalizeEmail)` in `sendInvites` and `suggestInvitee`), and `signInWithProvider` (the address Google reports).
3. A migration lowercases the existing rows in all four columns (`User.email`, `UserAuthProvider.email`, `BrunchInvite.invitedEmail`, `BrunchInviteSuggestion.suggestedEmail`). It first checks for rows that would collide once lowercased and stops with a readable message instead of failing on a unique-constraint error half way through.
4. **Belt and braces:** the same migration adds `CHECK (column = lower(column))` constraints on those four columns, so a code path that forgets to normalize fails loudly in a test instead of silently creating a duplicate. Prisma cannot express check constraints in the schema; like the partial unique indexes from spec 0005, they live in the migration SQL.
5. The original casing is not kept. It carries no meaning for matching, and the app never displays an address in a way that depends on it.

## Consequences

- Duplicate invites for one person across requests become impossible; an invite to `Guest@Example.com` finds the existing account `guest@example.com` and vice versa.
- New code that handles an email is steered by the compiler to normalize it first.
- The check constraints turn any future miss into a visible error rather than a quiet duplicate. The cost is that tests and scripts that insert mixed-case addresses directly through Prisma now fail and must use `normalizeEmail`.
- Anything that previously relied on exact-case matching (nothing intentional) changes behavior.
- Out of scope, deliberately: provider-specific aliasing (Gmail ignoring dots and `+tags`), internationalized addresses, and showing the address as the user typed it.

## Alternatives considered

- **Postgres `citext` columns.** Case-insensitive at the database, so lookups and unique keys work without code changes. Rejected: it needs the extension in every environment plus Prisma's `postgresqlExtensions` preview feature (`@db.Citext`), ties comparison semantics to one database, and leaves `packages/core` unable to reason about equality on its own. The project's convention is a framework- and database-agnostic core with branded domain primitives (`Email` already exists), which this decision uses.
- **A unique index on `lower(email)` plus case-insensitive queries (`mode: 'insensitive'`).** Prisma cannot express expression indexes in the schema, and every query would have to remember the flag — the same "easy to miss one" problem, without compiler help.
- **Normalizing only on read (compare with `toLowerCase()` in code).** Leaves mixed-case data in the table and the unique keys still exact; already the status quo that failed.
