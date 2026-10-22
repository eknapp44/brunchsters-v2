import { EMPTY_DASHBOARD_HEADLINE } from '../support/dashboard';
import type { Page } from '@playwright/test';
import { createBrunch } from '../support/factories';
import { expect, test } from '../support/fixtures';
import { fixturePlaces } from '../support/places';
import { createConfirmedBrunch, createVotingBrunch, inviteNewcomer } from '../support/showcase';
import { BrunchWizard } from '../support/wizard';

// Journey D3 (spec 0009): every screen fits the screen it is on. This file runs in two
// projects: `chromium` (a desktop window) and `mobile` (an emulated phone), so the same pages
// are checked at both sizes. Behavior is not asserted here; the other journeys do that.

// A page that scrolls sideways is wider than its screen: something does not reflow.
async function expectNoSidewaysScroll(page: Page, what: string): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    scrollWidth,
    `${what} scrolls sideways: ${scrollWidth}px of content in a ${clientWidth}px window`,
  ).toBeLessThanOrEqual(clientWidth);
}

test.describe('D3 — every screen fits and shows its one action', () => {
  test('the signed-out pages', async ({ page, makeActor }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeInViewport();
    await expectNoSidewaysScroll(page, 'the landing page');

    await page.goto('/sign-in');
    await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeInViewport();
    await expectNoSidewaysScroll(page, 'the sign-in page');

    const host = await makeActor('host');
    const brunchId = await createBrunch({
      host: host.user,
      title: 'A Brunch With A Rather Long Name To See It Wrap',
    });
    await page.goto(await inviteNewcomer({ host, brunchId }));
    await expect(page.getByRole('link', { name: 'Sign in with Google' })).toBeInViewport();
    await expectNoSidewaysScroll(page, 'the invite preview');

    await page.goto('/invite/not-a-real-token');
    await expect(page.getByRole('heading', { name: 'Invite not found' })).toBeVisible();
    await expectNoSidewaysScroll(page, 'the invalid invite page');
  });

  test('the dashboard, empty and full', async ({ makeActor }) => {
    const host = await makeActor('host');
    await host.page.goto('/dashboard');
    await expect(host.page.getByText(EMPTY_DASHBOARD_HEADLINE)).toBeVisible();
    await expect(host.page.getByRole('link', { name: 'Plan a Brunch' })).toBeInViewport();
    await expectNoSidewaysScroll(host.page, 'the empty dashboard');

    const yes = await makeActor('yes');
    const maybe = await makeActor('maybe');
    const pending = await makeActor('pending');
    await createBrunch({ host: host.user, title: 'Draft Brunch' });
    await createVotingBrunch({ host, guests: { yes, maybe, pending } });
    await createConfirmedBrunch({ host, guest: yes });
    await host.page.goto('/dashboard');
    await expect(host.page.getByRole('heading', { name: 'Upcoming' })).toBeVisible();
    await expect(host.page.getByRole('link', { name: 'Plan a Brunch' })).toBeInViewport();
    await expectNoSidewaysScroll(host.page, 'the dashboard');
  });

  test('the creation wizard, every step', async ({ makeActor }) => {
    const host = await makeActor('host');
    const wizard = new BrunchWizard(host.page);
    const next = host.page.getByRole('button', { name: 'Continue', exact: true });

    await wizard.open();
    await host.page
      .getByLabel('Title')
      .fill('A Wizard Brunch With A Title Long Enough To Wrap Around');
    await expect(next).toBeInViewport();
    await expectNoSidewaysScroll(host.page, 'wizard step 1');
    await wizard.next();

    await wizard.addPlace(fixturePlaces.sunnySide);
    await wizard.addPlace(fixturePlaces.harborBistro);
    await expect(next).toBeInViewport();
    await expectNoSidewaysScroll(host.page, 'wizard step 2');
    await wizard.next();

    await wizard.addTime(10);
    await wizard.addTime(11);
    await expect(next).toBeInViewport();
    await expectNoSidewaysScroll(host.page, 'wizard step 3');
    await wizard.next();

    await wizard.addEmail('a-friend-with-a-fairly-long-address@example.com');
    await expect(host.page.getByRole('button', { name: 'Create Brunch' })).toBeInViewport();
    await expectNoSidewaysScroll(host.page, 'wizard step 4');
  });

  test('the brunch page and the manage page', async ({ makeActor }) => {
    const host = await makeActor('host');
    const yes = await makeActor('yes');
    const maybe = await makeActor('maybe');
    const pending = await makeActor('pending');
    const voting = await createVotingBrunch({ host, guests: { yes, maybe, pending } });
    const detail = `/brunch/${voting.brunchId}`;

    await host.page.goto(detail);
    await expect(host.page.getByRole('heading', { name: voting.title })).toBeVisible();
    await expect(host.page.getByRole('button', { name: "I'm in", exact: true })).toBeInViewport();
    await expectNoSidewaysScroll(host.page, 'the brunch page (host)');

    await yes.page.goto(detail);
    await expect(yes.page.getByRole('button', { name: "I'm in", exact: true })).toBeInViewport();
    await expectNoSidewaysScroll(yes.page, 'the brunch page (invitee)');

    await host.page.goto(`${detail}/manage`);
    await expect(host.page.getByRole('heading', { name: 'Confirm', exact: true })).toBeVisible();
    await expectNoSidewaysScroll(host.page, 'the manage page');

    const draftId = await createBrunch({ host: host.user, title: 'Draft To Manage' });
    await host.page.goto(`/brunch/${draftId}/manage`);
    await expect(host.page.getByRole('heading', { name: 'Send an invite first' })).toBeVisible();
    await expectNoSidewaysScroll(host.page, 'the manage page (draft)');
  });
});

test.describe('D3 — a touch screen gets touch-sized controls', () => {
  test('buttons and text fields are at least 44px tall', async ({ makeActor, isMobile }) => {
    test.skip(!isMobile, 'touch targets are a phone concern');
    const host = await makeActor('host');
    const yes = await makeActor('yes');
    const maybe = await makeActor('maybe');
    const pending = await makeActor('pending');
    const voting = await createVotingBrunch({ host, guests: { yes, maybe, pending } });

    const pages = [
      '/dashboard',
      '/brunch/new',
      `/brunch/${voting.brunchId}`,
      `/brunch/${voting.brunchId}/manage`,
    ];
    for (const url of pages) {
      await host.page.goto(url);
      await expect(host.page.getByRole('heading').first()).toBeVisible();
      const tooSmall = await host.page.evaluate(() =>
        Array.from(
          document.querySelectorAll<HTMLElement>(
            'button, input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), textarea, select',
          ),
        )
          .filter((element) => element.getClientRects().length > 0)
          .map((element) => ({
            name: (element.textContent ?? element.getAttribute('aria-label') ?? element.tagName)
              .trim()
              .slice(0, 40),
            height: Math.round(element.getBoundingClientRect().height),
          }))
          .filter((element) => element.height < 44),
      );
      expect(tooSmall, `controls under 44px tall on ${url}`).toEqual([]);
    }
  });
});

test.describe('D3 — a wide window uses its width', () => {
  test('two columns from 60rem up, one column below, and never a sideways scroll', async ({
    makeActor,
    isMobile,
  }) => {
    test.skip(isMobile, 'window sizes are a desktop concern');
    const host = await makeActor('host');
    const yes = await makeActor('yes');
    const maybe = await makeActor('maybe');
    const pending = await makeActor('pending');
    const voting = await createVotingBrunch({ host, guests: { yes, maybe, pending } });
    const detail = `/brunch/${voting.brunchId}`;
    const { page } = host;

    async function x(headingName: string): Promise<number> {
      const box = await page.getByRole('heading', { name: headingName, exact: true }).boundingBox();
      if (box === null) throw new Error(`No heading "${headingName}" on screen`);
      return box.x;
    }

    for (const width of [1440, 1280, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(detail);
      await expect(page.getByRole('heading', { name: 'Invites', exact: true })).toBeVisible();
      expect(await x('Invites'), `Invites sit beside Where to? at ${width}px`).toBeGreaterThan(
        (await x('Where to?')) + 250,
      );
      await expectNoSidewaysScroll(page, `the brunch page at ${width}px`);

      await page.goto(`${detail}/manage`);
      await expect(page.getByRole('heading', { name: 'Confirm', exact: true })).toBeVisible();
      expect(await x('Voting'), `Voting sits beside Locations at ${width}px`).toBeGreaterThan(
        (await x('Locations')) + 250,
      );
      await expectNoSidewaysScroll(page, `the manage page at ${width}px`);
    }

    for (const width of [900, 768]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(detail);
      await expect(page.getByRole('heading', { name: 'Invites', exact: true })).toBeVisible();
      expect(await x('Invites'), `Invites stack under Where to? at ${width}px`).toBe(
        await x('Where to?'),
      );
      await expectNoSidewaysScroll(page, `the brunch page at ${width}px`);
    }
  });
});
