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

| #                                                           | Title                                                                   | Status   |
| ----------------------------------------------------------- | ----------------------------------------------------------------------- | -------- |
| [0001](./0001-monorepo-structure.md)                        | Monorepo structure with pnpm + Turborepo                                | Accepted |
| [0002](./0002-hosting-vercel-supabase.md)                   | Hosting: Vercel + Supabase                                              | Accepted |
| [0003](./0003-no-email-password-auth.md)                    | No email/password authentication                                        | Accepted |
| [0004](./0004-semantic-release-and-conventional-commits.md) | Semantic release and conventional commits                               | Accepted |
| [0005](./0005-defer-next-intl.md)                           | Defer next-intl until pre-launch                                        | Accepted |
| [0006](./0006-derive-decision-type.md)                      | Derive brunch decision type                                             | Accepted |
| [0007](./0007-e2e-testing-stack.md)                         | End-to-end testing stack                                                | Accepted |
| [0008](./0008-normalize-email-addresses.md)                 | Normalize email addresses to lowercase                                  | Accepted |
| [0009](./0009-inngest-event-bus-and-email-delivery.md)      | Inngest EventBus and email delivery                                     | Accepted |
| [0010](./0010-css-modules-and-design-tokens.md)             | CSS Modules and design tokens                                           | Accepted |
| [0011](./0011-redux-toolkit-for-client-ui-state.md)         | Redux Toolkit for client UI state                                       | Accepted |
| [0012](./0012-design-fidelity-and-presentation-rules.md)    | Design fidelity: compositions, voice, and where presentation rules live | Accepted |
| [0013](./0013-rate-limits-in-postgres.md)                   | Rate limits: Postgres counters behind a `RateLimiter` interface         | Accepted |
| [0014](./0014-content-security-policy-with-nonce.md)        | Content-Security-Policy with a per-request nonce                        | Accepted |
| [0015](./0015-brunch-lifecycle.md)                          | Brunch lifecycle: call it off, bring it back, delete, and hide          | Accepted |
