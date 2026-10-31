import { GONE_COLD, LANDING_HEADING, SIGN_IN_HEADING, NOT_FOUND } from '../support/pages';
import { EMPTY_DASHBOARD_HEADLINE } from '../support/dashboard';
import { completePastBrunches } from '@brunchsters/core';
import { getDb } from '../support/db';
import { createBrunch, failInviteEmail, inviteToBrunch, uniqueSuffix } from '../support/factories';
import { createLifecycleShowcase, hideForGuest } from '../support/lifecycleShowcase';
import { afterTheHold, callOffBrunch } from '../support/lifecycle';
import { expect, test } from '../support/fixtures';
import { inviteRow } from '../support/invites';
import { fixturePlaces } from '../support/places';
import { captureReviewShots } from '../support/screenshots';
import { createConfirmedBrunch, createVotingBrunch, inviteNewcomer } from '../support/showcase';
import { daysFromNow, toDatetimeLocalValue } from '../support/time';
import { TOAST_WORDS, toast } from '../support/toasts';
import { giveShowcaseNotifications } from '../support/notifications';
import { EMPTY_INBOX_HEADLINE, inboxRows } from '../support/inbox';
import { addAttendee, castVotes, closeVoting, passConfirmedTime } from '../support/voting';
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

test('notifications: the empty inbox, the bell and the inbox', async ({ makeActor }, testInfo) => {
  const ann = await makeActor('ann');
  await ann.page.goto('/notifications');
  await expect(ann.page.getByRole('heading', { name: EMPTY_INBOX_HEADLINE })).toBeVisible();
  await captureReviewShots(ann.page, 'notifications/inbox-empty', testInfo);

  const host = await makeActor('host');
  const brunchId = await createBrunch({ host: host.user, title: 'Sunday Catch-up' });
  await giveShowcaseNotifications({ user: ann.user, brunchId });
  await ann.page.goto('/dashboard');
  await expect(ann.page.getByRole('link', { name: /^Notifications, 2 unread/ })).toBeVisible();
  await captureReviewShots(ann.page, 'notifications/bell', testInfo, {
    focus: ann.page.getByRole('banner'),
  });

  await ann.page.goto('/notifications');
  await expect(inboxRows(ann.page)).toHaveCount(4);
  await captureReviewShots(ann.page, 'notifications/inbox', testInfo);
});

test('notifications: the settings and the mute control', async ({ makeActor }, testInfo) => {
  const host = await makeActor('host');
  const ann = await makeActor('ann');
  const brunchId = await createBrunch({ host: host.user, title: 'Sunday Catch-up' });
  await addAttendee({ brunchId, host: host.user, user: ann.user, response: 'yes' });

  await ann.page.goto('/settings/notifications');
  await expect(
    ann.page.getByRole('heading', { level: 1, name: 'Notification settings' }),
  ).toBeVisible();
  await ann.page.getByRole('switch', { name: 'A brunch is on, by email' }).click();
  await expect(
    ann.page.getByRole('switch', { name: 'A brunch is on, by email' }),
  ).not.toBeChecked();
  await captureReviewShots(ann.page, 'notifications/settings', testInfo);

  await ann.page.goto(`/brunch/${brunchId}`);
  await ann.page.getByRole('radio', { name: /^Just big stuff/ }).check();
  await expect(ann.page.getByRole('radio', { name: /^Just big stuff/ })).toBeChecked();
  await captureReviewShots(ann.page, 'notifications/mute', testInfo, {
    focus: ann.page.getByRole('group', { name: 'Notifications for this brunch' }),
  });
});

test('notifications: a failed invite and a brunch that is over', async ({
  makeActor,
}, testInfo) => {
  const host = await makeActor('host');
  const guest = await makeActor('guest');
  const bouncedId = await createBrunch({ host: host.user, title: 'Sunday Catch-up' });
  await inviteToBrunch({
    brunchId: bouncedId,
    host: host.user,
    invitees: [{ email: 'nobody@example.com' }],
  });
  await failInviteEmail({ brunchId: bouncedId, email: 'nobody@example.com' });
  await host.page.goto(`/brunch/${bouncedId}`);
  await expect(host.page.getByText("That email didn't go through.")).toBeVisible();
  await captureReviewShots(host.page, 'notifications/invite-failed', testInfo, {
    focus: host.page.getByText("That email didn't go through."),
  });

  const { brunchId } = await createConfirmedBrunch({ host, guest, title: 'Birthday Brunch' });
  await passConfirmedTime(brunchId);
  await completePastBrunches({ now: new Date(), brunchId }, { db: getDb() });
  await guest.page.goto(`/brunch/${brunchId}`);
  await expect(guest.page.getByRole('heading', { name: 'Over.' })).toBeVisible();
  await captureReviewShots(guest.page, 'notifications/over', testInfo);
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

  // The place search when the server says to slow down (spec 0012): the line shows, the input stays
  // usable and what was already listed stays.
  await wizard.searchBox().fill('sunny');
  await expect(
    host.page.getByRole('button', {
      name: `${fixturePlaces.sunnySide.name} — ${fixturePlaces.sunnySide.address}`,
    }),
  ).toBeVisible();
  await host.page.route(/\/api\/v1\/places\/search/, async (route) => {
    await route.fulfill({
      status: 429,
      headers: { 'Retry-After': '120' },
      json: { error: 'Too many requests', policy: 'place-search', retryAfterSeconds: 120 },
    });
  });
  await wizard.searchBox().fill('sunny s');
  await expect(host.page.getByText('Slow down a sec, then try again.')).toBeVisible();
  await captureReviewShots(host.page, 'wizard/2-where-slow-down', testInfo);
  await wizard.searchBox().fill('');
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
  // The page opens already waiting (the server's account of the day's budget, journey L1d), so
  // there is nothing to press: the button is `aria-disabled` and the reason is on screen.
  await host.page.goto(`/brunch/${sendBrunch}`);
  await expect(host.page.getByText(/that's a lot of invites for one day/)).toBeVisible();
  await captureReviewShots(host.page, 'brunch/host-invites-waiting', testInfo);
});

test('the lifecycle screens: end of the road, the dialog, called off, hidden', async ({
  makeActor,
  page,
}, testInfo) => {
  const { host, guest, active, draft, calledOff } = await createLifecycleShowcase(makeActor);

  await host.page.goto(`/brunch/${active.id}/manage`);
  await expect(host.page.getByRole('heading', { name: 'End of the road' })).toBeVisible();
  await captureReviewShots(host.page, 'lifecycle/manage-end-of-the-road', testInfo);

  await host.page.getByRole('button', { name: 'Call it off', exact: true }).click();
  await expect(host.page.getByRole('dialog', { name: /^Calling off / })).toBeVisible();
  await captureReviewShots(host.page, 'lifecycle/call-it-off-dialog', testInfo);
  await host.page.keyboard.press('Escape');

  await host.page.goto(`/brunch/${draft.id}/manage`);
  await expect(host.page.getByRole('button', { name: 'Delete this draft' })).toBeVisible();
  await host.page.getByRole('button', { name: 'Delete this draft' }).click();
  await expect(host.page.getByRole('dialog', { name: /^Delete / })).toBeVisible();
  await captureReviewShots(host.page, 'lifecycle/delete-dialog', testInfo);
  await host.page.keyboard.press('Escape');

  await host.page.goto(`/brunch/${calledOff.id}/manage`);
  await expect(host.page.getByRole('heading', { name: 'Called off.' })).toBeVisible();
  await captureReviewShots(host.page, 'lifecycle/manage-called-off', testInfo);

  await guest.page.goto(`/brunch/${calledOff.id}`);
  await expect(guest.page.getByRole('heading', { name: 'Called off.' })).toBeVisible();
  await captureReviewShots(guest.page, 'lifecycle/brunch-called-off-member', testInfo);

  await hideForGuest({ guest, brunchId: active.id });
  await guest.page.goto('/dashboard');
  await expect(guest.page.getByRole('link', { name: 'Hidden (1)' })).toBeVisible();
  await captureReviewShots(guest.page, 'lifecycle/dashboard-hidden-link', testInfo);
  await guest.page.goto('/dashboard?hidden=1');
  await expect(guest.page.getByRole('heading', { name: 'Hidden', exact: true })).toBeVisible();
  await captureReviewShots(guest.page, 'lifecycle/dashboard-hidden-list', testInfo);

  const brunchId = await createBrunch({ host: host.user, title: 'Birthday Brunch' });
  const link = await inviteNewcomer({ host, brunchId });
  await callOffBrunch({ brunchId, host: host.user, at: afterTheHold(), announce: false });
  await page.goto(link);
  await expect(
    page.getByRole('heading', { level: 1, name: `${host.user.name} called this one off.` }),
  ).toBeVisible();
  await captureReviewShots(page, 'lifecycle/invite-called-off', testInfo);
});

// Spec 0014: the toast region, an error and a success, held (focus) so it is up when photographed.
test('toasts', async ({ makeActor }, testInfo) => {
  const host = await makeActor('host');
  const yes = await makeActor('yes');
  const maybe = await makeActor('maybe');
  const pending = await makeActor('pending');
  const { brunchId } = await createVotingBrunch({ host, guests: { yes, maybe, pending } });
  await maybe.page.goto(`/brunch/${brunchId}`);
  await expect(maybe.page.getByRole('heading', { name: 'You in?', exact: true })).toBeVisible();

  await maybe.page.route('**/api/v1/brunches/*/rsvp', (route) =>
    route.fulfill({ status: 500, json: { error: { code: 'internal', message: 'x' } } }),
  );
  await maybe.page.getByRole('button', { name: "I'm in", exact: true }).click();
  const failure = toast(maybe.page, TOAST_WORDS.wentSideways);
  await expect(failure).toBeVisible();
  await failure.getByRole('button', { name: 'Dismiss' }).focus();
  await captureReviewShots(maybe.page, 'feedback/toast-error', testInfo);
  await failure.getByRole('button', { name: 'Dismiss' }).click();

  await maybe.page.unroute('**/api/v1/brunches/*/rsvp');
  await maybe.page.getByRole('button', { name: "I'm in", exact: true }).click();
  const success = toast(maybe.page, TOAST_WORDS.imIn);
  await expect(success).toBeVisible();
  await success.getByRole('button', { name: 'Dismiss' }).focus();
  await captureReviewShots(maybe.page, 'feedback/toast-success', testInfo);
});

// Spec 0014 M5: the invite panel's note after a brunch was created with invites that did not go
// out, and the place search's line when the search could not be answered.
test('invites note and search error', async ({ makeActor }, testInfo) => {
  const host = await makeActor('host');
  const wizard = new BrunchWizard(host.page);
  await wizard.open();
  await wizard.fillWhat({ title: `Invites Note ${uniqueSuffix()}` });
  await host.page.route('**/api/v1/places/search**', (route) =>
    route.fulfill({
      status: 502,
      json: { error: { code: 'unavailable', message: 'x' } },
    }),
  );
  await wizard.searchBox().fill('sunny');
  await expect(host.page.getByRole('alert').filter({ hasText: 'Our end hiccuped.' })).toBeVisible();
  await captureReviewShots(host.page, 'feedback/search-error', testInfo);
  await host.page.unroute('**/api/v1/places/search**');

  await wizard.addPlace(fixturePlaces.sunnySide);
  await wizard.next();
  await wizard.addTime(10);
  await wizard.next();
  await wizard.addEmail(`guest-${uniqueSuffix()}@example.com`);
  await host.page.route('**/api/v1/brunches/*/invites', (route) =>
    route.fulfill({ status: 500, json: { error: { code: 'internal', message: 'x' } } }),
  );
  await wizard.create();
  await expect(
    host.page
      .getByRole('status')
      .filter({ hasText: "Your brunch is up, but the invites didn't go out." }),
  ).toBeVisible();
  await captureReviewShots(host.page, 'feedback/invites-note', testInfo, {
    focus: host.page.getByRole('status').filter({ hasText: 'Your brunch is up' }),
  });
});

// Spec 0014: the inline failures (a ballot, a dialog) and the sign-in page's way back.
test('inline failures and the sign-in way back', async ({ makeActor, page }, testInfo) => {
  const host = await makeActor('host');
  const voter = await makeActor('voter');
  const brunchId = await createBrunch({
    host: host.user,
    title: 'Sunday Funday',
    locations: [fixturePlaces.sunnySide, fixturePlaces.harborBistro],
    times: [daysFromNow(10), daysFromNow(11)],
  });
  await addAttendee({ brunchId, host: host.user, user: voter.user, response: 'yes' });

  // A ballot whose save fails: rolled back, with the reason beside it.
  await voter.page.goto(`/brunch/${brunchId}`);
  await voter.page.route(`**/api/v1/brunches/${brunchId}/votes/locations`, (route) =>
    route.fulfill({ status: 409, json: { error: { code: 'voting_closed', message: 'x' } } }),
  );
  await voter.page.getByRole('checkbox', { name: /^Sunny Side Cafe/ }).click();
  await expect(
    voter.page.getByRole('alert').filter({ hasText: "Voting's closed on this one." }),
  ).toBeVisible();
  await captureReviewShots(voter.page, 'feedback/ballot-error', testInfo, {
    focus: voter.page.getByRole('alert').filter({ hasText: "Voting's closed on this one." }),
  });

  // A call-off that fails: the line stays inside the dialog.
  await host.page.goto(`/brunch/${brunchId}/manage`);
  await host.page.route(`**/api/v1/brunches/${brunchId}/cancel`, (route) =>
    route.fulfill({ status: 500, json: { error: { code: 'internal', message: 'x' } } }),
  );
  await host.page.getByRole('button', { name: 'Call it off', exact: true }).click();
  const dialog = host.page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Call it off', exact: true }).click();
  await expect(
    dialog.getByRole('alert').filter({ hasText: 'Something went sideways on our end.' }),
  ).toBeVisible();
  await captureReviewShots(host.page, 'feedback/dialog-error', testInfo);

  // Sign-in, reached from a page that was open when the session ended.
  await page.goto(`/sign-in?callbackUrl=${encodeURIComponent(`/brunch/${brunchId}`)}`);
  await expect(page.getByText("Sign in and we'll take you right back")).toBeVisible();
  await captureReviewShots(page, 'feedback/signin-way-back', testInfo);
});
