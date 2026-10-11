import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { baseUrl, E2E_AUTH_SECRET, E2E_PORT, getE2eDatabaseUrl } from './e2e/support/env';

const isCi = process.env.CI !== undefined && process.env.CI !== '';
const databaseUrl = getE2eDatabaseUrl();
// Fixed, not per-process: this config is also loaded by every test worker, and the server
// and the workers must agree on where emails land. M4's global setup empties it each run.
const e2eOutboxDir = path.join(os.tmpdir(), 'brunchsters-e2e-mail');

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
  use: {
    baseURL: baseUrl,
    trace: 'on-first-retry',
    // Pinned so rendered dates don't depend on the machine running the suite. Chicago is
    // deliberate: two of the fixture places are in other zones, which the timezone journey needs.
    locale: 'en-US',
    timezoneId: 'America/Chicago',
  },
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
      // Empty (not absent) so .env.local's real key cannot leak in: a Places request that is
      // not intercepted in the browser fails with 502 instead of calling Google.
      GOOGLE_PLACES_API_KEY: '',
      // Same reason, for spec 0008: .env.local carries the developer's real Resend and
      // Inngest keys, and the e2e server must never email anyone or queue to Inngest Cloud.
      // Blank keys select the no-op bus and the file outbox (lib/serverConfig.ts).
      RESEND_API_KEY: '',
      INNGEST_EVENT_KEY: '',
      INNGEST_SIGNING_KEY: '',
      INNGEST_DEV: '',
      EMAIL_OUTBOX_DIR: e2eOutboxDir,
    },
  },
});
