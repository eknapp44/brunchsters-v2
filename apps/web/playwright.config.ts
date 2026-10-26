import { defineConfig, devices } from '@playwright/test';
import {
  baseUrl,
  E2E_AUTH_SECRET,
  E2E_INNGEST_PORT,
  E2E_INNGEST_URL,
  E2E_OUTBOX_DIR,
  E2E_PORT,
  getE2eDatabaseUrl,
  INNGEST_CLI_VERSION,
} from './e2e/support/env';

const isCi = process.env.CI !== undefined && process.env.CI !== '';
const databaseUrl = getE2eDatabaseUrl();

export default defineConfig({
  testDir: './e2e/journeys',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  // Locally the default is half the cores (12 on a 24-thread machine), all driving ONE `next dev`
  // process that compiles each route on first use. That process is the limit: 4 and 6 workers finish
  // the suite in the same time (198s, 238 passed), while 12 made ordinary journeys take 20 to 40
  // seconds, tripped timeouts, and used enough memory to be stopped once. So local runs use 4 (the
  // stress run already did). CI serves a production build and keeps Playwright's default.
  ...(isCi ? {} : { workers: 4 }),
  forbidOnly: isCi,
  // One retry in CI only; a test that needs it to pass gets investigated, not muted.
  retries: isCi ? 1 : 0,
  // `next dev` compiles on demand and now also serves the queue's callbacks from the same single
  // process, so assertions get longer to settle locally. CI serves a production build and keeps
  // Playwright's strict 5 seconds, which is the gate.
  expect: { timeout: isCi ? 5_000 : 15_000 },
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
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      // An emulated phone (spec 0009, journey D3): the core journeys again at a phone width and
      // with touch, plus the layout checks. A chosen subset, not the whole suite: the rest is
      // about rules and data, which a screen size does not change.
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      testMatch: [
        '**/responsive-layout.spec.ts',
        '**/auth.spec.ts',
        '**/access-and-dashboard.spec.ts',
        '**/create-brunch.spec.ts',
        '**/invitations-invitee.spec.ts',
        '**/voting.spec.ts',
        '**/confirm.spec.ts',
        '**/design-fidelity.spec.ts',
        '**/brunch-page.spec.ts',
        '**/feedback.spec.ts',
        '**/notifications.spec.ts',
        '**/notification-settings.spec.ts',
        '**/wizard-page.spec.ts',
        '**/front-door.spec.ts',
      ],
    },
  ],
  webServer: [
    {
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
        // A blank Resend key selects the file outbox the tests read; INNGEST_DEV points the app at
        // the local Inngest dev server below, and blank cloud keys keep it out of Inngest Cloud.
        RESEND_API_KEY: '',
        INNGEST_EVENT_KEY: '',
        INNGEST_SIGNING_KEY: '',
        INNGEST_DEV: E2E_INNGEST_URL,
        EMAIL_OUTBOX_DIR: E2E_OUTBOX_DIR,
        // The server runs in UTC, as Vercel does, while the browser context below is America/Chicago:
        // anything the server renders in its own zone differs from what the browser renders, which
        // React reports as a hydration mismatch and answers by rebuilding the page, wiping what a
        // person typed early (journey H8). On a developer machine in the browser's own zone that
        // never showed; this makes every run, locally and in CI, the way production is.
        TZ: 'UTC',
      },
    },
    {
      // The real queue (ADR 0009). Listed after the app so the app is already serving
      // /api/inngest when this starts and syncs with it; global-setup then waits for the
      // sync to finish before any test runs.
      command: `npx --yes inngest-cli@${INNGEST_CLI_VERSION} dev --log-level warn --no-discovery --no-poll -u ${baseUrl}/api/inngest --port ${E2E_INNGEST_PORT} --connect-gateway-port ${E2E_INNGEST_PORT + 1} --connect-gateway-grpc-port 50152 --connect-executor-grpc-port 50153`,
      url: E2E_INNGEST_URL,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
