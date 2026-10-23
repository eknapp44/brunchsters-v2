---
name: post-merge
description: Close out a Brunchsters feature after its PR is approved - merge, wait for CI and the release, record the release in the spec, PLANNING and memory, open the docs PR, and write the kickoff prompt for the next spec. Use when the owner says the PR is good to merge, or "merge and release", or "clean up docs after release".
---

# post-merge

What the owner asked for after spec 0011 and spec 0012, written down so it is the same every time. It starts only when the owner has said to merge (a merge is not something to do unprompted). Do the steps in order.

## 1. Before merging

- `gh pr checks <n>`: all required checks green and `gh pr view <n> --json mergeable,mergeStateStatus` clean. If not, stop and report.
- Confirm the owner's manual checks are done (sign-in, a real page, console clean) when the feature touched auth, headers or a screen. If they have not said so, ask once.
- Merge style follows the repo history: a merge commit (`gh pr merge <n> --merge`). Never `--admin`, never edit rulesets or any repository setting (propose steps instead).

## 2. Wait for main and the release

- `gh run list --branch main --limit 2`, then `gh run watch <id> --exit-status`. The Release job runs only on `main` and only tags and publishes a GitHub Release (it commits nothing).
- `gh release list --limit 2`: note the new version. A `feat:` commit bumps the minor, a `fix:` the patch. If CI on `main` fails, stop and report the output.

## 3. Docs cleanup on a branch

Never push to `main`. Branch `docs/NNNN-released` from the updated `main`, and:

- Spec `spec.md`: **Status** says complete and released as vX.Y.Z (PR number, date); **Outcome** says what shipped (milestones, with anything that changed from the plan), what changed, what was found, and what is deferred. Rewrite any Outcome bullet that the later milestones or review passes made stale; do not leave a description of a design that was replaced.
- Spec `tasks.md`: a **Released** line.
- `docs/PLANNING.md`: the roadmap line (§17) says merged and released as vX.Y.Z; mark the previous spec too if it still says "ready to merge" (`grep -n "ready to merge"`). New deferrals are in §17.
- Anything else that quotes the old state (`grep` the old wording): `SETUP.md`, scoped `CLAUDE.md`, the skills.
- Prettier on the changed files, a `docs:` commit with the co-author trailer, push the branch, open a docs-only PR (template: no code, no journey needed). Do not merge it unless the owner says so (a merge to `main` may cut another release).

## 4. Memory

In the project memory directory: update the build-order entry (`project_scaffold.md`), replace the finished feature's "next up" note with one for the next spec (number, branch, next ADR number, grounded starting facts, questions to grill), and fix the index line in `MEMORY.md`. Delete notes that are now wrong.

## 5. Kickoff prompt for the next spec

Reply with a paste-ready prompt for after a `/clear`: the skill to start with (`/spec-grill`), the memory note to read first, the spec number, branch and ADR number, the scope in two lines, the rules that apply (404/403 order, `enforceWriteLimit`, `emailBudgets.test.ts`, `/ui-screen`), and the questions to grill. Put it on the clipboard when asked: write it to a scratch file and pipe it to `clip.exe` from PowerShell (`Get-Content -Raw <file> | Set-Clipboard`).

## 6. Report

Version released, the docs PR link and its CI state, what memory now says, the prompt, and anything left for the owner (merge the docs PR, repository settings I only propose).
