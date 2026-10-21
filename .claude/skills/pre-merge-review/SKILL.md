---
name: pre-merge-review
description: Review a finished Brunchsters feature branch before the PR is opened or merged - four lenses (architecture and style, acceptance criteria, security, loose ends) plus a lifecycle and docs-drift pass; fixes found go in their own fix commits. Use when all milestones are done, or the user says "review before merge" / "multi-lens review".
---

# pre-merge-review

The owner likes a multi-lens review before merge. It is a pass over the **whole branch** (`git diff main...HEAD`), after the last milestone and before any push or PR. It reads; it only edits to fix what it finds, and each fix is its own `fix:` commit with its own test, proven to fail without the fix (as in `/milestone-done` step 3). Do not push, open a PR, or merge: those are confirmed with the owner.

## 0. Frame

- Read the spec's `spec.md` (acceptance criteria, E2E journeys, "does not cover"), `plan.md`, and each milestone's testing note. Run `git diff main...HEAD --stat` and read the diff, not the summaries.
- Run `pnpm typecheck && pnpm lint && pnpm test`; for user-facing work also `pnpm test:e2e` and CI mode. Do not claim a check passed unless it ran this turn.

## 1. Four lenses (each ends with findings or "none found")

1. **Architecture and style.** Does it follow the constitution, the ADR it cites, and the scoped `CLAUDE.md`? Business logic out of components; boundaries enforced (lint) rather than only documented; naming, file placement, branded types, `Result` usage, no `any`. Is anything a second way of doing what the repo already has a first way for?
2. **Acceptance criteria.** Tick each box in `spec.md` against the code, not against the testing notes. Anything that differs from the spec is recorded under the spec's outcome, not left to drift.
3. **Security and privacy.** New routes and the 404-for-outsiders / 403-for-members order; what is stored client-side and how long it lives; what a second person on the same browser could see; inputs trusted without validation.
4. **Loose ends.** TODOs, dead code, unused exports, docs that still say the old thing (grep for the old wording), numbering references, deferred work recorded in `PLANNING.md` §17, testing notes that overstate coverage.

## 2. Two extra passes that earlier reviews found things with

- **Lifecycle and races.** Every async result that can land after its owner was reset, unmounted or replaced; double clicks; a second tab or person acting between load and click; retries. Each needs a test or a recorded reason.
- **Does a test guard it?** For each rule the diff adds or ports, name the test that fails if it is removed. If only a unit test would, say so; add a journey when the rule is user-observable, or record the gap.

## 3. Report

Findings ranked by severity, each with file and line, the failing scenario, and the fix commit if fixed. Say plainly what was not checked. End with what is ready (branch, commits) and what needs the owner's decision (push, PR, merge).
