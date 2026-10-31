import { createBrunch, uniqueSuffix } from '../support/factories';
import { expect, test, type Actor } from '../support/fixtures';
import {
  EMPTY_INBOX_HEADLINE,
  expectBell,
  inboxRow,
  inboxRows,
  waitForNotifications,
} from '../support/inbox';
import { emailsTo, waitForEmails } from '../support/mailbox';
import { fixturePlaces } from '../support/places';
import { waitForRuns } from '../support/queue';
import { daysFromNow } from '../support/time';
import { TOAST_WORDS, toast } from '../support/toasts';
import { addAttendee, listOptions } from '../support/voting';
import { getDb } from '../support/db';
import type { BrunchId } from '@brunchsters/shared';

// Journeys B6, B7 and B12 (spec 0015 M5): what a person chooses to hear, through the real queue and
// the real emails. A "was never sent" is observed after the queue has gone quiet
// (`waitForQueueIdle`), not guessed.

const post = (actor: Actor, path: string, data?: unknown) =>
  actor.context.request.post(path, data === undefined ? {} : { data });

async function openSettings(actor: Actor): Promise<void> {
  await actor.page.goto('/notifications');
  await actor.page.getByRole('link', { name: 'Notification settings' }).click();
  await expect(
    actor.page.getByRole('heading', { level: 1, name: 'Notification settings' }),
  ).toBeVisible();
}

const switchFor = (actor: Actor, name: string) => actor.page.getByRole('switch', { name });

// Does something that saves a choice and waits for the save to be answered. A page reloaded right
// after a tap would cancel the request still on its way, and the choice would look unsaved.
async function saving(actor: Actor, urlPart: string, act: () => Promise<unknown>): Promise<void> {
  const answered = actor.page.waitForResponse(
    (response) => response.url().includes(urlPart) && response.request().method() === 'PUT',
  );
  await act();
  await answered;
}
const savingSwitch = (actor: Actor, act: () => Promise<unknown>) =>
  saving(actor, '/api/v1/notification-preferences', act);
const savingLevel = (actor: Actor, act: () => Promise<unknown>) =>
  saving(actor, '/notification-level', act);

async function confirmed(params: {
  readonly host: Actor;
  readonly title: string;
  readonly members: readonly Actor[];
}): Promise<{ readonly brunchId: BrunchId; readonly confirmedPlace: string }> {
  const brunchId = await createBrunch({
    host: params.host.user,
    title: params.title,
    locations: [fixturePlaces.sunnySide, fixturePlaces.harborBistro],
    times: [daysFromNow(10), daysFromNow(11)],
  });
  for (const member of params.members) {
    await addAttendee({ brunchId, host: params.host.user, user: member.user, response: 'yes' });
  }
  return { brunchId, confirmedPlace: (await listOptions(brunchId)).locations[0]?.name ?? '' };
}

async function confirmIt(host: Actor, brunchId: BrunchId): Promise<void> {
  const options = await listOptions(brunchId);
  const response = await post(host, `/api/v1/brunches/${brunchId}/confirm`, {
    locationId: options.locations[0]?.id,
    timeId: options.times[0]?.id,
  });
  expect(response.status()).toBe(200);
}

test.describe('B6 — a switch silences its own channel only, and the choice is kept', () => {
  test('email off still gives the row; in-app off still gives the email; the footer says how to want fewer', async ({
    makeActor,
  }) => {
    // three people, the settings page twice and a wait for each email, row and queue run: more than 30 s when the whole suite is running.
    test.slow();
    const host = await makeActor('host');
    const ann = await makeActor('ann');
    const bea = await makeActor('bea');
    const title = `Chosen Brunch ${uniqueSuffix()}`;
    const { brunchId } = await confirmed({ host, title, members: [ann, bea] });

    // Ann: no email when a brunch is on. The switch holds across a reload.
    await openSettings(ann);
    const annEmail = switchFor(ann, 'A brunch is on, by email');
    await expect(annEmail).toBeChecked();
    await savingSwitch(ann, () => annEmail.click());
    await expect(annEmail).not.toBeChecked();
    await ann.page.reload();
    await expect(switchFor(ann, 'A brunch is on, by email')).not.toBeChecked();
    await expect(switchFor(ann, 'A brunch is on, in the app')).toBeChecked();

    // Bea: nothing in the app when a brunch is on.
    await openSettings(bea);
    await savingSwitch(bea, () => switchFor(bea, 'A brunch is on, in the app').click());
    await expect(switchFor(bea, 'A brunch is on, in the app')).not.toBeChecked();
    await bea.page.reload();
    await expect(switchFor(bea, 'A brunch is on, in the app')).not.toBeChecked();

    await confirmIt(host, brunchId);

    // Bea's email arrives and carries the ways to want fewer; Ann's row arrives.
    const [beasEmail] = await waitForEmails({ to: bea.user.email, count: 1 });
    expect(beasEmail?.html).toContain(`/brunch/${brunchId}#notifications`);
    expect(beasEmail?.html).toContain('/settings/notifications');
    await waitForNotifications({ userId: ann.user.id, brunchId, count: 1 });

    // Everything has been handled; now what was switched off is shown not to have happened.
    await waitForRuns({ event: 'brunch/confirmed', brunchId, runs: 2 });
    expect(await emailsTo(ann.user.email)).toHaveLength(0);
    expect(await getDb().notification.count({ where: { userId: bea.user.id, brunchId } })).toBe(0);

    await ann.page.goto('/notifications');
    await expect(inboxRow(ann.page, `${title} is on`)).toBeVisible();
    await bea.page.goto('/notifications');
    await expect(bea.page.getByRole('heading', { name: EMPTY_INBOX_HEADLINE })).toBeVisible();
    await expectBell(bea.page, 0);
  });

  test('an invitation: email off for an account is silent, and an address with no account still gets it', async ({
    makeActor,
  }) => {
    // two invites through the real queue and a wait for each email, row and queue run: more than 30 s when the whole suite is running.
    test.slow();
    const host = await makeActor('host');
    const ann = await makeActor('ann');
    const brunchId = await createBrunch({
      host: host.user,
      title: `Invite Choice ${uniqueSuffix()}`,
    });
    const stranger = `no-account-${uniqueSuffix()}@example.com`;

    await openSettings(ann);
    await savingSwitch(ann, () => switchFor(ann, 'Someone invites you, by email').click());
    await expect(switchFor(ann, 'Someone invites you, by email')).not.toBeChecked();
    await ann.page.reload();
    await expect(switchFor(ann, 'Someone invites you, by email')).not.toBeChecked();

    await host.page.goto(`/brunch/${brunchId}`);
    for (const address of [ann.user.email, stranger]) {
      await host.page.getByLabel('Invite more people').fill(address);
      await host.page.getByRole('button', { name: 'Round up the crew' }).click();
      await expect(host.page.getByRole('listitem').filter({ hasText: address })).toContainText(
        'pending',
      );
    }

    // The address with no account gets its email; Ann's row arrives; Ann's email never does.
    const [strangers] = await waitForEmails({ to: stranger, count: 1 });
    expect(strangers?.html).toContain('/settings/notifications');
    await waitForNotifications({ userId: ann.user.id, brunchId, count: 1 });
    await waitForRuns({ event: 'invite/sent', brunchId, runs: 4, events: 2 });
    expect(await emailsTo(ann.user.email)).toHaveLength(0);
    // Nothing on the host's invite list tells the host Ann turned anything off.
    await host.page.reload();
    await expect(
      host.page.getByRole('listitem').filter({ hasText: ann.user.email }),
    ).not.toContainText(/didn.t go|failed|off/i);
  });
});

test.describe('B7 — muting a brunch', () => {
  test('muted hears nothing about it, just big stuff keeps the big stuff, and the email link goes to the control', async ({
    makeActor,
  }) => {
    // four people, three pages and a wait for each email, row and queue run: more than 30 s when the whole suite is running.
    test.slow();
    const host = await makeActor('host');
    const ann = await makeActor('ann');
    const bea = await makeActor('bea');
    const cy = await makeActor('cy');
    const title = `Quiet Brunch ${uniqueSuffix()}`;
    const { brunchId } = await confirmed({ host, title, members: [ann, bea, cy] });
    const page = `/brunch/${brunchId}`;

    // The control is on the brunch page, says what each choice does, and holds across a reload.
    await ann.page.goto(page);
    const group = ann.page.getByRole('group', { name: 'Notifications for this brunch' });
    await expect(group.getByRole('radio', { name: /^All/ })).toBeChecked();
    await savingLevel(ann, () => group.getByRole('radio', { name: /^Muted/ }).check());
    await expect(group.getByRole('radio', { name: /^Muted/ })).toBeChecked();
    await ann.page.reload();
    await expect(
      ann.page
        .getByRole('group', { name: 'Notifications for this brunch' })
        .getByRole('radio', { name: /^Muted/ }),
    ).toBeChecked();

    await bea.page.goto(page);
    await savingLevel(bea, () => bea.page.getByRole('radio', { name: /^Just big stuff/ }).check());
    await expect(bea.page.getByRole('radio', { name: /^Just big stuff/ })).toBeChecked();

    // The host sees the note that a failed invite always gets through; a member does not.
    await host.page.goto(page);
    await expect(
      host.page.getByText("You'll still hear when one of your invites doesn't go through."),
    ).toBeVisible();
    await expect(
      ann.page.getByText("You'll still hear when one of your invites doesn't go through."),
    ).toHaveCount(0);

    await confirmIt(host, brunchId);

    // Cy (all) and Bea (just big stuff) are told it is on, in the app and by email; Ann is not.
    await waitForEmails({ to: cy.user.email, count: 1 });
    await waitForEmails({ to: bea.user.email, count: 1 });
    await waitForNotifications({ userId: cy.user.id, brunchId, count: 1 });
    await waitForNotifications({ userId: bea.user.id, brunchId, count: 1 });
    await waitForRuns({ event: 'brunch/confirmed', brunchId, runs: 2 });
    expect(await emailsTo(ann.user.email)).toHaveLength(0);
    expect(await getDb().notification.count({ where: { userId: ann.user.id, brunchId } })).toBe(0);

    // The link in a brunch email lands on this brunch with the control in view.
    const [forCy] = await emailsTo(cy.user.email);
    const mute = forCy?.html.match(/href="([^"]*#notifications)"/)?.[1];
    expect(mute, 'the email has a mute link').toBeDefined();
    await cy.page.goto(mute ?? '/');
    await expect(cy.page).toHaveURL(`${page}#notifications`);
    await expect(
      cy.page
        .getByRole('group', { name: 'Notifications for this brunch' })
        .getByRole('radio', { name: /^All/ }),
    ).toBeChecked();

    // A host who muted their own brunch is not told of the replies they asked not to hear about.
    await savingLevel(host, () => host.page.getByRole('radio', { name: /^Muted/ }).check());
    await expect(host.page.getByRole('radio', { name: /^Muted/ })).toBeChecked();
    const replied = await post(bea, `/api/v1/brunches/${brunchId}/rsvp`, { response: 'maybe' });
    expect(replied.status(), await replied.text()).toBe(200);
    await waitForRuns({ event: 'attendee/rsvp.changed', brunchId, runs: 1 });
    expect(await getDb().notification.count({ where: { userId: host.user.id, brunchId } })).toBe(0);
    await host.page.goto('/notifications');
    await expect(inboxRows(host.page)).toHaveCount(0);
  });

  test('a failed change goes back with a toast, and an outsider cannot reach the control', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const ann = await makeActor('ann');
    const stranger = await makeActor('stranger');
    const { brunchId } = await confirmed({
      host,
      title: `Mute Fails ${uniqueSuffix()}`,
      members: [ann],
    });

    await ann.page.goto(`/brunch/${brunchId}`);
    await ann.page.route('**/notification-level', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'internal', message: 'boom' } }),
      }),
    );
    // click(), not check(): the choice is undone at once, which check() would report as a failure.
    await ann.page.getByRole('radio', { name: /^Muted/ }).click();
    await expect(toast(ann.page, TOAST_WORDS.wentSideways)).toBeVisible();
    await expect(ann.page.getByRole('radio', { name: /^All/ })).toBeChecked();

    // Someone who is not in the brunch gets the same page as for a made-up one: no control at all.
    await stranger.page.goto(`/brunch/${brunchId}`);
    await expect(stranger.page.getByRole('radio', { name: /^Muted/ })).toHaveCount(0);
    await expect(stranger.page.getByText("This table's empty.")).toBeVisible();
  });
});

test.describe('B12 — the settings page', () => {
  test('lists only what the app does, grouped; a switch that fails goes back with a toast; the keyboard keeps its place', async ({
    makeActor,
  }) => {
    const ann = await makeActor('ann');
    await openSettings(ann);

    for (const heading of ['Your brunches', 'Reminders', 'When you host']) {
      await expect(ann.page.getByRole('heading', { level: 2, name: heading })).toBeVisible();
    }
    // Four lines have an email, seven are in the app; nothing for running late or host transfers.
    await expect(ann.page.getByRole('switch', { name: /, by email$/ })).toHaveCount(4);
    await expect(ann.page.getByRole('switch', { name: /, in the app$/ })).toHaveCount(7);
    await expect(ann.page.getByText(/running late|transfer/i)).toHaveCount(0);

    // A failed save: the switch goes back, with the words for what happened.
    const replies = switchFor(ann, 'Replies and votes, in the app');
    await expect(replies).toBeChecked();
    await ann.page.route('**/api/v1/notification-preferences', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'internal', message: 'boom' } }),
      }),
    );
    await replies.click();
    await expect(toast(ann.page, TOAST_WORDS.wentSideways)).toBeVisible();
    await expect(replies).toBeChecked();

    // Offline says so, in the same place.
    await ann.page.unroute('**/api/v1/notification-preferences');
    await ann.context.setOffline(true);
    await replies.click();
    await expect(toast(ann.page, "Looks like you're offline.")).toBeVisible();
    await expect(replies).toBeChecked();
    await ann.context.setOffline(false);

    // With the keyboard: Space flips it, it saves, and the focus stays on the switch.
    await replies.focus();
    await savingSwitch(ann, () => ann.page.keyboard.press('Space'));
    await expect(replies).not.toBeChecked();
    await expect(replies).toBeFocused();
    await ann.page.reload();
    await expect(switchFor(ann, 'Replies and votes, in the app')).not.toBeChecked();

    // The person's choices are their own.
    const bea = await makeActor('bea');
    await openSettings(bea);
    await expect(switchFor(bea, 'Replies and votes, in the app')).toBeChecked();
  });
});
