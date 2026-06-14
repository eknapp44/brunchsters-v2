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
