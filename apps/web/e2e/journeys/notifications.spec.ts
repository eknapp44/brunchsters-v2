import { createBrunch, uniqueSuffix } from '../support/factories';
import { expect, test, type Actor } from '../support/fixtures';
import {
  EMPTY_INBOX_HEADLINE,
  MARK_ALL_READ,
  OLDER,
  bell,
  expectBell,
  expectUnread,
  inboxRow,
  inboxRows,
  unreadCountInDb,
  waitForNotifications,
} from '../support/inbox';
import {
  afterTheHold,
  announceCancellation,
  bringBackBrunch,
  callOffBrunch,
} from '../support/lifecycle';
import { giveNotification } from '../support/notifications';
import { fixturePlaces } from '../support/places';
import { TOAST_WORDS, toast } from '../support/toasts';
import { daysFromNow } from '../support/time';
import { addAttendee, listOptions } from '../support/voting';

// Journeys B1 to B4 (spec 0015 M4): the bell and the inbox, through the real queue. What happens
// on a brunch becomes a row (B13 proves that in the database); these journeys prove what a person
// sees and does with it. Every wait is for something to exist, never a sleep.

const post = (actor: Actor, path: string, data?: unknown) =>
  actor.context.request.post(path, data === undefined ? {} : { data });
const put = (actor: Actor, path: string, data: unknown) =>
  actor.context.request.put(path, { data });

async function votingBrunch(params: { readonly host: Actor; readonly title: string }) {
  const brunchId = await createBrunch({
    host: params.host.user,
    title: params.title,
    locations: [fixturePlaces.sunnySide, fixturePlaces.harborBistro],
    times: [daysFromNow(10), daysFromNow(11)],
  });
  return { brunchId, options: await listOptions(brunchId) };
}

test.describe('B1 — the host hears what happened on the brunch, grouped, and a read row stays read until there is news', () => {
  test('replies and votes are one row each; opening a row marks it read and lands on the brunch; a later vote makes it unread again', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const ann = await makeActor('ann');
    const bea = await makeActor('bea');
    const title = `Grouped Brunch ${uniqueSuffix()}`;
    const { brunchId, options } = await votingBrunch({ host, title });
    await addAttendee({ brunchId, host: host.user, user: ann.user, response: 'yes' });
    await addAttendee({ brunchId, host: host.user, user: bea.user, response: 'yes' });
    const b = `/api/v1/brunches/${brunchId}`;
    const vote = { optionIds: [options.locations[0]?.id] };

    // Two replies and one vote: two rows, however many people.
    await post(ann, `${b}/rsvp`, { response: 'maybe' });
    await post(bea, `${b}/rsvp`, { response: 'maybe' });
    await put(ann, `${b}/votes/locations`, vote);
    await waitForNotifications({ userId: host.user.id, brunchId, count: 2 });

    await host.page.goto('/dashboard');
    await expectBell(host.page, 2);
    await bell(host.page).click();
    await expect(host.page.getByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible();
    await expect(inboxRows(host.page)).toHaveCount(2);
    const replies = inboxRow(host.page, `2 new replies on ${title}`);
    const votes = inboxRow(host.page, `1 new vote on ${title}`);
    await expectUnread(replies, true);
    await expectUnread(votes, true);

    // Looking at the page marked nothing.
    expect(await unreadCountInDb(host.user.id)).toBe(2);

    // Opening a row goes to the brunch and reads it.
    await replies.click();
    await expect(host.page).toHaveURL(`/brunch/${brunchId}`);
    await expect.poll(() => unreadCountInDb(host.user.id)).toBe(1);
    await host.page.goto('/notifications');
    await expectUnread(inboxRow(host.page, `2 new replies on ${title}`), false);
    await expectUnread(inboxRow(host.page, `1 new vote on ${title}`), true);
    await expectBell(host.page, 1);

    // Read the votes row too, then more news: it is unread again, counting from the news.
    await inboxRow(host.page, `1 new vote on ${title}`).click();
    await expect(host.page).toHaveURL(`/brunch/${brunchId}`);
    await expect.poll(() => unreadCountInDb(host.user.id)).toBe(0);
    await put(bea, `${b}/votes/locations`, vote);
    await expect.poll(() => unreadCountInDb(host.user.id)).toBe(1);

    await host.page.goto('/notifications');
    await expect(inboxRows(host.page)).toHaveCount(2);
    await expectUnread(inboxRow(host.page, `1 new vote on ${title}`), true);
    await expectBell(host.page, 1);
  });
});

test.describe('B2 — a confirmed brunch tells the members, not the host', () => {
  test('the member has "is on" with the place and time; the host has nothing', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const ann = await makeActor('ann');
    const title = `Locked In ${uniqueSuffix()}`;
    const { brunchId, options } = await votingBrunch({ host, title });
    await addAttendee({ brunchId, host: host.user, user: ann.user, response: 'yes' });

    const confirmed = await post(host, `/api/v1/brunches/${brunchId}/confirm`, {
      locationId: options.locations[0]?.id,
      timeId: options.times[0]?.id,
    });
    expect(confirmed.status()).toBe(200);
    await waitForNotifications({ userId: ann.user.id, brunchId, count: 1 });

    await ann.page.goto('/notifications');
    const row = inboxRow(ann.page, `${title} is on`);
    await expect(row).toBeVisible();
    // The place that was confirmed (the first option in the list's own order).
    await expect(row).toContainText(options.locations[0]?.name ?? 'no place');
    await expectUnread(row, true);
    await expectBell(ann.page, 1);

    await row.click();
    await expect(ann.page).toHaveURL(`/brunch/${brunchId}`);

    // The host did it: no bell count, and an inbox that invites them to do something.
    await host.page.goto('/notifications');
    await expectBell(host.page, 0);
    await expect(host.page.getByRole('heading', { name: EMPTY_INBOX_HEADLINE })).toBeVisible();
    await expect(inboxRows(host.page)).toHaveCount(0);
    await expect(host.page.getByRole('link', { name: 'Plan a Brunch' })).toBeVisible();
    await expect(host.page.getByRole('button', { name: MARK_ALL_READ })).toHaveCount(0);
  });
});

test.describe('B3 — called off and back on reach the inbox only when people were told', () => {
  test('a brunch brought back inside the hold says nothing; one that stood is called off, then back on', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const ann = await makeActor('ann');
    const decliner = await makeActor('decliner');

    // Changed my mind inside the hold: the called-off event still arrives, and finds it open again.
    const quietTitle = `Changed My Mind ${uniqueSuffix()}`;
    const quiet = await createBrunch({ host: host.user, title: quietTitle });
    await addAttendee({ brunchId: quiet, host: host.user, user: ann.user, response: 'yes' });
    const quietAt = await callOffBrunch({
      brunchId: quiet,
      host: host.user,
      at: afterTheHold(),
      announce: false,
    });
    await bringBackBrunch({ brunchId: quiet, host: host.user, announce: false });
    await announceCancellation({ brunchId: quiet, cancelledAt: quietAt });

    // A brunch that really is called off, and then brought back.
    const title = `Really Off ${uniqueSuffix()}`;
    const real = await createBrunch({ host: host.user, title });
    await addAttendee({ brunchId: real, host: host.user, user: decliner.user, response: 'no' });
    await addAttendee({ brunchId: real, host: host.user, user: ann.user, response: 'yes' });
    await callOffBrunch({ brunchId: real, host: host.user, at: afterTheHold() });
    await waitForNotifications({ userId: ann.user.id, brunchId: real, count: 1 });
    await bringBackBrunch({ brunchId: real, host: host.user });
    await waitForNotifications({ userId: ann.user.id, brunchId: real, count: 2 });

    await ann.page.goto('/notifications');
    await expect(inboxRows(ann.page)).toHaveCount(2);
    await expect(inboxRow(ann.page, `called off ${title}`)).toContainText(
      'No worries — these things happen.',
    );
    await expect(inboxRow(ann.page, `${title} is back on`)).toBeVisible();
    // The brunch brought back inside its hold is nowhere in it.
    await expect(ann.page.getByText(quietTitle)).toHaveCount(0);
    await expectBell(ann.page, 2);

    // The person who said no, and the host who did it, hear nothing.
    for (const actor of [decliner, host]) {
      await actor.page.goto('/notifications');
      await expectBell(actor.page, 0);
      await expect(inboxRows(actor.page)).toHaveCount(0);
    }
  });
});

test.describe('B4 — the bell keeps its number, marking read can fail, and nothing outlives the person', () => {
  test('mark all read: the number drops at once, a failure puts it back with a toast, and viewing marks nothing', async ({
    makeActor,
  }) => {
    const ann = await makeActor('ann');
    for (let n = 0; n < 3; n += 1) await giveNotification({ user: ann.user });

    await ann.page.goto('/dashboard');
    await expectBell(ann.page, 3);
    await expect(bell(ann.page)).toContainText('3');

    // Going to the inbox marks nothing.
    await bell(ann.page).click();
    await expect(inboxRows(ann.page)).toHaveCount(3);
    expect(await unreadCountInDb(ann.user.id)).toBe(3);
    await expectBell(ann.page, 3);

    // The route fails: the number is back, a toast says so, and the rows are still unread.
    await ann.page.route('**/api/v1/notifications/read', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'internal', message: 'boom' } }),
      }),
    );
    await ann.page.getByRole('button', { name: MARK_ALL_READ }).click();
    await expect(toast(ann.page, TOAST_WORDS.wentSideways)).toBeVisible();
    await expectBell(ann.page, 3);
    expect(await unreadCountInDb(ann.user.id)).toBe(3);

    // Offline says so too, in the same place.
    await ann.page.unroute('**/api/v1/notifications/read');
    await ann.context.setOffline(true);
    await ann.page.getByRole('button', { name: MARK_ALL_READ }).click();
    await expect(toast(ann.page, "Looks like you're offline.")).toBeVisible();
    await expectBell(ann.page, 3);
    await ann.context.setOffline(false);

    // And then it works: the bell has no number, every row is read, and the button has nothing to do.
    await ann.page.getByRole('button', { name: MARK_ALL_READ }).click();
    await expectBell(ann.page, 0);
    // Nothing left to mark, and the button the keyboard just pressed still has the focus.
    await expect(toast(ann.page, TOAST_WORDS.allCaughtUp)).toBeVisible();
    await expect(ann.page.getByRole('button', { name: MARK_ALL_READ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expectUnread(inboxRows(ann.page).first(), false);
    expect(await unreadCountInDb(ann.user.id)).toBe(0);
  });

  test('the number follows the server: on the minute, and when the person comes back to the tab, but never from a hidden tab', async ({
    makeActor,
  }) => {
    const ann = await makeActor('ann');
    // Every request the bell makes for its number, counted as it is sent: "it did not ask" is a
    // count that did not move, not a bell that has not changed yet (which is true before any answer).
    const asked: string[] = [];
    ann.page.on('request', (request) => {
      if (request.url().includes('/api/v1/notifications/unread-count')) asked.push(request.url());
    });
    await ann.page.clock.install();
    // The first answer is waited for, not just the first question: the server counts when it
    // answers, so news added before then would already be in the number.
    const firstAnswer = ann.page.waitForResponse((response) =>
      response.url().includes('/api/v1/notifications/unread-count'),
    );
    await ann.page.goto('/dashboard');
    await firstAnswer;
    await expectBell(ann.page, 0);
    expect(asked).toHaveLength(1);

    // News arrives while the page is open. A hidden tab does not ask.
    await giveNotification({ user: ann.user });
    await ann.page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    });
    await ann.page.clock.fastForward(61_000);
    await ann.page.clock.runFor(100);
    expect(asked).toHaveLength(1);
    await expectBell(ann.page, 0);

    // Visible again, the next minute asks.
    await ann.page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    });
    await ann.page.clock.fastForward(61_000);
    await expectBell(ann.page, 1);
    expect(asked).toHaveLength(2);

    // More news, and coming back to the tab asks at once (after the short gap that stops flicker).
    await giveNotification({ user: ann.user });
    await ann.page.clock.fastForward(20_000);
    await ann.page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expectBell(ann.page, 2);
  });

  test('the number is the signed-in person’s own, and signing out takes the bell away', async ({
    makeActor,
  }) => {
    const ann = await makeActor('ann');
    const bea = await makeActor('bea');
    await giveNotification({ user: ann.user });
    await giveNotification({ user: bea.user });
    await giveNotification({ user: bea.user });

    await ann.page.goto('/dashboard');
    await bea.page.goto('/dashboard');
    await expectBell(ann.page, 1);
    await expectBell(bea.page, 2);

    await ann.page.getByRole('button', { name: 'Sign out' }).click();
    await expect(ann.page).toHaveURL('/');
    await expect(bell(ann.page)).toHaveCount(0);
  });

  test('an inbox longer than a page offers the older ones, and has them', async ({ makeActor }) => {
    const ann = await makeActor('ann');
    // Spread over time, so "older" has an order to follow.
    for (let n = 0; n < 31; n += 1) {
      await giveNotification({ user: ann.user, at: new Date(Date.now() - (n + 1) * 60_000) });
    }

    await ann.page.goto('/notifications');
    await expect(inboxRows(ann.page)).toHaveCount(30);
    await ann.page.getByRole('link', { name: OLDER }).click();
    await expect(inboxRows(ann.page)).toHaveCount(1);
    await expect(ann.page.getByRole('link', { name: OLDER })).toHaveCount(0);
  });
});
