import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

// WCAG 2.0 and 2.1, levels A and AA: the bar the design's accessibility pass set (spec 0009).
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

export type ColorScheme = 'light' | 'dark';
export const COLOR_SCHEMES: readonly ColorScheme[] = ['light', 'dark'];

// Call before navigating: the page then renders with the operating-system setting the app
// follows (ADR 0010), so contrast is checked in the palette that is actually showing.
export async function useColorScheme(page: Page, scheme: ColorScheme): Promise<void> {
  await page.emulateMedia({ colorScheme: scheme });
}

// Fails with one readable line per offending element instead of axe's raw object, so a
// failure says which rule broke, where, and why.
export async function expectNoA11yViolations(page: Page, context: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    // The Next.js dev overlay is not part of the app; CI scans a production build without it.
    .exclude('nextjs-portal')
    .analyze();

  const report = results.violations.flatMap((violation) =>
    violation.nodes.map(
      (node) =>
        `${violation.id} (${violation.impact ?? 'n/a'}) at ${node.target.join(' ')}: ${node.failureSummary?.replace(/\s+/g, ' ') ?? violation.help}`,
    ),
  );

  expect(report, `axe found accessibility violations on ${context}`).toEqual([]);
}
