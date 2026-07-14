# 0005 — Defer next-intl until pre-launch

**Date:** 2026-07-12  
**Status:** Accepted  
**Deciders:** Evan Knapp

## Context

PLANNING.md §9.12 prescribes adopting `next-intl` "from day one even with English-only content" to avoid a painful string-extraction refactor later. Spec 0003 (Create Brunch) builds the first real UI — dashboard and creation wizard — so the day-one moment is now: either wire `next-intl` before writing these screens, or explicitly defer it.

The auth spec (0002) already built the sign-in page and nav without message catalogs; continuing without a decision would be silent divergence from PLANNING.md, which the project rules forbid.

## Decision

Defer `next-intl` adoption until the pre-launch checklist. UI copy is written as plain string literals in components until then. PLANNING.md §9.12 is amended to reference this ADR.

**Revisit trigger:** before v1 launch, or earlier if a second locale becomes a real requirement.

## Consequences

- Every UI milestone until launch avoids message-catalog ceremony (extraction, keys, provider wiring), keeping the solo iteration loop fast.
- A string-extraction pass is accepted as future work. The cost scales with UI surface, which is intentionally small pre-launch (constitution: minimal chrome, few screens).
- Copy lives next to the components that use it, which is easier to iterate on while the product voice is still settling.

## Alternatives considered

- **Adopt now (as PLANNING.md §9.12 originally said):** rejected for v1 — English-only, solo developer, zero current user value, and a tax on every UI milestone. The original rationale (avoid a future refactor) assumed going international is likely enough to pre-pay for; for a side project it is not.
- **Lightweight homegrown string-constants module:** rejected — worst of both worlds. It adds indirection now without providing real i18n (pluralization, formatting, locale routing) later.
