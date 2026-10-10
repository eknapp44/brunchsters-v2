import { defineConfig, devices } from '@playwright/test';
import { baseUrl, E2E_AUTH_SECRET, E2E_PORT, getE2eDatabaseUrl } from './e2e/support/env';

const isCi = process.env.CI !== undefined && process.env.CI !== '';
const databaseUrl = getE2eDatabaseUrl();

export default defineConfig({
  testDir: './e2e/journeys',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: isCi,
  // One retry in CI only; a test that needs it to pass gets investigated, not muted.
  retries: isCi ? 1 : 0,
  reporter: isCi
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: { baseURL: baseUrl, trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // CI builds first (see ci.yml) and serves the build; locally dev mode is faster.
    command: isCi
      ? `pnpm exec next start -p ${E2E_PORT}`
      : `pnpm exec next dev --turbopack -p ${E2E_PORT}`,
    url: baseUrl,
    // Never attach to a server we did not start: apps/web/.env.local points at the dev database.
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL: databaseUrl,
      DIRECT_URL: databaseUrl,
      AUTH_URL: baseUrl,
      AUTH_SECRET: E2E_AUTH_SECRET,
      // auth.ts refuses to boot without these; no Google call is ever made.
      GOOGLE_CLIENT_ID: 'e2e-placeholder-client-id',
      GOOGLE_CLIENT_SECRET: 'e2e-placeholder-client-secret',
    },
  },
});
