# 0006 — Derive decision type instead of storing it

**Date:** 2026-09-09  
**Status:** Accepted  
**Deciders:** Evan Knapp

## Context

PLANNING.md §8 puts `decisionTypeId` (FK → `BrunchDecisionType`, values `host_decides` / `group_vote`) on both `BrunchLocation` and `BrunchTime`, annotated "moved from Brunch — per-resource." The scaffold implemented that literally: the column sits on every option row.

`createBrunch.ts:125` stamps it once, at creation, from the length of the input array — one location means the host decided, two or more means it goes to a vote (PLANNING §5: "mode emerges from behavior"). That is the actual rule, and it is a pure function of data already in the database: how many non-deleted options of that kind the brunch has.

Storing it was harmless while `createBrunch` was the only writer. Spec 0005 adds four more writers — the host adding a location or time after creation, the host removing one, and an approved invitee suggestion becoming a ballot option. Each one changes the option count, so each one has to rewrite `decisionTypeId` on every _sibling_ row to keep the column truthful. A single missed path leaves a brunch claiming `host_decides` while showing three options, or `group_vote` with one.

The column is also, right now, cheap to remove: `grep` finds it in `createBrunch.ts`, its two tests, and `seed.ts`. No UI reads it. After spec 0005's voting screens ship, that stops being true.

## Decision

Drop `decisionTypeId` from `BrunchLocation` and `BrunchTime`. Derive the mode instead:

> A brunch is in `group_vote` for a given resource kind if it has more than one non-deleted option of that kind; otherwise `host_decides`.

Keep the `BrunchDecisionType` lookup table, seeded and unreferenced by any FK. It still names a real domain concept the UI displays as a badge, and rendering that label from the lookup rather than a hardcoded string is consistent with how every other lookup table is used. This follows the §8 convention of defining lookup values before anything points at them.

PLANNING.md §8 is amended to describe the derivation and to mark `BrunchDecisionType` as label-only.

**Revisit trigger:** if a host ever needs to override the mode explicitly — "three options but I'll decide myself" — the derivation no longer captures intent, and the column comes back as a nullable override rather than the source of truth.

## Consequences

- Mode cannot drift from reality. The class of bug where an option is added and a sibling row is not updated stops existing.
- Every writer that changes the option count gets simpler: it inserts or soft-deletes a row and nothing else.
- Reads pay a count they were already doing — the voting screen loads the options regardless, so the mode falls out of a list already in memory. A list view that wants the mode without loading options gets it from a filtered relation count in the same query, the pattern `getBrunchesForUser.ts` already uses for its going count; no N+1.
- **The derivation inherits the soft-delete footgun, permanently.** The Prisma soft-delete extension only filters top-level models, so any count feeding the derivation must spell out `where: { deletedAt: null }` or it counts removed options and computes the wrong mode. This is the same bug class as a vote count that forgets to filter its parent. It is traded knowingly against drift: a forgotten filter is a bug in one helper that a test can pin, whereas a forgotten sibling rewrite is a bug in every writer and silently corrupts stored data. `deriveDecisionMode` is the single place allowed to do this count, and it owns the filter.
- A migration drops two NOT NULL columns and their FK constraints. Existing rows lose data that was fully derivable, so nothing is lost.
- `BrunchDecisionType` becomes a table with no foreign keys pointing at it, which reads as dead weight to anyone scanning the schema. The model comment carries the explanation.
- This makes separate suggestion tables the right shape for spec 0005 (see below), which was not obvious before.

## Alternatives considered

- **Keep the column, rewrite siblings on every count change.** Rejected. It makes correctness depend on every future write path remembering a non-local invariant, and spec 0005 quadruples the number of such paths. The failure is silent and the data is derivable anyway.
- **Move it to two columns on `Brunch`** (`locationDecisionTypeId`, `timeDecisionTypeId`). Rejected. Better than per-row — the value describes the set, so it belongs on the set — but it is still a stored copy of a derivable fact, so it still drifts. It only shrinks the number of rows that can be wrong.
- **Store the mode on option rows _and_ let unapproved suggestions live in the same table** (with a pending status column, instead of separate suggestion tables). Rejected, and the two decisions interlock: with the mode derived from a row count, a pending suggestion sitting in `BrunchLocation` would silently flip a brunch into `group_vote` before the host ever approved it. Keeping suggestions in their own tables means every row in `BrunchLocation` / `BrunchTime` is a real ballot option, which is exactly the invariant the derivation depends on.
