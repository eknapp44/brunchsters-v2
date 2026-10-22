import { LANDING_HEADING, SIGN_IN_HEADING } from '../support/pages';
import { EMPTY_DASHBOARD_HEADLINE, expectDashboard } from '../support/dashboard';
import { expect, test } from '../support/fixtures';

// Journeys A1 and A2 (spec 0006 inventory; source: spec 0002).

test.describe('A1 — signed-out access', () => {
  test('a protected page redirects to sign-in and remembers where the visitor was going', async ({
    page,
  }) => {
    await page.goto('/dashboard');

    await expect(page).toHaveURL(/\/sign-in\?callbackUrl=%2Fdashboard$/);
    await expect(page.getByRole('heading', { name: SIGN_IN_HEADING })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  });

  test('a protected API route answers 401 rather than redirecting', async ({ request }) => {
    const response = await request.get('/api/v1/places/search?q=cafe', { maxRedirects: 0 });

    expect(response.status()).toBe(401);
  });

  test('the landing page and sign-in page stay public', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: LANDING_HEADING })).toBeVisible();

    await page.goto('/sign-in');
    await expect(page).toHaveURL('/sign-in');
    await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  });
});

test.describe('A2 — signed-in session', () => {
  test('lands on the dashboard with name and avatar, and sign-out ends the session', async ({
    makeActor,
  }) => {
    const { user, page } = await makeActor('member');

    await page.goto('/dashboard');
    await expectDashboard(page);
    await expect(page.getByText(user.name)).toBeVisible();
    await expect(page.getByRole('img', { name: user.name })).toBeVisible();
    await expect(page.getByText(EMPTY_DASHBOARD_HEADLINE)).toBeVisible();

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/sign-in\?callbackUrl=%2Fdashboard$/);
  });
});
