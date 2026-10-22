import { GONE_COLD, LANDING_HEADING, SIGN_IN_HEADING, NOT_FOUND } from '../support/pages';
import { EMPTY_DASHBOARD_HEADLINE } from '../support/dashboard';
import { createBrunch, inviteToBrunch, uniqueSuffix } from '../support/factories';
import { expect, test } from '../support/fixtures';
import { inviteRow } from '../support/invites';
import { fixturePlaces } from '../support/places';
import { captureReviewShots } from '../support/screenshots';
import { createConfirmedBrunch, createVotingBrunch, inviteNewcomer } from '../support/showcase';
import { daysFromNow, toDatetimeLocalValue } from '../support/time';
import { addAttendee, castVotes, closeVoting } from '../support/voting';
import { BrunchWizard } from '../support/wizard';

// The review set (spec 0009): one picture of every screen, light and dark, desktop and phone,
// in .screenshots/. Run with `pnpm --filter @brunchsters/web screenshots`. Not part of the
// suite and not a regression test: it asserts only enough to be sure the right screen is up.

test('signed-out pages', async ({ page, makeActor }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: LANDING_HEADING })).toBeVisible();
  await captureReviewShots(page, 'front-door/landing', testInfo);

  await page.goto('/sign-in');
  await expect(page.getByRole('heading', { name: SIGN_IN_HEADING })).toBeVisible();
  await captureReviewShots(page, 'front-door/sign-in', testInfo);

  const host = await makeActor('host');
  const brunchId = await createBrunch({ host: host.user, title: 'Birthday Brunch' });
  await page.goto(await inviteNewcomer({ host, brunchId }));
  await expect(page.getByRole('heading', { level: 1, name: 'Birthday Brunch' })).toBeVisible();
  await captureReviewShots(page, 'front-door/invite-preview', testInfo);

  await page.goto('/invite/not-a-real-token');
  await expect(page.getByRole('heading', { name: GONE_COLD })).toBeVisible();
  await captureReviewShots(page, 'front-door/invite-invalid', testInfo);
});

test('dashboard, empty and full', async ({ makeActor }, testInfo) => {
  const host = await makeActor('host');
  await host.page.goto('/dashboard');
  await expect(host.page.getByText(EMPTY_DASHBOARD_HEADLINE)).toBeVisible();
  await captureReviewShots(host.page, 'dashboard/empty', testInfo);

  const yes = await makeActor('yes');
  const maybe = await makeActor('maybe');
  const pending = await makeActor('pending');
  await createBrunch({ host: host.user, title: 'Draft Brunch' });
  await createVotingBrunch({ host, guests: { yes, maybe, pending }, title: 'Birthday Brunch' });
  await createConfirmedBrunch({ host, guest: yes, title: 'Confirmed Brunch' });
  await host.page.goto('/dashboard');
  await expect(host.page.getByRole('heading', { name: 'Upcoming' })).toBeVisible();
  await captureReviewShots(host.page, 'dashboard/full', testInfo);

  // A member's view: the next-up card with names as "First L." and numbers for the rest.
  await yes.page.goto('/dashboard');
  await expect(yes.page.getByRole('group', { name: "Who's coming" })).toBeVisible();
  await captureReviewShots(yes.page, 'dashboard/member', testInfo);
});

test('the creation wizard, every step', async ({ makeActor }, testInfo) => {
  const host = await makeActor('host');
  const wizard = new BrunchWizard(host.page);

  await wizard.open();
  await host.page.getByLabel('Title').fill('Birthday Brunch');
  await captureReviewShots(host.page, 'wizard/1-what', testInfo);
  await wizard.next();

  await wizard.addPlace(fixturePlaces.sunnySide);
  await wizard.addPlace(fixturePlaces.harborBistro);
  await captureReviewShots(host.page, 'wizard/2-where', testInfo);
  await wizard.next();

  await wizard.addTime(10);
  await wizard.addTime(11);
  await captureReviewShots(host.page, 'wizard/3-when', testInfo);
  await wizard.next();

  await wizard.addEmail('friend@example.com');
  await captureReviewShots(host.page, 'wizard/4-who', testInfo);
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

  // a second voter, so the quiet bars have something to show: Sunny Side Cafe leads 2 to 1
  await castVotes({
    brunchId: voting.brunchId,
    voter: maybe.user,
    places: [fixturePlaces.sunnySide.name, fixturePlaces.harborBistro.name],
    times: [1],
  });

  await host.page.goto(`/brunch/${voting.brunchId}`);
  await expect(host.page.getByRole('heading', { name: voting.title })).toBeVisible();
  await captureReviewShots(host.page, 'brunch/host-voting', testInfo);

  await host.page.goto(`/brunch/${voting.brunchId}/manage`);
  await expect(host.page.getByRole('heading', { name: /Manage/ })).toBeVisible();
  await captureReviewShots(host.page, 'manage/voting', testInfo);

  // a guest suggests a place and a time: their own panel, then the host's review list
  const suggester = await makeActor('suggester');
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
  await captureReviewShots(suggester.page, 'brunch/invitee-with-suggestions', testInfo);

  await host.page.goto(`/brunch/${voting.brunchId}/manage`);
  await expect(host.page.getByRole('heading', { name: 'Pending Suggestions' })).toBeVisible();
  await captureReviewShots(host.page, 'manage/with-suggestions', testInfo);

  await yes.page.goto(`/brunch/${voting.brunchId}`);
  await expect(yes.page.getByRole('heading', { name: voting.title })).toBeVisible();
  await captureReviewShots(yes.page, 'brunch/invitee-voting', testInfo);

  // someone who said no sees the ballot, read-only
  const declined = await makeActor('declined');
  await addAttendee({
    brunchId: voting.brunchId,
    host: host.user,
    user: declined.user,
    response: 'no',
  });
  await declined.page.goto(`/brunch/${voting.brunchId}`);
  await expect(declined.page.getByText('Your RSVP does not allow voting.').first()).toBeVisible();
  await captureReviewShots(declined.page, 'brunch/invitee-cannot-vote', testInfo);

  // someone invited who has not answered yet is a member: the same page, with no answer chosen
  await pending.page.goto(`/brunch/${voting.brunchId}`);
  await expect(pending.page.getByRole('heading', { name: voting.title })).toBeVisible();
  await captureReviewShots(pending.page, 'brunch/invitee-unanswered', testInfo);

  // a stranger gets the 404, the same for this brunch as for any address
  const stranger = await makeActor('stranger');
  await stranger.page.goto(`/brunch/${voting.brunchId}`);
  await expect(stranger.page.getByRole('heading', { name: NOT_FOUND })).toBeVisible();
  await captureReviewShots(stranger.page, 'front-door/not-found', testInfo);

  await closeVoting({ brunchId: voting.brunchId, host: host.user });
  await yes.page.goto(`/brunch/${voting.brunchId}`);
  await expect(yes.page.getByText('Voting is closed.').first()).toBeVisible();
  await captureReviewShots(yes.page, 'brunch/invitee-voting-closed', testInfo);

  const confirmed = await createConfirmedBrunch({ host, guest: yes, title: 'Confirmed Brunch' });
  await host.page.goto(`/brunch/${confirmed.brunchId}`);
  await expect(host.page.getByRole('heading', { name: confirmed.title })).toBeVisible();
  await captureReviewShots(host.page, 'brunch/host-confirmed', testInfo);

  await yes.page.goto(`/brunch/${confirmed.brunchId}`);
  await expect(yes.page.getByRole('heading', { name: 'Brunch on.', exact: true })).toBeVisible();
  await captureReviewShots(yes.page, 'brunch/invitee-confirmed', testInfo);

  await host.page.goto(`/brunch/${confirmed.brunchId}/manage`);
  await expect(host.page.getByRole('heading', { name: 'Confirmed', exact: true })).toBeVisible();
  await captureReviewShots(host.page, 'manage/confirmed', testInfo);

  const draftId = await createBrunch({ host: host.user, title: 'Draft Brunch' });
  await host.page.goto(`/brunch/${draftId}/manage`);
  await expect(host.page.getByRole('heading', { name: 'Send an invite first' })).toBeVisible();
  await captureReviewShots(host.page, 'manage/draft', testInfo);

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
  await captureReviewShots(host.page, 'manage/long-address', testInfo);
});

// The invite panel while a limit holds (spec 0012): Resend waiting on one invite, and the send
// button waiting after the day's invites are used up.
test('the invite panel while a limit holds', async ({ makeActor }, testInfo) => {
  const host = await makeActor('host');
  const guest = `resent-${uniqueSuffix()}@example.com`;
  const resendBrunch = await createBrunch({ host: host.user, title: 'Birthday Brunch' });
  await inviteToBrunch({
    brunchId: resendBrunch,
    host: host.user,
    invitees: [{ email: guest }, { email: `quiet-${uniqueSuffix()}@example.com` }],
  });
  await host.page.goto(`/brunch/${resendBrunch}`);
  const resend = inviteRow(host.page, guest).getByRole('button', { name: 'Resend' });
  const firstResend = host.page.waitForResponse(
    (response) => response.url().includes('/resend') && response.request().method() === 'POST',
  );
  await resend.click();
  await firstResend;
  await resend.click();
  await expect(inviteRow(host.page, guest).getByText(/That one just went out/)).toBeVisible();
  await captureReviewShots(host.page, 'brunch/host-resend-waiting', testInfo);

  const sendBrunch = await createBrunch({ host: host.user, title: 'Big Brunch' });
  const crowd = Array.from({ length: 50 }, (_, index) => ({
    email: `crowd-${index}-${uniqueSuffix()}@example.com`,
  }));
  await inviteToBrunch({ brunchId: sendBrunch, host: host.user, invitees: crowd });
  await host.page.goto(`/brunch/${sendBrunch}`);
  await host.page.getByLabel('Invite more people').fill(`one-more-${uniqueSuffix()}@example.com`);
  await host.page.getByRole('button', { name: 'Round up the crew' }).click();
  await expect(host.page.getByText(/that's a lot of invites for one day/)).toBeVisible();
  await captureReviewShots(host.page, 'brunch/host-invites-waiting', testInfo);
});
