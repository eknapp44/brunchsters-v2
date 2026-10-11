# 0004 — Semantic release and conventional commits

**Date:** 2026-06-14  
**Status:** Accepted  
**Deciders:** Evan Knapp

## Context

Merges to `main` deploy automatically to Vercel, but there was no way to know what changed between deployments, roll back to a specific feature boundary, or communicate what constitutes a "release" of the product. Vercel's deployment history tracks deploys but not intent — it doesn't distinguish a one-line fix from a major feature landing.

Additionally, commit messages in this project already follow Conventional Commits (`feat:`, `fix:`, `chore:`, etc. per CLAUDE.md) — making automated version inference a natural fit.

## Decision

Adopt **semantic-release** to automate versioning, changelog generation, and GitHub releases on every push to `main`. Version bumps are derived from conventional commit messages: `fix:` → patch, `feat:` → minor, `BREAKING CHANGE` footer → major. Each release produces a git tag, a `CHANGELOG.md` entry, and a GitHub Release with generated notes.

Also add **husky + lint-staged** to enforce lint and formatting on staged files at commit time, reducing CI noise from trivial style issues.

## Consequences

- **Easier:** clear release history tied to feature boundaries; rollback target is a named tag, not a Vercel deploy hash; `CHANGELOG.md` is generated automatically; commit discipline is enforced locally before code reaches CI.
- **Harder:** conventional commit format becomes load-bearing — a carelessly prefixed commit (`update stuff`) won't trigger a release even if it should. Requires awareness of what `feat:` vs `fix:` vs `chore:` actually means for versioning.
- **No action needed for `GITHUB_TOKEN`** — the release workflow uses the token GitHub injects automatically into Actions runners.

## Alternatives considered

- **Manual GitHub releases** — rejected: tedious and easy to skip on a solo project; automating it removes the friction entirely.
- **`release-please` (Google)** — viable alternative, uses a PR-based flow to propose version bumps. Rejected in favor of semantic-release because semantic-release integrates directly with the existing conventional commits convention and requires no extra PR step.
- **No releases, rely on Vercel history alone** — rejected: Vercel history is ephemeral and not tied to code intent. A git tag is durable, repo-native, and universally understood.

## Amendment — 2026-10-11: releases no longer commit to `main`

`main` is protected by rulesets that require a pull request for every change (`main-2`). The original setup committed `CHANGELOG.md` and a `chore(release): x.y.z [skip ci]` commit straight to `main` through `@semantic-release/git`, which those rules forbid for anyone who is not on the bypass list. On a repository owned by a personal account GitHub does not allow the "GitHub Actions" app on a ruleset bypass list (that is an organization feature), so the release bot cannot be allowed through.

**Decision:** drop `@semantic-release/changelog` and `@semantic-release/git`. A release now creates a **version tag** and a **GitHub Release carrying the generated notes** — the Releases page is the changelog. Nothing is committed to `main` by the release job; semantic-release's own core only pushes tags and a notes ref (`git push --tags`), neither of which a branch ruleset covers. Versioning, conventional commits and the `GITHUB_TOKEN` setup are unchanged.

**Consequences:** `CHANGELOG.md` is frozen at 1.4.0 (it carries a note saying so) and is no longer a source of truth; release notes live on GitHub. There is no automatic version-bump commit, which also removes the `[skip ci]` commit the old flow pushed. Alternatives rejected: a personal access token stored as a secret (a long-lived credential, and it would require the Admin bypass to stay "always"), and releasing by hand.
