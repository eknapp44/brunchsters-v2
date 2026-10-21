---
name: spec-grill
description: Start a new Brunchsters feature the way the project wants it started - read the real code, grill the user on design gaps with recommendations, then write the ADR and spec/plan/tasks and create the feature branch. Use when the user wants to start a new feature or spec, says "grill me", or asks for a design review before building. Takes the feature idea as an argument.
---

# spec-grill

Turns a feature idea into a reviewed spec **before any implementation**. CLAUDE.md requires spec-before-code and an ADR for significant decisions; the owner wants to be _challenged_ on design gaps first, not handed a spec that quietly papers over ambiguity. A contradiction found now is cheap; the same one found mid-milestone is not.

The feature idea is in the skill's argument (or ask for it in one line). Do the phases in order. **Do not write implementation code in this skill.**

## Phase 0 — Load context (read, don't guess)

- `CLAUDE.md` (conventions, the E2E bar, the 404/403 rule, branded types) and `docs/constitution.md`.
- The `docs/PLANNING.md` sections the feature touches (data model §8, permissions §6, build order §16, open questions §17).
- `docs/adrs/` — skim titles, read any that touch the area. When in doubt about _why_, check the ADRs.
- The previous specs most like this one (`specs/NNNN-*/spec.md` and `tasks.md`) — use them as the format and the quality bar; their testing notes list known gaps and findings that may be this feature's inputs.
- The memory index for standing preferences.
- Earlier specs and ADRs for decisions **this feature reverses** (spec 0010 reversed spec 0003's "wizard state stays local"). Say so in the new ADR, and give the old doc a pointer in the same docs commit.
- If the feature adds a runtime dependency, note the baseline first-load JS of the affected routes on `main` now, so the cost can be compared later.

## Phase 1 — Reconnaissance (ground every claim in the code)

Before asking anything, read the actual schema, services, routes and screens the feature will touch, and check how today's behavior really works. Produce a short list of **grounded findings**: facts that change the design ("`isConfirmed` is a plain boolean with no constraint, so two rows can both be true"; "the services require an `active` brunch, so this control would always fail"). Generic checklists don't land; specific findings do.

Verify every claim you intend to put in a spec against the code or by running it. A spec that describes behavior the app doesn't have is a bug in the spec (spec 0007's first draft said approving an already-invited suggestion was "refused"; it is actually allowed).

If the feature adds client state or a mutation, say **per piece** whether it is a Redux slice or local `useState` (`apps/web/CLAUDE.md` "State"), and whether it triggers one of the "Redux follow-ups" in `docs/PLANNING.md` §17 (a toast or visible error, the shared mutation slice, the unread count). Don't add a second pattern for state the store already has a home for.

Also check: does the idea **conflict with the constitution or an ADR**? Surface it now and ask; don't comply silently.

## Phase 2 — Grill

Lead with your **opinion**, not a survey. Present decisions as: the question, your recommendation with the reason, and the realistic alternative. The owner often answers "I'm open to opinions" — so a recommendation they can accept in one word is the most useful form.

- Ask about what the code **cannot** answer (product intent, trade-offs, scope). Don't ask what you can read.
- Batch by dependency: first the questions that change everything else (approach, scope), then details. Prefer 3–4 questions at a time with `AskUserQuestion` (options, a "(Recommended)" first option) over a wall of eight; use prose when the question needs explaining.
- The owner has overridden recommendations before — present real alternatives, don't steer.
- Explicitly ask "any grey areas I've missed?" after the main round, and name the ones you see: permissions and who can see what (404 for outsiders), what happens on failure, race conditions, the draft/active/confirmed states, data migration and existing rows, what is deliberately **not** covered.
- Things the owner can't decide yet go in the spec's **Open Questions**, not into a silent default.

Stop grilling when the remaining questions would not change what you build.

## Phase 3 — Decide and record

Summarize the decisions in a few lines and get a clear go-ahead to write them down. Anything that is a **significant decision** (new library, new pattern, a deviation from the constitution, a choice between two viable architectures, something that would surprise a future reader) gets an **ADR** in `docs/adrs/NNNN-title.md` using the template in `docs/adrs/README.md` (Context, Decision, Consequences, Alternatives considered), and a row in the README index. Pick the next number from the directory listing.

## Phase 4 — Write the spec

Create `specs/NNNN-feature/` (next number from the directory; **grep the repo for that number and for references that anticipate it**, such as "spec 0010" in PLANNING or older specs, and renumber them in the same docs commit) with:

- **`spec.md`** — `Status`, `Branch`, `PLANNING.md ref`, `ADRs`; **What** (and why, with the evidence); **User flows** (numbered, who does what); **Acceptance Criteria** as checkboxes grouped by layer (schema, services, API routes, UI, docs); an **`## E2E Journeys`** section — each journey with an ID, the people involved, and what is asserted, prioritizing multi-person flows, client-side behavior, failure recovery and historic-bug classes (see spec 0006's inventory and `docs/SETUP.md` "Adding E2E coverage"); **What This Spec Does Not Cover**; **Open Questions**.
- If the spec **adopts a pattern or infrastructure** (state layer, library, convention), its acceptance criteria include the adoption itself, not just the first use: enforcement where cheap (lint rule or test), the conventions and a migration recipe in the scoped `CLAUDE.md`, a root rule if it is repo-wide, this skill's prompts if specs must now ask about it, and pointers from the docs where future specs will look. Built in, not tacked on later.
- Every deliberate deferral is recorded in three places so it is not lost: the ADR (Consequences), the spec ("What This Spec Does Not Cover"), and `PLANNING.md` §17.

- **`plan.md`** — files introduced or changed, key design (types, data model, migration shape, the order of checks for anything permission-related), decisions already made, risks with mitigations, test strategy.
- **`tasks.md`** — small milestones, each independently green and ending in a commit: schema/migration → services + unit tests → routes + handler tests → UI → E2E journeys. Each has `- [ ]` checkboxes, a `Commit:` line with the Conventional Commit message, and `**Testing notes:** _(fill on completion)_`. The first task of M1 is "commit this spec and any ADR (docs-only commit, before any code)". Note that milestones close with `/milestone-done`.

Keep milestones small enough to review. Prefer proving the risky part early. Spell out what each milestone's tests are and how a regression test will be proven to fail.

## Phase 5 — Branch and docs commit

- Create the feature branch **before any implementation**, named for the spec: `feat/NNNN-feature`. If a stacked branch is needed (the work depends on an unmerged one), say so in `tasks.md`.
- Commit the ADR(s), the ADR index row, and the spec folder as one docs-only commit (`docs: add spec NNNN ...`), with the co-author trailer from the session's attribution reminder. Stage by name.
- Do not push, open a PR, or start M1. End by telling the owner what was decided, what is open, and asking for the go-ahead to start M1.

## Do not

- Write implementation code, or "just a quick prototype".
- Ask a question the repository answers.
- Put a claim in a spec you did not verify.
- Decide an open product question silently.
- Write GitHub repository settings, or touch anything outside the repo.
