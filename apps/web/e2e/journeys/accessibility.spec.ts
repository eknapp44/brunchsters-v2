import { GONE_COLD, LANDING_HEADING, NOT_FOUND, SIGN_IN_HEADING } from '../support/pages';
import { EMPTY_DASHBOARD_HEADLINE } from '../support/dashboard';
import { COLOR_SCHEMES, expectNoA11yViolations, useColorScheme } from '../support/a11y';
import { createBrunch } from '../support/factories';
import { EMPTY_INBOX_HEADLINE, expectBell, inboxRows } from '../support/inbox';
import { giveNotification, readNotification } from '../support/notifications';
import { afterTheHold, callOffBrunch } from '../support/lifecycle';
import { expect, test } from '../support/fixtures';
import { fixturePlaces } from '../support/places';
import { createLifecycleShowcase, hideForGuest } from '../support/lifecycleShowcase';
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
      await expect(page.getByRole('heading', { name: LANDING_HEADING })).toBeVisible();
      await expectNoA11yViolations(page, `/ (${scheme})`);

      await page.goto('/sign-in');
      await expect(page.getByRole('heading', { name: SIGN_IN_HEADING })).toBeVisible();
      await expectNoA11yViolations(page, `/sign-in (${scheme})`);
    });

    test('an invite page, valid and invalid', async ({ page, makeActor }) => {
      const host = await makeActor('host');
      const title = 'Accessible Brunch';
      const brunchId = await createBrunch({ host: host.user, title });
      const link = await inviteNewcomer({ host, brunchId });

      await page.goto(link);
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      await expectNoA11yViolations(page, `invite preview (${scheme})`);

      await page.goto('/invite/not-a-real-token');
      await expect(page.getByRole('heading', { name: GONE_COLD })).toBeVisible();
      await expectNoA11yViolations(page, `invalid invite (${scheme})`);
    });

    test('an invite page for a brunch the host called off (spec 0013)', async ({
      page,
      makeActor,
    }) => {
      const host = await makeActor('host');
      const brunchId = await createBrunch({ host: host.user, title: 'Accessible Brunch' });
      const link = await inviteNewcomer({ host, brunchId });
      await callOffBrunch({ brunchId, host: host.user, at: afterTheHold(), announce: false });

      await page.goto(link);
      await expect(
        page.getByRole('heading', { level: 1, name: `${host.user.name} called this one off.` }),
      ).toBeVisible();
      await expectNoA11yViolations(page, `called-off invite (${scheme})`);
    });
  });

  test.describe(`D2 — signed-in screens (${scheme})`, () => {
    test('the dashboard, empty and with brunches in every state', async ({ makeActor }) => {
      const host = await makeActor('host');
      await useColorScheme(host.page, scheme);

      await host.page.goto('/dashboard');
      await expect(host.page.getByText(EMPTY_DASHBOARD_HEADLINE)).toBeVisible();
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

      // A member's view: the next-up card with the butter panel, names as "First L." and counts.
      await useColorScheme(yes.page, scheme);
      await yes.page.goto('/dashboard');
      await expect(yes.page.getByRole('group', { name: "Who's coming" })).toBeVisible();
      await expectNoA11yViolations(yes.page, `a member's dashboard (${scheme})`);

      // The same page on a phone: rows stacked, the roster cut to its first names.
      await host.page.setViewportSize({ width: 390, height: 844 });
      await host.page.goto('/dashboard');
      await expect(host.page.getByRole('heading', { name: 'Upcoming' })).toBeVisible();
      await expectNoA11yViolations(host.page, `dashboard at phone width (${scheme})`);
    });

    test('the bell and the inbox: empty, with unread and read rows, and at phone width (spec 0015)', async ({
      makeActor,
    }) => {
      const ann = await makeActor('ann');
      await useColorScheme(ann.page, scheme);

      await ann.page.goto('/notifications');
      await expect(ann.page.getByRole('heading', { name: EMPTY_INBOX_HEADLINE })).toBeVisible();
      await expectNoA11yViolations(ann.page, `empty inbox (${scheme})`);

      // One read and two unread, so the bell has a number and both kinds of row are drawn.
      const read = await giveNotification({ user: ann.user });
      await giveNotification({ user: ann.user });
      await giveNotification({ user: ann.user });
      await readNotification({ user: ann.user, id: read });

      await ann.page.goto('/notifications');
      await expect(inboxRows(ann.page)).toHaveCount(3);
      await expectBell(ann.page, 2);
      await expectNoA11yViolations(ann.page, `inbox with rows (${scheme})`);

      await ann.page.setViewportSize({ width: 390, height: 844 });
      await ann.page.goto('/notifications');
      await expect(inboxRows(ann.page)).toHaveCount(3);
      await expectNoA11yViolations(ann.page, `inbox at phone width (${scheme})`);
    });

    test('the notification settings page, and the mute control on a brunch (spec 0015)', async ({
      makeActor,
    }) => {
      const host = await makeActor('host');
      const ann = await makeActor('ann');
      await useColorScheme(ann.page, scheme);
      const brunchId = await createBrunch({ host: host.user, title: 'Mutable Brunch' });
      await addAttendee({ brunchId, host: host.user, user: ann.user, response: 'yes' });

      await ann.page.goto('/settings/notifications');
      await expect(
        ann.page.getByRole('heading', { level: 1, name: 'Notification settings' }),
      ).toBeVisible();
      await expectNoA11yViolations(ann.page, `notification settings (${scheme})`);

      // A switch that is on and one that is off, so both drawn states are checked.
      await ann.page.getByRole('switch', { name: 'A brunch is on, by email' }).click();
      await expect(
        ann.page.getByRole('switch', { name: 'A brunch is on, by email' }),
      ).not.toBeChecked();
      await expectNoA11yViolations(ann.page, `notification settings, one off (${scheme})`);

      await ann.page.setViewportSize({ width: 390, height: 844 });
      await ann.page.goto('/settings/notifications');
      await expect(
        ann.page.getByRole('heading', { level: 1, name: 'Notification settings' }),
      ).toBeVisible();
      await expectNoA11yViolations(ann.page, `notification settings at phone width (${scheme})`);

      // The brunch page's own control, with a choice made.
      await ann.page.goto(`/brunch/${brunchId}`);
      await ann.page.getByRole('radio', { name: /^Muted/ }).check();
      await expect(ann.page.getByRole('radio', { name: /^Muted/ })).toBeChecked();
      await expectNoA11yViolations(ann.page, `mute control, muted (${scheme})`);
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

      // the same page at phone width: rows, helper lines and chips as a phone shows them
      await maybe.page.setViewportSize({ width: 390, height: 844 });
      await maybe.page.goto(detail);
      await expect(maybe.page.getByText('Current: maybe')).toBeVisible();
      await expectNoA11yViolations(maybe.page, `detail, invitee, phone width (${scheme})`);

      // someone who said no can see the ballot but not vote on it
      const declined = await makeActor('declined');
      await useColorScheme(declined.page, scheme);
      await addAttendee({
        brunchId: voting.brunchId,
        host: host.user,
        user: declined.user,
        response: 'no',
      });
      await declined.page.goto(detail);
      await expect(
        declined.page.getByText('Your RSVP does not allow voting.').first(),
      ).toBeVisible();
      await expectNoA11yViolations(declined.page, `detail, invitee who cannot vote (${scheme})`);

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

    test('the lifecycle screens: end of the road, the dialog, a called-off brunch, hidden (spec 0013)', async ({
      makeActor,
    }) => {
      const { host, guest, active, draft, calledOff } = await createLifecycleShowcase(makeActor);
      await useColorScheme(host.page, scheme);
      await useColorScheme(guest.page, scheme);

      // The manage page of a brunch that is open, with the last section...
      await host.page.goto(`/brunch/${active.id}/manage`);
      await expect(host.page.getByRole('heading', { name: 'End of the road' })).toBeVisible();
      await expectNoA11yViolations(host.page, `manage with end of the road (${scheme})`);

      // ...and the dialog that asks before calling it off.
      await host.page.getByRole('button', { name: 'Call it off', exact: true }).click();
      await expect(host.page.getByRole('dialog', { name: /^Calling off / })).toBeVisible();
      await expectNoA11yViolations(host.page, `call it off dialog (${scheme})`);
      await host.page.keyboard.press('Escape');

      // A draft, only deletable; a brunch called off, with Delete still waiting.
      await host.page.goto(`/brunch/${draft.id}/manage`);
      await expect(host.page.getByRole('button', { name: 'Delete this draft' })).toBeVisible();
      await expectNoA11yViolations(host.page, `manage draft with delete (${scheme})`);

      await host.page.goto(`/brunch/${calledOff.id}/manage`);
      await expect(host.page.getByRole('heading', { name: 'Called off.' })).toBeVisible();
      await expect(host.page.getByRole('button', { name: 'Delete this brunch' })).toHaveAttribute(
        'aria-disabled',
        'true',
      );
      await expectNoA11yViolations(host.page, `manage called off (${scheme})`);

      // The guest's read-only page of the called-off brunch, and their dashboard once hidden.
      await guest.page.goto(`/brunch/${calledOff.id}`);
      await expect(guest.page.getByRole('heading', { name: 'Called off.' })).toBeVisible();
      await expectNoA11yViolations(guest.page, `called-off brunch page (${scheme})`);

      await hideForGuest({ guest, brunchId: active.id });
      await guest.page.goto('/dashboard?hidden=1');
      await expect(guest.page.getByRole('heading', { name: 'Hidden', exact: true })).toBeVisible();
      await expect(guest.page.getByRole('heading', { name: 'Past', exact: true })).toBeVisible();
      await expectNoA11yViolations(guest.page, `dashboard with the hidden list (${scheme})`);
    });

    test('the not-found page, which anyone who may not see a brunch gets', async ({
      makeActor,
    }) => {
      const host = await makeActor('host');
      const stranger = await makeActor('stranger');
      await useColorScheme(stranger.page, scheme);
      const brunchId = await createBrunch({ host: host.user, title: 'Not For Strangers' });
      await stranger.page.goto(`/brunch/${brunchId}`);
      await expect(stranger.page.getByText(NOT_FOUND)).toBeVisible();
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

  test('the landing page: Sign in (and Round up the crew) when signed out, Go to dashboard when signed in', async ({
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
    await expect(progress).toHaveAttribute('aria-valuetext', 'Step 1 of 4: Title');

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
