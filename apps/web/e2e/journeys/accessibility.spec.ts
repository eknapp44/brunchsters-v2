import { COLOR_SCHEMES, expectNoA11yViolations, useColorScheme } from '../support/a11y';
import { createBrunch } from '../support/factories';
import { expect, test } from '../support/fixtures';
import { createConfirmedBrunch, createVotingBrunch, inviteNewcomer } from '../support/showcase';

// Journeys D1 and D2 (spec 0009): axe (WCAG 2.0/2.1 A and AA) on every screen, in the light
// and the dark palette. Each styling milestone adds the screens it restyles.

for (const scheme of COLOR_SCHEMES) {
  test.describe(`D1 — signed-out pages (${scheme})`, () => {
    test.beforeEach(async ({ page }) => {
      await useColorScheme(page, scheme);
    });

    test('the landing page and the sign-in page', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Brunchsters' })).toBeVisible();
      await expectNoA11yViolations(page, `/ (${scheme})`);

      await page.goto('/sign-in');
      await expect(page.getByRole('heading', { name: 'Sign in to Brunchsters' })).toBeVisible();
      await expectNoA11yViolations(page, `/sign-in (${scheme})`);
    });

    test('an invite page, valid and invalid', async ({ page, makeActor }) => {
      const host = await makeActor('host');
      const title = 'Accessible Brunch';
      const brunchId = await createBrunch({ host: host.user, title });
      const link = await inviteNewcomer({ host, brunchId });

      await page.goto(link);
      await expect(page.getByRole('heading', { name: `You're invited to ${title}` })).toBeVisible();
      await expectNoA11yViolations(page, `invite preview (${scheme})`);

      await page.goto('/invite/not-a-real-token');
      await expect(page.getByRole('heading', { name: 'Invite not found' })).toBeVisible();
      await expectNoA11yViolations(page, `invalid invite (${scheme})`);
    });
  });

  test.describe(`D2 — signed-in screens (${scheme})`, () => {
    test('the dashboard, empty and with brunches in every state', async ({ makeActor }) => {
      const host = await makeActor('host');
      await useColorScheme(host.page, scheme);

      await host.page.goto('/dashboard');
      await expect(host.page.getByText('No brunches yet.')).toBeVisible();
      await expectNoA11yViolations(host.page, `empty dashboard (${scheme})`);

      const yes = await makeActor('yes');
      const maybe = await makeActor('maybe');
      const pending = await makeActor('pending');
      await createBrunch({ host: host.user, title: 'A Draft Brunch' });
      await createVotingBrunch({ host, guests: { yes, maybe, pending } });
      await createConfirmedBrunch({ host, guest: yes });

      await host.page.goto('/dashboard');
      await expect(host.page.getByRole('heading', { name: 'Upcoming' })).toBeVisible();
      await expect(host.page.getByRole('link', { name: 'A Draft Brunch' })).toBeVisible();
      await expectNoA11yViolations(host.page, `dashboard with brunches (${scheme})`);
    });
  });
}

// D1/D2 (shell) and D4 (skip link, first slice; the rest of D4 arrives in M7): the bar across
// the top is the same on every page, so it is checked once here and scanned by axe with every
// page above.
test.describe('the app shell', () => {
  test('signed out: the wordmark goes to the landing page and there is no Sign out', async ({
    page,
  }) => {
    await page.goto('/sign-in');
    const home = page.getByRole('link', { name: 'brunchsters' });
    await expect(home).toHaveAttribute('href', '/');
    await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
    await home.click();
    await expect(page).toHaveURL('/');
  });

  test('signed in: the wordmark goes to the dashboard, with the picture, name and Sign out', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    await host.page.goto('/dashboard');
    await expect(host.page.getByRole('link', { name: 'brunchsters' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
    await expect(host.page.getByRole('img', { name: host.user.name })).toBeVisible();
    await expect(host.page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  });

  test('the landing page has one action: Sign in when signed out, Go to dashboard when signed in', async ({
    page,
    makeActor,
  }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL('/sign-in');

    const host = await makeActor('host');
    await host.page.goto('/');
    await expect(host.page.getByRole('link', { name: 'Sign in', exact: true })).toHaveCount(0);
    await host.page.getByRole('link', { name: 'Go to dashboard' }).click();
    await expect(host.page).toHaveURL('/dashboard');
  });

  test('D4 — the skip link is the first stop, appears when focused, and moves to the page', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    await host.page.goto('/dashboard');

    await host.page.keyboard.press('Tab');
    const skip = host.page.getByRole('link', { name: 'Skip to main content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();

    await host.page.keyboard.press('Enter');
    await expect(host.page).toHaveURL(/#main-content$/);
    await expect(host.page.locator('#main-content')).toBeFocused();
  });
});
