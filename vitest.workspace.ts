import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/shared/vitest.config.ts',
  'packages/core/vitest.config.ts',
  'packages/database/vitest.config.ts',
  'apps/web/vitest.config.ts',
]);
