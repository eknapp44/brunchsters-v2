# [1.3.0](https://github.com/eknapp44/brunchsters-v2/compare/v1.2.0...v1.3.0) (2026-09-08)

### Bug Fixes

- address PR [#5](https://github.com/eknapp44/brunchsters-v2/issues/5) review findings — revoke access gap, suggestion-review atomicity ([7bf851a](https://github.com/eknapp44/brunchsters-v2/commit/7bf851af0b73e7877a88eb659df5fb614fe7911f))
- address second review pass — revive-flow crash, case-sensitive email checks, silent UI failures ([f6710f2](https://github.com/eknapp44/brunchsters-v2/commit/f6710f2db9ff1e023cd1214de0ec9c32f5695c4c))
- address third review pass — case-sensitive dedup, InvitePanel race, stale doc lines ([4a21c4a](https://github.com/eknapp44/brunchsters-v2/commit/4a21c4a3a844c031e563f5986af1072fb263f242))

### Features

- invite and suggestion API routes (M4) ([620ce22](https://github.com/eknapp44/brunchsters-v2/commit/620ce2238ffd210f1ef01179435cb0494ff34250))
- invite lifecycle services — send, resend, revoke, token lookup (M1) ([1ca52e6](https://github.com/eknapp44/brunchsters-v2/commit/1ca52e69ab14b15f8a220577c405d45d25662ea4))
- invite suggestion services with auto-approve and host review (M3) ([89e9263](https://github.com/eknapp44/brunchsters-v2/commit/89e926396a46b675e0b704aeb1ff2526bb89827a))
- public invite landing page with auto-accept on auth (M6) ([6cf5a1c](https://github.com/eknapp44/brunchsters-v2/commit/6cf5a1ccc6e13544a61fb6238b9a0b71a9f26288))
- respondToInvite service and getBrunchById viewer fields (M2) ([a809a9e](https://github.com/eknapp44/brunchsters-v2/commit/a809a9e241c252336837c5770f40d21deb370562))
- RSVP and invite-suggestion UI on brunch detail page (M7) ([5e07be5](https://github.com/eknapp44/brunchsters-v2/commit/5e07be52724c7bdb981a1447b824660726e33a17))
- wizard invite step and detail page invite panel (M5) ([f048999](https://github.com/eknapp44/brunchsters-v2/commit/f04899972caffa95c1ac56aed14659c1e9bbf411))

# [1.2.0](https://github.com/eknapp44/brunchsters-v2/compare/v1.1.0...v1.2.0) (2026-08-01)

### Bug Fixes

- add placeholder Google OAuth env vars to CI build job ([902d764](https://github.com/eknapp44/brunchsters-v2/commit/902d7646fbd49a45787f50aa985231ce2c4b8a60))
- address code review findings on error handling and API hardening ([c7d6bf1](https://github.com/eknapp44/brunchsters-v2/commit/c7d6bf1938c72fc9b35b0701e81f33aa007eafda))
- set Turborepo envMode to loose so CI build actually sees its env vars ([6c2f251](https://github.com/eknapp44/brunchsters-v2/commit/6c2f251cb9bbfceb1fe0083133848868af691455))

### Features

- brunch API routes and 401 middleware handling for API paths (M3) ([878da69](https://github.com/eknapp44/brunchsters-v2/commit/878da69af7da32d31411386916006781cd831b62))
- Create Brunch wizard and brunch detail page stub (M6) ([dd9e98b](https://github.com/eknapp44/brunchsters-v2/commit/dd9e98b1b293234c960a63d2996a9c1e98460291))
- createBrunch and getBrunchById services with unit and integration tests (M1) ([d5ba696](https://github.com/eknapp44/brunchsters-v2/commit/d5ba69669a66489188209573e33b863188068281))
- dashboard with brunch list empty state and Plan a Brunch CTA (M5) ([eccdd1b](https://github.com/eknapp44/brunchsters-v2/commit/eccdd1bb5bc53b2329ef02a8b577a3129c72868a))
- getBrunchesForUser service with unit tests (M2) ([ba3b89f](https://github.com/eknapp44/brunchsters-v2/commit/ba3b89fca0c70d88d5cdc5c87708cf2a61f2fee6))
- GooglePlacesProvider with Autocomplete sessions and places proxy routes (M4) ([292dbd1](https://github.com/eknapp44/brunchsters-v2/commit/292dbd1a67bbc6f97e8464ebdab1b4395ef25d78))

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
