import { EMPTY_DASHBOARD_HEADLINE } from '../support/dashboard';
import { expect, test } from '../support/fixtures';
import { BrunchWizard } from '../support/wizard';

// Spec 0011 (design fidelity), the creation wizard (M4), journey P8: every step says where you
// are and what it is, the footer leaves on the first step and goes back on the others, Cancel
// leaves without saving, and a phone leaves the top Cancel out and draws bigger step icons. The
// wizard's behavior (what it keeps, what it creates) is covered by C1, C2 and R1.

test.describe('P8 — the creation wizard', () => {
  test('each step has its heading and helper line, and Back and Continue move between them keeping what was typed', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const { page } = host;
    await page.setViewportSize({ width: 1280, height: 900 });
    const wizard = new BrunchWizard(page);
    await wizard.open();

    const heading = (name: string) => page.getByRole('heading', { level: 2, name, exact: true });
    const progress = page.getByRole('progressbar', { name: 'Brunch planning progress' });

    // Step 1: a name. The footer leaves (there is nothing to go back to).
    await expect(page.getByText('Step 1 of 4 · A name everyone will see')).toBeVisible();
    await expect(heading('Give it a name')).toBeVisible();
    await expect(
      page.getByText('Keep it casual — "Sunday catch-up" works just fine.'),
    ).toBeVisible();
    await expect(progress).toHaveAttribute('aria-valuetext', 'Step 1 of 4: Title');
    await expect(page.getByRole('button', { name: 'Back', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Cancel' })).toHaveCount(2); // top and footer
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
    // a person is told which field they may leave empty
    await expect(page.getByLabel('Description · optional')).toBeVisible();
    await expect(page.getByLabel('Title · optional')).toHaveCount(0);

    await page.getByLabel('Title').fill('Typed Title');
    await wizard.next();

    // Steps 2 and 3: a heading each, and Back appears.
    await expect(page.getByText('Step 2 of 4 · Pick one — or a few to vote on')).toBeVisible();
    await expect(heading('Pick a spot')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Cancel' })).toHaveCount(1); // the top one only
    await wizard.next();
    await expect(page.getByText('Step 3 of 4 · Same logic — one or several')).toBeVisible();
    await expect(heading('Pick a time')).toBeVisible();
    await wizard.next();

    // Step 4: the last, with its own button.
    await expect(page.getByText('Step 4 of 4 · Last step!')).toBeVisible();
    await expect(heading('Round up the crew')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Brunch' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toHaveCount(0);

    // Back all the way: what was typed is still there.
    await wizard.back();
    await wizard.back();
    await wizard.back();
    await expect(heading('Give it a name')).toBeVisible();
    await expect(page.getByLabel('Title')).toHaveValue('Typed Title');
  });

  test('Cancel, at the top or in the footer of the first step, leaves without creating anything', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const { page } = host;
    await page.setViewportSize({ width: 1280, height: 900 });

    for (const which of ['top', 'footer'] as const) {
      const wizard = new BrunchWizard(page);
      await wizard.open();
      await page.getByLabel('Title').fill(`Never Made (${which})`);
      const cancel = page.getByRole('link', { name: 'Cancel' });
      await (which === 'top' ? cancel.first() : cancel.last()).click();

      await expect(page).toHaveURL('/dashboard');
      await expect(page.getByText(EMPTY_DASHBOARD_HEADLINE)).toBeVisible();
      await expect(page.getByText(`Never Made (${which})`)).toHaveCount(0);
    }
  });

  test('on a phone: the top Cancel is left out, the step icons are 48px, and nothing scrolls sideways', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const { page } = host;
    await page.setViewportSize({ width: 390, height: 844 });
    const wizard = new BrunchWizard(page);
    await wizard.open();

    // one way out is enough on a phone: the footer's
    await expect(page.getByRole('link', { name: 'Cancel' })).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Cancel' })).toBeVisible();

    const plate = await page
      .getByRole('progressbar')
      .locator('svg')
      .first()
      .evaluate((icon) => icon.parentElement?.getBoundingClientRect().width ?? 0);
    expect(plate, 'the first step icon is a 48px plate on a phone').toBeGreaterThanOrEqual(47);

    await page.getByLabel('Title').fill('Phone Brunch');
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeInViewport();
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth, 'the wizard scrolls sideways').toBeLessThanOrEqual(clientWidth);
  });
});
