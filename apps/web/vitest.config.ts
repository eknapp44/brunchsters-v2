import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Mirror the tsconfig "@/*" path alias so route tests resolve app imports.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    passWithNoTests: true,
    // Stubs the rate-limit enforcement for route tests (see the file).
    setupFiles: ['./vitest.setup.ts'],
    // Playwright specs are *.spec.ts; keep them out of vitest. e2e/support/*.test.ts still runs.
    exclude: [...configDefaults.exclude, 'e2e/journeys/**', 'e2e/screenshots/**'],
  },
});
