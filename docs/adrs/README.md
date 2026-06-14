# Architecture Decision Records

ADRs capture significant decisions made during Brunchsters' development — what was decided, why, and what alternatives were considered. They are the audit trail for non-obvious choices.

## When to write an ADR

- Adopting a new library or framework
- Choosing between two viable architectural approaches
- Deviating from a constitution principle (requires justification)
- A decision that would surprise a future reader of the code

Trivial decisions (naming, minor refactors, version bumps) do not need ADRs.

## Template

```markdown
# NNNN — Title

**Date:** YYYY-MM-DD  
**Status:** Accepted | Superseded by [NNNN](./NNNN-title.md)  
**Deciders:** Evan Knapp  

## Context

What is the situation or problem that required a decision?

## Decision

What was decided?

## Consequences

What becomes easier or harder as a result?

## Alternatives considered

What else was evaluated and why was it not chosen?
```

## Index

| # | Title | Status |
|---|-------|--------|
| [0001](./0001-monorepo-structure.md) | Monorepo structure with pnpm + Turborepo | Accepted |
| [0002](./0002-hosting-vercel-supabase.md) | Hosting: Vercel + Supabase | Accepted |
| [0003](./0003-no-email-password-auth.md) | No email/password authentication | Accepted |
