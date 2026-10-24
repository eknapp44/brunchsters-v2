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

- A milestone that changes nothing mounted or user-visible (for example plumbing that no layout uses yet) may skip the stress run and CI mode; say so, and why, in the testing note, and run both in the first milestone that does mount it.
- If anything is red, **stop and report the output.** Do not commit a red branch. If the milestone can't be finished, offer a `wip:` checkpoint commit with a note instead.
- Do not claim a check passed unless you ran it this turn. After the e2e runs, confirm nothing is left listening on port 3100.
- If the milestone has no tests, it is not done. Flag it.

## 2. Check the diff against the task list

Read each `- [ ]` bullet for this milestone and confirm the diff actually does it. Where reality diverged (a bullet was unnecessary, done differently, or a premise was wrong), do not silently tick it. Record the divergence in the testing note ("Correction to this milestone's original task list").

**E2E bar (CLAUDE.md, "User-facing changes keep the E2E suite honest").** Ask of the diff: does it add or change a screen/control, a rule people can observe, anything involving more than one signed-in person, client-side logic, or fix a bug that was found by hand or in review? If yes, there must be a new or updated journey in `apps/web/e2e/journeys/` in this same commit. If the answer is yes and no journey exists, stop and say so rather than ticking the milestone. If no (refactor, backend-only already covered by integration tests, styling with accessible names unchanged), record the reason in one line in the testing note.

**Lifecycle check (state that outlives its owner).** For every async operation and every piece of state that can outlive the component, form or request that started it, ask what happens when the result lands after a reset, unmount, replacement or second click, and check there is a test. (Spec 0010's review found a create failure that landed after the wizard was reset and left a stale error for the next visit; it was caught only by reading the diff as a reviewer.)

**New runtime dependency.** Record first-load JS before and after in the testing note: build `main` first (`git checkout main && CI=true pnpm build`, then back), and read the per-route chunks from `apps/web/.next/app-build-manifest.json`, because the build table can under-report chunks that belong to a shared layout.

**Introduces a pattern or convention** (a state layer, a library, a rule)? It is not done until the pattern is enforced where cheap (a lint rule or a test, proven to fire), documented where the next author will look (the scoped `CLAUDE.md`, with a recipe for adopting it elsewhere), and the deferred adoption is recorded in `docs/BACKLOG.md`.

Quick self-check against CLAUDE.md rules on the new code: no `any` / `@ts-ignore`; business logic in `packages/core`, not components or pages; new schema has its migration committed and any new lookup table has seed entries; soft-deletable models' queries filter `deletedAt`; outsiders get 404 and members lacking privilege get 403 with membership checked first; emails are `Email` values from `normalizeEmail`.

## 3. Prove the new tests can fail

A test that has never failed proves nothing. For every new test or journey that guards a behavior (and **always** for a bug-fix regression test), temporarily break the production behavior it guards and confirm exactly that test fails — then restore.

Do it safely, because a careless restore destroys real work:

1. **Copy** each file you will mutate (`cp file /tmp/bk/`) — never rely on `git checkout`/`git stash` to undo a mutation while you have uncommitted edits in the same files. Committed code can be restored with `git checkout -- file`; uncommitted code cannot.
2. Mutate with a minimal, obvious change (flip a condition, remove a guard, reorder a check).
3. Run only the targeted tests. Expect the targeted test(s) to fail and the rest to pass; a mutation that fails nothing means the test is vacuous.
4. **Restore from the copy**, then confirm with `git diff` that the file matches what you intended to commit, and re-run the tests.
5. If a path cannot be mutated cheaply, say so in the testing note instead of claiming it was checked.

**Behavior-preserving refactors:** mutate the _rule being ported_ (a guard, a filter, a rollback), not just the new code, and see which _existing_ tests fail. If only a unit test fails, that is a coverage gap: say so in the testing note and either add a journey or record the gap (spec 0010: the stale-option filter had no journey until R4).

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

## While building: run only what you need (the close-out runs everything once)

The full close-out (typecheck, lint, unit, integration, dev e2e about 3 minutes, stress about 8, CI build and e2e) is for the end of a milestone, not for every edit. Between edits:

- Typecheck and lint are cheap: run them always.
- Unit: `pnpm --filter @brunchsters/core exec vitest run <path-or-name>` (or `@brunchsters/web`), and `... test:integration <name>` for one DB file.
- E2E: `pnpm test:e2e <file-name-fragment>` runs only the matching spec files (it still resets the e2e database), and `-g "<title>"` runs one journey. Run the journeys the diff touches plus any that find the changed names (grep the accessible names under `apps/web/e2e/`).
- Add `--repeat-each=3` to the touched journeys when the change is client-side timing, a wait, a debounce or a clock.
- The full suite, the stress run and CI mode are run once per milestone, at step 1 above, and again after any review-driven change that touches production code. If a full run has a failure that passes alone and on a repeat, say so in the testing note as a flake with the evidence, do not hide it.

## Tooling traps on this machine (each cost time once)

- Playwright waits forever on a click of an `aria-disabled` button; use `click({ force: true })` in a journey that proves it does nothing. A live color-scheme switch makes axe measure buttons mid-transition: set the scheme, then reload.
- A fixed rate-limit window makes "still refused afterwards" depend on the minute: use `alignToWindow` and `untilRefused` (`e2e/support/rateLimits.ts`), and seed big batches through the factory so ~100 real emails are not queued.
- The Next dev server can answer one transient 500 under a burst (a manifest file it is rewriting); a production build cannot. Send the first request of a loop alone.
- A test that opens many database connections exhausts the local Postgres: cap the pool in that test.
- A mutation check for a `router.refresh()` or any "tell the rest of the page" call is easy to forget: remove it and see a journey fail.

- Shell heredocs and `node -e "…"` containing backticks or nested quotes fail unpredictably in Git Bash. For anything multi-line, use the Write/Edit tools or a script file, not shell quoting.
- Bash's `/tmp` is not the same directory Node sees on Windows. Put scratch files in the session scratchpad directory.
- Playwright: Next.js keeps an empty `role="alert"` region on every page, so filter alerts by text; in dev mode the Next dev-tools button also matches a loose name like "Next", so use `exact: true`.
- Prettier/lint-staged may rewrite files at commit time; that is expected. After `pnpm add`, run `npx prettier --write pnpm-lock.yaml` or the lockfile diff is thousands of lines.
- **Never write a regex or any backslash escape through a shell heredoc or a Python string.** A word-boundary escape in a regex became a literal backspace character in a Playwright spec, and two assertions silently tested nothing. Write such code with the Write/Edit tools, then look for stray control characters (`cat -A file` shows a backspace as `^H`).
- **Dev-mode e2e fails unrelated tests while the owner's own `pnpm dev` (and its queue) are running** (404s, timeouts, a disposed request context; a different set each run). Check ports 3000 and 8288 first; if they are up, ask the owner to stop them or verify in CI mode (`CI=true pnpm build && CI=true pnpm test:e2e`). Building while their dev server runs shares one `.next` and can fail or disturb it; tell them to restart `pnpm dev` afterwards.
- **A mutation that does not fail the journey is a finding, not a pass.** Before recording "redundant", check the journey exercises that path at all (which element did it click? did the page take the branch?). Two M6 survivors were a journey clicking the wrong element, and a rule that also depended on another property.
- **A visual or timing fix found by hand is a bug found by hand:** it gets a regression journey that fails without it (geometry for a layout bug, `page.clock.fastForward` for a countdown), in the same commit.
- **Waiting out a hold in a journey**: seed "as of" a past moment through the real core service (`support/lifecycle.ts`), never wait real minutes.
