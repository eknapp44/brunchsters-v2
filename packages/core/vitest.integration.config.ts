import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.integration.test.ts'],
    globalSetup: ['./test/setup-db-env.ts'],
  },
});
