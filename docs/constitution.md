# Brunchsters Constitution

**Version:** 1.0
**Last Updated:** 2026-04-26
**Status:** Active

This document establishes the non-negotiable principles for the Brunchsters project. Every decision — architectural, design, implementation — must be consistent with the principles below. When a principle conflicts with an immediate convenience, the principle wins.

The constitution evolves through deliberate amendment, not drift. Changing a principle requires an ADR explaining the rationale and what it supersedes.

---

## I. Product Principles

### 1. Brunch planning, nothing more
Brunchsters fills the gap between Google Maps and Google Calendar — making it easy to socially plan brunch with friends. Features that don't serve **planning a brunch** are out of scope by default. "During brunch" and "after brunch" features (check-ins, splitting, photos) are explicitly deferred unless a future ADR justifies inclusion.

### 2. Smart defaults over configuration
When a reasonable default can serve the user, don't expose a setting. Configuration is a last resort, not a feature. Every toggle, dropdown, and option must justify its existence against the cost of decision fatigue.

### 3. Progressive disclosure
Show only what's needed at each step. Complexity is revealed as users need it, not surfaced upfront. The first-time user should never face an empty form with twelve fields.

### 4. Mode emerges from behavior
Where possible, infer the user's intent from what they do, not what they declare. Example: a host adding one location is "host decides"; adding multiple is "group vote." No mode toggle required.

### 5. Low friction over feature richness
Every feature is measured against the cost it adds to the core flow. A feature that improves edge cases at the expense of the common path is rejected.

---

## II. Architectural Principles

### 6. API-first
Business logic lives in API and service layers, not in page components or UI code. The web app is one client; mobile will be another. Any business logic embedded in a UI component is technical debt by definition.

### 7. Provider abstraction for external dependencies
Auth, place provider, realtime, notifications, email, and storage are all accessed through interfaces we control — never directly. Swapping providers must be a contained change, not a refactor.

### 8. Optimize for change, not perfection
Every architectural decision is evaluated against "how easy is this to change later?" not "is this perfect now?" Lock-in is the failure mode to avoid.

### 9. Database is portable
The data layer is plain Postgres + Prisma. No vendor-specific features (Supabase Auth row-level security, etc.) embedded in the data model. The database can be moved between providers with `pg_dump`/`pg_restore`.

### 10. Lookup tables for configurable enums
Status values, types, categories, and any field with a finite set of meaningful values goes in a lookup table — not a TypeScript enum. Lookup tables include `isActive` and `sortOrder`. New values require no code deploy.

### 11. Soft delete and audit by default
Major entities have `deletedAt` / `deletedBy`. Significant changes are captured in `AuditLog`. Hard deletes are an exception requiring justification (typically GDPR compliance).

### 12. Idempotent transactions, async consequences
Synchronous APIs handle the database transaction. Side effects (email, notifications, audit logs, downstream events) are dispatched to a queue. The API's response does not depend on side effects completing.

---

## III. Code Principles

### 13. TypeScript end-to-end, strict mode
No `any` without explicit justification. No `// @ts-ignore` without an inline comment explaining why. Types flow from database (Prisma) through API to UI without re-declaration.

### 14. Shared types over duplicated types
A type used in both API and UI lives in `packages/shared`. Duplicated types are a bug; one will drift from the other.

### 15. Business logic is framework-agnostic
Logic in `packages/core` does not import from `next`, `react`, or any framework. It is pure TypeScript that could run in Node, the browser, or React Native.

### 16. Tests for business logic, not for framework code
Unit tests cover `packages/core` and API route handlers. UI tests cover critical user flows. We do not test that React renders or that Next.js routes — those are framework guarantees.

### 17. Naming reflects domain, not technology
A function is `confirmBrunch`, not `updateBrunchStatus`. A table is `BrunchAttendee`, not `UserBrunchJoinTable`. The domain language from `PLANNING.md` is the source of truth for naming.

---

## IV. Process Principles

### 18. Spec before code
No feature is implemented without a spec. For trivial changes (typo fix, dependency bump), the PR description is the spec. For real features, a `specs/NNNN-feature-name/` directory with spec, plan, and tasks comes first.

### 19. ADR for significant decisions
Decisions that are hard to reverse, choose between meaningful alternatives, or capture non-obvious tradeoffs get an ADR. Routine implementation choices do not.

### 20. Documentation lives with code
`PLANNING.md`, ADRs, specs, and the constitution all live in the repo, version-controlled, and evolve through PRs. There is no "wiki" or external doc site — the repo is the single source of truth.

### 21. Living documents, not snapshots
Specs and planning docs are updated as decisions change. Stale docs are worse than no docs. When a section is no longer accurate, fix it in the same PR that changes the behavior.

### 22. Removed features stay documented
When a feature is removed, its spec is moved to `specs/archive/` with a status note explaining why and when. Future decisions benefit from knowing what was tried and rejected.

---

## V. Design Principles (Google-Inspired)

### 23. Content first
The UI gets out of the way. Chrome, decoration, and ornamentation are minimized. The user's brunch is the subject; the app is the frame.

### 24. One primary action per screen
Every screen has a clear, obvious next step. Secondary actions are visually subordinate. Users should never wonder what to do next.

### 25. Familiar over clever
Patterns the user knows from Google, Apple, and other consumer apps are preferred over novel interactions. Cleverness in UX is a cost, not a feature.

### 26. Mobile-quality on every device
Even though v1 is web, every screen works well on a phone-sized viewport. The mobile app v3 should not require redesigning v1's information architecture.

---

## VI. Security & Privacy Principles

### 27. Auth is never homegrown
We use established providers (Google, Apple, NextAuth) and never roll our own password hashing, session management, or token signing.

### 28. Least privilege for invite tokens
Invite tokens are single-purpose, expire by default, and grant only the access needed. No invite token grants more than "join this one brunch."

### 29. Email is identity, not contact info
A user's email is the stable identifier for auth and notifications. It is not exposed in the UI to other users without explicit opt-in.

### 30. Sensitive data has a documented retention policy
Audit logs, notifications, and any PII have explicit retention and archival rules. Default for unstructured data is "delete when no longer useful."

---

## Amendment Process

The constitution changes through deliberate amendment:

1. Open a PR adding an ADR titled "Amend Constitution: \<change\>"
2. The ADR explains: which principle is changing, why, what alternatives were considered, what consequences are accepted
3. The PR updates this document and increments the version
4. On merge, the constitution is in force as of that commit

The constitution is not infallible. It exists to be questioned — but only deliberately, never accidentally.

---

## Reference

- `PLANNING.md` — what we're building
- `docs/adrs/` — why specific decisions were made
- `specs/` — per-feature specifications (spec, plan, tasks)
