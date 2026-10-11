---
name: milestone-done
description: Close out a Brunchsters milestone - run the green checks, prove the new tests can fail, write the testing note, tick tasks.md, update docs, make the Conventional Commit, then stop for review. Use when a milestone's implementation is finished, or the user says "milestone done" / "close out M<n>".
---

# milestone-done

Closes out one milestone from `specs/NNNN-feature/tasks.md`. Follows CLAUDE.md's Milestone-Driven Implementation and Documentation Cadence sections. Do the steps in order and stop at the end. Never start the next milestone.

## 0. Identify the milestone

- Find the milestone in the active spec's `tasks.md` (match the branch `feat/NNNN-*`, or ask if ambiguous).
- Run `git status` and `git diff --stat`. The diff should contain only this milestone's work. If it contains unrelated changes, say so and ask before continuing. Pre-existing noise (`.idea/`, the untracked `.claude/`) is not part of the commit, so don't stage it.

## 1. Verify green

Always, from the repo root:

```
pnpm typecheck && pnpm lint && pnpm test
```

| If the milestone touched…                                                                          | Also run                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DB behavior, a migration, or anything in `packages/core` that queries                              | `pnpm --filter @brunchsters/core test:integration` (needs local Supabase on port 54322; see `docs/SETUP.md` and earlier testing notes for the winnat and non-interactive Prisma workarounds)                                                  |
| **Anything a user sees or does** — a screen, route, control, an observable rule, client-side logic | `pnpm test:e2e`; then the stress run `pnpm --filter @brunchsters/web exec playwright test --workers=4 --repeat-each=3`; then CI mode `CI=true pnpm build && CI=true pnpm test:e2e` (dev mode and the production build can behave differently) |

- If anything is red, **stop and report the output.** Do not commit a red branch. If the milestone can't be finished, offer a `wip:` checkpoint commit with a note instead.
- Do not claim a check passed unless you ran it this turn. After the e2e runs, confirm nothing is left listening on port 3100.
- If the milestone has no tests, it is not done. Flag it.

## 2. Check the diff against the task list

Read each `- [ ]` bullet for this milestone and confirm the diff actually does it. Where reality diverged (a bullet was unnecessary, done differently, or a premise was wrong), do not silently tick it. Record the divergence in the testing note ("Correction to this milestone's original task list").

**E2E bar (CLAUDE.md, "User-facing changes keep the E2E suite honest").** Ask of the diff: does it add or change a screen/control, a rule people can observe, anything involving more than one signed-in person, client-side logic, or fix a bug that was found by hand or in review? If yes, there must be a new or updated journey in `apps/web/e2e/journeys/` in this same commit. If the answer is yes and no journey exists, stop and say so rather than ticking the milestone. If no (refactor, backend-only already covered by integration tests, styling with accessible names unchanged), record the reason in one line in the testing note.

Quick self-check against CLAUDE.md rules on the new code: no `any` / `@ts-ignore`; business logic in `packages/core`, not components or pages; new schema has its migration committed and any new lookup table has seed entries; soft-deletable models' queries filter `deletedAt`; outsiders get 404 and members lacking privilege get 403 with membership checked first; emails are `Email` values from `normalizeEmail`.

## 3. Prove the new tests can fail

A test that has never failed proves nothing. For every new test or journey that guards a behavior (and **always** for a bug-fix regression test), temporarily break the production behavior it guards and confirm exactly that test fails — then restore.

Do it safely, because a careless restore destroys real work:

1. **Copy** each file you will mutate (`cp file /tmp/bk/`) — never rely on `git checkout`/`git stash` to undo a mutation while you have uncommitted edits in the same files. Committed code can be restored with `git checkout -- file`; uncommitted code cannot.
2. Mutate with a minimal, obvious change (flip a condition, remove a guard, reorder a check).
3. Run only the targeted tests. Expect the targeted test(s) to fail and the rest to pass; a mutation that fails nothing means the test is vacuous.
4. **Restore from the copy**, then confirm with `git diff` that the file matches what you intended to commit, and re-run the tests.
5. If a path cannot be mutated cheaply, say so in the testing note instead of claiming it was checked.

Record each mutation and which test it failed in the testing note ("How").

## 4. Write the testing note

Fill the milestone's `**Testing notes:**` block in `tasks.md` (replace any `_(fill on completion)_` placeholder). House format, short and honest:

- **What was tested** - behaviors and paths covered, including rejection cases
- **How** - unit / integration (real local Postgres) / E2E (Playwright) / smoke; what was mocked; the test counts; the mutation checks from step 3
- **E2E journeys** - which journeys this milestone added or updated (or the one-line reason none were needed)
- **What's deferred** - known gaps and why, including anything unverified. Never imply coverage that doesn't exist.
- **How to run it** - exact commands

Add these only when they apply: a bug found along the way and how it was caught, a design choice the spec didn't pin down, an infra gotcha future milestones need, a product finding that was logged but not fixed.

## 5. Update docs in the same commit

- Tick this milestone's checkboxes in `tasks.md` (only what is truly done).
- `PLANNING.md` / `SETUP.md` / the spec's `spec.md` if reality diverged or a command or env var changed. PLANNING is the source of truth: fix the doc rather than silently diverging.
- New ADR if the milestone introduced a library, pattern, or constitution deviation (`docs/adrs/README.md` has the template).

## 6. Commit

- Stage only this milestone's files by name. No `git add -A`. (If a path was already staged as deleted, don't name it again.)
- Conventional Commit message ending in the milestone tag, e.g. `feat: host confirms a brunch, locking location and time (M5)`. A product fix found along the way is its **own** `fix:` commit with its own test, not folded into the milestone.
- End the message with the co-author trailer from the session's attribution reminder.
- The pre-commit hook (husky + lint-staged) may reformat files. If it fails, fix the cause and make a new commit. Never use `--no-verify`.
- Never push to `main`. Push the feature branch only when a pull request exists or the user asked; if a PR is open, `gh pr checks <n> --watch` after pushing and report the result. Never write GitHub repository settings (rulesets, protection, secrets) — propose steps and let the user apply them.

## 7. Stop and summarize

Reply briefly, then wait for the user's go-ahead (if they have said to run several milestones back to back, still commit each one separately and summarize at the end):

- **Built:** one or two lines
- **Tested:** what ran and the pass counts, and what the mutation checks showed
- **Deferred / caveats:** anything unverified or diverged from the task list
- **Next:** the next milestone's title from `tasks.md`

Do not begin the next milestone.

## Tooling traps on this machine (each cost time once)

- Shell heredocs and `node -e "…"` containing backticks or nested quotes fail unpredictably in Git Bash. For anything multi-line, use the Write/Edit tools or a script file, not shell quoting.
- Bash's `/tmp` is not the same directory Node sees on Windows. Put scratch files in the session scratchpad directory.
- Playwright: Next.js keeps an empty `role="alert"` region on every page, so filter alerts by text; in dev mode the Next dev-tools button also matches a loose name like "Next", so use `exact: true`.
- Prettier/lint-staged may rewrite files at commit time; that is expected.
