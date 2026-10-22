import { LANDING_HEADING } from '../support/pages';
import { expect, test } from '@playwright/test';

test('the e2e server boots and serves the public landing page', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: LANDING_HEADING })).toBeVisible();
});
