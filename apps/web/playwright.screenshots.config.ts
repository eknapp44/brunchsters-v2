import { defineConfig, devices } from '@playwright/test';
import baseConfig from './playwright.config';

// The review screenshots (spec 0009). Same server, database and queue as the e2e suite, but
// only e2e/screenshots, on a desktop, a tablet and a phone-sized screen, and no traces or HTML report.
export default defineConfig({
  ...baseConfig,
  testDir: './e2e/screenshots',
  reporter: [['list']],
  retries: 0,
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    // below the 60rem breakpoint where the two-column layout starts
    {
      name: 'tablet',
      use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 } },
    },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
});
