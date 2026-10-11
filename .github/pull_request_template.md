Implements specs/NNNN-feature

## What

<!-- One or two sentences: what changes for a user, or for the codebase. -->

## Checks

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` pass
- [ ] Docs updated in this PR (spec `tasks.md` + testing notes, `PLANNING.md` / `SETUP.md` / ADR if reality changed)

## E2E journeys

<!-- See CLAUDE.md, "User-facing changes keep the E2E suite honest". Tick ONE. -->

- [ ] **Added or updated** journeys: <!-- list IDs/files, e.g. V4 in option-suggestions.spec.ts -->
- [ ] **No journey needed** because: <!-- refactor / backend-only (covered by integration tests) / copy or styling with accessible names unchanged / ... -->
- [ ] I ran `pnpm test:e2e` locally and it passes
- [ ] For any bug fixed that was found by hand or in review: the regression test fails with the fix removed

## Notes for review

<!-- Anything unverified, any product finding that was logged but not fixed, any setting the reviewer must change. -->
