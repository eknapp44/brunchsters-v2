import { createBrunch } from '../support/factories';
import { expect, test } from '../support/fixtures';
import { fixturePlaces } from '../support/places';
import { captureReviewShots } from '../support/screenshots';
import { createConfirmedBrunch, createVotingBrunch, inviteNewcomer } from '../support/showcase';
import { closeVoting } from '../support/voting';
import { BrunchWizard } from '../support/wizard';

// The review set (spec 0009): one picture of every screen, light and dark, desktop and phone,
// in .screenshots/. Run with `pnpm --filter @brunchsters/web screenshots`. Not part of the
// suite and not a regression test: it asserts only enough to be sure the right screen is up.

test('signed-out pages', async ({ page, makeActor }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Brunchsters' })).toBeVisible();
  await captureReviewShots(page, 'landing', testInfo);

  await page.goto('/sign-in');
  await expect(page.getByRole('heading', { name: 'Sign in to Brunchsters' })).toBeVisible();
  await captureReviewShots(page, 'sign-in', testInfo);

  const host = await makeActor('host');
  const brunchId = await createBrunch({ host: host.user, title: 'Birthday Brunch' });
  await page.goto(await inviteNewcomer({ host, brunchId }));
  await expect(page.getByRole('heading', { name: /You're invited to/ })).toBeVisible();
  await captureReviewShots(page, 'invite-preview', testInfo);

  await page.goto('/invite/not-a-real-token');
  await expect(page.getByRole('heading', { name: 'Invite not found' })).toBeVisible();
  await captureReviewShots(page, 'invite-invalid', testInfo);
});

test('dashboard, empty and full', async ({ makeActor }, testInfo) => {
  const host = await makeActor('host');
  await host.page.goto('/dashboard');
  await expect(host.page.getByText('No brunches yet.')).toBeVisible();
  await captureReviewShots(host.page, 'dashboard-empty', testInfo);

  const yes = await makeActor('yes');
  const maybe = await makeActor('maybe');
  const pending = await makeActor('pending');
  await createBrunch({ host: host.user, title: 'Draft Brunch' });
  await createVotingBrunch({ host, guests: { yes, maybe, pending }, title: 'Birthday Brunch' });
  await createConfirmedBrunch({ host, guest: yes, title: 'Confirmed Brunch' });
  await host.page.goto('/dashboard');
  await expect(host.page.getByRole('heading', { name: 'Upcoming' })).toBeVisible();
  await captureReviewShots(host.page, 'dashboard-full', testInfo);
});

test('the creation wizard, every step', async ({ makeActor }, testInfo) => {
  const host = await makeActor('host');
  const wizard = new BrunchWizard(host.page);

  await wizard.open();
  await host.page.getByLabel('Title').fill('Birthday Brunch');
  await captureReviewShots(host.page, 'wizard-1-what', testInfo);
  await wizard.next();

  await wizard.addPlace(fixturePlaces.sunnySide);
  await wizard.addPlace(fixturePlaces.harborBistro);
  await captureReviewShots(host.page, 'wizard-2-where', testInfo);
  await wizard.next();

  await wizard.addTime(10);
  await wizard.addTime(11);
  await captureReviewShots(host.page, 'wizard-3-when', testInfo);
  await wizard.next();

  await wizard.addEmail('friend@example.com');
  await captureReviewShots(host.page, 'wizard-4-who', testInfo);
});

test('brunch detail and manage, as host and as invitee', async ({ makeActor }, testInfo) => {
  const host = await makeActor('host');
  const yes = await makeActor('yes');
  const maybe = await makeActor('maybe');
  const pending = await makeActor('pending');
  const voting = await createVotingBrunch({
    host,
    guests: { yes, maybe, pending },
    title: 'Birthday Brunch',
  });

  await host.page.goto(`/brunch/${voting.brunchId}`);
  await expect(host.page.getByRole('heading', { name: voting.title })).toBeVisible();
  await captureReviewShots(host.page, 'brunch-host-voting', testInfo);

  await host.page.goto(`/brunch/${voting.brunchId}/manage`);
  await expect(host.page.getByRole('heading', { name: /Manage/ })).toBeVisible();
  await captureReviewShots(host.page, 'manage-voting', testInfo);

  await yes.page.goto(`/brunch/${voting.brunchId}`);
  await expect(yes.page.getByRole('heading', { name: voting.title })).toBeVisible();
  await captureReviewShots(yes.page, 'brunch-invitee-voting', testInfo);

  // someone invited who has not answered is not a member yet, so the page is a 404
  await pending.page.goto(`/brunch/${voting.brunchId}`);
  await captureReviewShots(pending.page, 'not-found', testInfo);

  await closeVoting({ brunchId: voting.brunchId, host: host.user });
  await yes.page.goto(`/brunch/${voting.brunchId}`);
  await expect(yes.page.getByText('Voting is closed.').first()).toBeVisible();
  await captureReviewShots(yes.page, 'brunch-invitee-voting-closed', testInfo);

  const confirmed = await createConfirmedBrunch({ host, guest: yes, title: 'Confirmed Brunch' });
  await host.page.goto(`/brunch/${confirmed.brunchId}`);
  await expect(host.page.getByRole('heading', { name: confirmed.title })).toBeVisible();
  await captureReviewShots(host.page, 'brunch-host-confirmed', testInfo);

  await host.page.goto(`/brunch/${confirmed.brunchId}/manage`);
  await expect(host.page.getByRole('heading', { name: 'Confirmed', exact: true })).toBeVisible();
  await captureReviewShots(host.page, 'manage-confirmed', testInfo);

  const draftId = await createBrunch({ host: host.user, title: 'Draft Brunch' });
  await host.page.goto(`/brunch/${draftId}/manage`);
  await expect(host.page.getByRole('heading', { name: 'Send an invite first' })).toBeVisible();
  await captureReviewShots(host.page, 'manage-draft', testInfo);

  // real addresses are long: the row must keep its Remove button beside the text on a desktop
  const longId = await createBrunch({
    host: host.user,
    title: 'Long Address Brunch',
    locations: [
      {
        ...fixturePlaces.sunnySide,
        placeId: 'e2e-place-long-address',
        name: 'The Mad Rooster Cafe and Bakery',
        address: '4401 West Greenfield Avenue, West Allis, Milwaukee, WI 53214, United States',
      },
    ],
  });
  await host.page.goto(`/brunch/${longId}/manage`);
  await expect(host.page.getByText('The Mad Rooster Cafe and Bakery').first()).toBeVisible();
  await captureReviewShots(host.page, 'manage-long-address', testInfo);
});
