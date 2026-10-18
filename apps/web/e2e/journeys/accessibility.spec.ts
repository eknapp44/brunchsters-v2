import { COLOR_SCHEMES, expectNoA11yViolations, useColorScheme } from '../support/a11y';
import { createBrunch } from '../support/factories';
import { expect, test } from '../support/fixtures';
import { fixturePlaces } from '../support/places';
import { createConfirmedBrunch, createVotingBrunch, inviteNewcomer } from '../support/showcase';
import { daysFromNow, toDatetimeLocalValue } from '../support/time';
import { addAttendee, closeVoting } from '../support/voting';
import { BrunchWizard } from '../support/wizard';

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

    test('the brunch detail page, as host and as invitee, in every state', async ({
      makeActor,
    }) => {
      const host = await makeActor('host');
      const yes = await makeActor('yes');
      const maybe = await makeActor('maybe');
      const pending = await makeActor('pending');
      for (const actor of [host, yes, maybe]) await useColorScheme(actor.page, scheme);

      const voting = await createVotingBrunch({ host, guests: { yes, maybe, pending } });
      const detail = `/brunch/${voting.brunchId}`;

      await host.page.goto(detail);
      await expect(host.page.getByRole('heading', { name: voting.title })).toBeVisible();
      await expectNoA11yViolations(host.page, `detail, host, voting open (${scheme})`);

      await yes.page.goto(detail);
      await expect(yes.page.getByRole('checkbox').first()).toBeEnabled();
      await expectNoA11yViolations(yes.page, `detail, invitee who voted (${scheme})`);

      await maybe.page.goto(detail);
      await expect(maybe.page.getByText('Current: maybe')).toBeVisible();
      await expectNoA11yViolations(maybe.page, `detail, invitee who said maybe (${scheme})`);

      await closeVoting({ brunchId: voting.brunchId, host: host.user });
      await yes.page.goto(detail);
      await expect(yes.page.getByText('Voting is closed.').first()).toBeVisible();
      await expectNoA11yViolations(yes.page, `detail, voting closed (${scheme})`);

      const confirmed = await createConfirmedBrunch({ host, guest: yes });
      await host.page.goto(`/brunch/${confirmed.brunchId}`);
      await expect(host.page.getByText('Confirmed', { exact: true })).toBeVisible();
      await expectNoA11yViolations(host.page, `detail, host, confirmed (${scheme})`);
      await yes.page.goto(`/brunch/${confirmed.brunchId}`);
      await expectNoA11yViolations(yes.page, `detail, invitee, confirmed (${scheme})`);
    });

    test('the host manage page, in every state', async ({ makeActor }) => {
      const host = await makeActor('host');
      const yes = await makeActor('yes');
      const maybe = await makeActor('maybe');
      const pending = await makeActor('pending');
      const suggester = await makeActor('suggester');
      await useColorScheme(host.page, scheme);

      // a draft brunch: nobody invited yet, so the controls are shown but disabled
      const draftId = await createBrunch({ host: host.user, title: 'Draft To Manage' });
      await host.page.goto(`/brunch/${draftId}/manage`);
      await expect(host.page.getByRole('heading', { name: 'Send an invite first' })).toBeVisible();
      await expectNoA11yViolations(host.page, `manage, draft (${scheme})`);

      // voting open, with a suggested place and a suggested time waiting for the host
      const voting = await createVotingBrunch({ host, guests: { yes, maybe, pending } });
      await addAttendee({
        brunchId: voting.brunchId,
        host: host.user,
        user: suggester.user,
        response: 'yes',
      });
      await suggester.page.goto(`/brunch/${voting.brunchId}`);
      await suggester.page.getByRole('textbox', { name: 'Search for a place' }).fill('pacific');
      await suggester.page
        .getByRole('button', {
          name: `${fixturePlaces.pacificBrunchHouse.name} — ${fixturePlaces.pacificBrunchHouse.address}`,
        })
        .click();
      await suggester.page
        .getByLabel('Suggested date and time')
        .fill(toDatetimeLocalValue(daysFromNow(12)));
      await suggester.page.getByRole('button', { name: 'Suggest this time' }).click();
      await expect(suggester.page.getByText('(awaiting host approval)')).toHaveCount(2);

      await host.page.goto(`/brunch/${voting.brunchId}/manage`);
      await expect(host.page.getByRole('heading', { name: 'Pending Suggestions' })).toBeVisible();
      await expectNoA11yViolations(host.page, `manage, voting open with suggestions (${scheme})`);

      await closeVoting({ brunchId: voting.brunchId, host: host.user });
      await host.page.goto(`/brunch/${voting.brunchId}/manage`);
      await expect(host.page.getByText('Voting is closed.')).toBeVisible();
      await expectNoA11yViolations(host.page, `manage, voting closed (${scheme})`);

      const confirmed = await createConfirmedBrunch({ host, guest: yes });
      await host.page.goto(`/brunch/${confirmed.brunchId}/manage`);
      await expect(
        host.page.getByRole('heading', { name: 'Confirmed', exact: true }),
      ).toBeVisible();
      await expectNoA11yViolations(host.page, `manage, confirmed (${scheme})`);
    });

    test('the not-found page, which anyone who may not see a brunch gets', async ({
      makeActor,
    }) => {
      const host = await makeActor('host');
      const stranger = await makeActor('stranger');
      await useColorScheme(stranger.page, scheme);
      const brunchId = await createBrunch({ host: host.user, title: 'Not For Strangers' });
      await stranger.page.goto(`/brunch/${brunchId}`);
      await expect(stranger.page.getByText('This page could not be found.')).toBeVisible();
      await expectNoA11yViolations(stranger.page, `not found (${scheme})`);
    });

    test('the creation wizard, every step with its lists and hints', async ({ makeActor }) => {
      const host = await makeActor('host');
      await useColorScheme(host.page, scheme);
      const wizard = new BrunchWizard(host.page);
      const { page } = host;

      await wizard.open();
      await page.getByLabel('Title').fill('Accessible Birthday Brunch');
      await page.getByLabel('Description').fill('Someone is turning thirty.');
      await expectNoA11yViolations(page, `wizard step 1 (${scheme})`);
      await wizard.next();

      // the open list of search results, then two chosen places and the vote hint
      await wizard.searchBox().fill(fixturePlaces.harborBistro.name);
      await expect(
        page.getByRole('button', {
          name: `${fixturePlaces.harborBistro.name} — ${fixturePlaces.harborBistro.address}`,
        }),
      ).toBeVisible();
      await expectNoA11yViolations(page, `wizard step 2, search results (${scheme})`);
      await wizard.addPlace(fixturePlaces.harborBistro);
      await wizard.addPlace(fixturePlaces.sunnySide);
      await expect(page.getByText('Multiple locations will be put to a vote')).toBeVisible();
      await expectNoA11yViolations(page, `wizard step 2, places chosen (${scheme})`);
      await wizard.next();

      await wizard.addTime(10);
      await wizard.addTime(11);
      await expect(page.getByLabel('Voting closes by')).toBeVisible();
      await expectNoA11yViolations(page, `wizard step 3 (${scheme})`);
      await wizard.next();

      await wizard.addEmail('friend-one@example.com');
      await wizard.addEmail('friend-two@example.com');
      await expectNoA11yViolations(page, `wizard step 4 (${scheme})`);
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

  test('the wizard progress bar names the current step and follows Back and Next', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const wizard = new BrunchWizard(host.page);
    await wizard.open();
    const progress = host.page.getByRole('progressbar', { name: 'Brunch planning progress' });
    await expect(progress).toHaveAttribute('aria-valuenow', '1');
    await expect(progress).toHaveAttribute('aria-valuetext', 'Step 1 of 4: What');

    await host.page.getByLabel('Title').fill('Progress Brunch');
    await wizard.next();
    await expect(progress).toHaveAttribute('aria-valuetext', 'Step 2 of 4: Where');
    await wizard.next();
    await expect(progress).toHaveAttribute('aria-valuetext', 'Step 3 of 4: When');
    await wizard.back();
    await expect(progress).toHaveAttribute('aria-valuenow', '2');
  });

  test('the Back controls on the brunch and manage pages lead back where they say', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const brunchId = await createBrunch({ host: host.user, title: 'Back Button Brunch' });

    await host.page.goto(`/brunch/${brunchId}/manage`);
    await host.page.getByRole('link', { name: 'Back to brunch' }).click();
    await expect(host.page).toHaveURL(`/brunch/${brunchId}`);

    await host.page.getByRole('link', { name: 'Back to Dashboard' }).click();
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
