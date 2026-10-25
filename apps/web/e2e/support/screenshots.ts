import path from 'node:path';
import type { Locator, Page, TestInfo } from '@playwright/test';
import { COLOR_SCHEMES, type ColorScheme, useColorScheme } from './a11y';
import { E2E_SCREENSHOT_DIR } from './env';

// `pnpm shots:spec` (scripts/specShots.mjs) names the few shots a spec keeps, and where. They are
// saved again as small JPEGs for the spec's folder (one screenful, scrolled to `focus` when given:
// a record of the moment, not the whole page, so the folder stays small); everything else stays in
// the git-ignored set.
function curatedTarget(name: string, device: string, scheme: ColorScheme): string | undefined {
  const dir = process.env.SPEC_SHOTS_DIR;
  if (dir === undefined || dir === '') return undefined;
  const variants = (
    JSON.parse(process.env.SPEC_SHOTS_VARIANTS ?? '{}') as Record<string, string[]>
  )[name];
  if (variants === undefined || !variants.includes(`${device}-${scheme}`)) return undefined;
  return path.join(dir, `${name.replace('/', '-')}-${scheme}-${device}.jpg`);
}

// Saves the current page in both palettes as <name>-<light|dark>-<project>.png under
// .screenshots/app/, where the name is "<area>/<state>" (a folder per area) and the project is
// the device ("desktop", "tablet" or "phone"). For looking at, not for comparing against:
// there are no baselines (spec 0009).
export async function captureReviewShots(
  page: Page,
  name: string,
  testInfo: TestInfo,
  options?: { readonly focus?: Locator },
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
    const curated = curatedTarget(name, testInfo.project.name, scheme);
    if (curated !== undefined) {
      await options?.focus?.evaluate((element) => element.scrollIntoView({ block: 'center' }));
      await page.screenshot({ path: curated, type: 'jpeg', quality: 60 });
    }
  }
}
