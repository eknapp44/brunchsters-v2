import path from 'node:path';
import type { Page, TestInfo } from '@playwright/test';
import { COLOR_SCHEMES, useColorScheme } from './a11y';
import { E2E_SCREENSHOT_DIR } from './env';

// Saves the current page in both palettes as <name>-<light|dark>-<project>.png under
// .screenshots/app/, where the name is "<area>/<state>" (a folder per area) and the project is
// the device ("desktop", "tablet" or "phone"). For looking at, not for comparing against:
// there are no baselines (spec 0009).
export async function captureReviewShots(
  page: Page,
  name: string,
  testInfo: TestInfo,
): Promise<void> {
  for (const scheme of COLOR_SCHEMES) {
    await useColorScheme(page, scheme);
    // The Next.js dev badge is not part of the app and would sit on top of the page.
    // Switching palettes would otherwise be photographed mid-fade (buttons animate their color).
    await page.addStyleTag({
      content:
        'nextjs-portal { display: none !important; } *, *::before, *::after { transition: none !important; }',
    });
    // Web fonts are part of the look; do not photograph the fallback.
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: path.join(E2E_SCREENSHOT_DIR, `${name}-${scheme}-${testInfo.project.name}.png`),
      fullPage: true,
    });
  }
}
