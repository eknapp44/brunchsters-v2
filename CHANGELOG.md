# [1.1.0](https://github.com/eknapp44/brunchsters-v2/compare/v1.0.0...v1.1.0) (2026-07-12)

### Bug Fixes

- resolve monorepo env and Prisma externals issues blocking auth ([cdafa87](https://github.com/eknapp44/brunchsters-v2/commit/cdafa87ebafa9799aa2286d6d7ad3cb2ff159b12))
- wire Google OAuth credentials explicitly in auth.ts ([e1ec957](https://github.com/eknapp44/brunchsters-v2/commit/e1ec9572094d9fa417239eff01ce70e69fa15e7f))

### Features

- add middleware for route protection with callbackUrl redirect (M3) ([f66e43f](https://github.com/eknapp44/brunchsters-v2/commit/f66e43f367f7b7776a0e0edf2a724205daa3e12d))
- install Auth.js v5 and wire Google OAuth route handler (M1) ([bd2769c](https://github.com/eknapp44/brunchsters-v2/commit/bd2769cda5a1ed1dea67724bc431eedf155e538e))
- persist User and UserAuthProvider on sign-in (M2) ([327703d](https://github.com/eknapp44/brunchsters-v2/commit/327703dbc204f0f9b0686495f41ab958e9528400))
- sign-in page, nav avatar, and sign-out action (M4) ([e6913ef](https://github.com/eknapp44/brunchsters-v2/commit/e6913ef0777cc077163344c16add263d86882c6c))

# 1.0.0 (2026-06-14)

### Bug Fixes

- add DATABASE_URL env vars to typecheck and build CI jobs ([9274a8e](https://github.com/eknapp44/brunchsters-v2/commit/9274a8e4f7edc8a7221bd26699b508ed8c1dac80))
- use Prisma.defineExtension for typed soft-delete callbacks ([8dea6ca](https://github.com/eknapp44/brunchsters-v2/commit/8dea6ca1a91fb496a6bc495d1fbf89a71ae14300))

### Features

- add husky pre-commit linting and semantic-release workflow ([438e887](https://github.com/eknapp44/brunchsters-v2/commit/438e88713ac0ad843f999d1ef26b6087631346e1))
- Brand types in packages/shared and service interfaces in packages/core (M3) ([d4ef427](https://github.com/eknapp44/brunchsters-v2/commit/d4ef427fd4383e7df0cea84f8f3e7d5a8d2ea88c))
- full Prisma schema from PLANNING.md §8 (M4) ([5b6ec63](https://github.com/eknapp44/brunchsters-v2/commit/5b6ec63cb615070d3b006de6c2d6946a5d7b1ba2))
- initial commit with claude code export ([28e131b](https://github.com/eknapp44/brunchsters-v2/commit/28e131bbf55f5318b3ce39f79d6c829bdfd22d9d))
- initial DB migration, Prisma client, seed scripts, and soft-delete middleware (M5) ([d581761](https://github.com/eknapp44/brunchsters-v2/commit/d581761a0ee5f5e83fbdc8fa0efb7ccaef2ba86d))
- Next.js 15 App Router stub in apps/web (M2) ([1816fca](https://github.com/eknapp44/brunchsters-v2/commit/1816fca38217721aa0307431d89dab324638e1c5))
- Vitest config and GitHub Actions CI workflow (M6) ([0aaaaab](https://github.com/eknapp44/brunchsters-v2/commit/0aaaaab6ff1d57965657ec35ee6ccf41542ac6bf))
