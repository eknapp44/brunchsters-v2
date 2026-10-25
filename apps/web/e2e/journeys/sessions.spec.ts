import { EMPTY_DASHBOARD_HEADLINE, expectDashboard } from '../support/dashboard';
import { createBrunch, createUser } from '../support/factories';
import { expect, test } from '../support/fixtures';
import { SIGN_IN_WAY_BACK } from '../support/pages';
import { mintSessionCookie } from '../support/session';

// Spec 0002 "Returning user": a session that has expired (or is not valid) is treated as
// signed out, and signing back in returns you to where you were going.

test.describe('sessions that stop working', () => {
  test('a tampered session is signed out; signing back in returns to the original page', async ({
    browser,
  }) => {
    const user = await createUser({ label: 'member' });
    const brunchId = await createBrunch({ host: user, title: 'Where I Was Going' });
    const context = await browser.newContext();
    const page = await context.newPage();
    const cookie = await mintSessionCookie(user);
    // Same cookie, last characters altered: its signature no longer matches.
    await context.addCookies([{ ...cookie, value: `${cookie.value.slice(0, -4)}AAAA` }]);

    await page.goto(`/brunch/${brunchId}`);

    // Treated as a stranger: sent to sign in, with the destination remembered.
    await expect(page).toHaveURL(
      `/sign-in?callbackUrl=${encodeURIComponent(`/brunch/${brunchId}`)}`,
    );
    const api = await context.request.get('/api/v1/places/search?q=cafe', { maxRedirects: 0 });
    expect(api.status()).toBe(401);

    // It says it will bring them back, because it will.
    await expect(page.getByText(SIGN_IN_WAY_BACK)).toBeVisible();

    // Google's screen cannot be driven (ADR 0007): resume as a completed sign-in would.
    await context.clearCookies();
    await context.addCookies([await mintSessionCookie(user)]);
    const destination = new URL(page.url()).searchParams.get('callbackUrl') ?? '/dashboard';
    await page.goto(destination);

    await expect(page).toHaveURL(`/brunch/${brunchId}`);
    await expect(page.getByRole('heading', { name: 'Where I Was Going' })).toBeVisible();
    await context.close();
  });

  test('an expired session is signed out the same way', async ({ browser }) => {
    const user = await createUser({ label: 'member' });
    const context = await browser.newContext();
    const page = await context.newPage();
    await context.addCookies([await mintSessionCookie(user, { maxAgeSeconds: -60 })]);

    await page.goto('/dashboard');

    await expect(page).toHaveURL(`/sign-in?callbackUrl=${encodeURIComponent('/dashboard')}`);
    // Going back to the dashboard is where everyone goes: nothing to promise.
    await expect(page.getByText(SIGN_IN_WAY_BACK)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
    await context.close();
  });

  test('a session for a user that no longer exists cannot read anything', async ({ browser }) => {
    // Valid signature, but the account behind it is gone (here: never existed in this database).
    const ghost = {
      id: '00000000-0000-4000-8000-0000000000aa',
      email: 'ghost@example.com',
      name: 'Ghost',
      avatarUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
    } as Parameters<typeof mintSessionCookie>[0];
    const context = await browser.newContext();
    const page = await context.newPage();
    await context.addCookies([await mintSessionCookie(ghost)]);

    await page.goto('/dashboard');

    // Whatever it shows, it must not show someone else's brunches or crash the page.
    await expectDashboard(page);
    await expect(page.getByText(EMPTY_DASHBOARD_HEADLINE)).toBeVisible();
    const brunches = await context.request.get(
      '/api/v1/brunches/00000000-0000-4000-8000-000000000000/votes/locations',
      { maxRedirects: 0 },
    );
    expect(brunches.status()).toBeGreaterThanOrEqual(400);
    await context.close();
  });
});
