import { createBrunch, uniqueSuffix } from '../support/factories';
import { expect, test } from '../support/fixtures';
import { expectBell, inboxRow } from '../support/inbox';
import { emailsTo, waitForEmails } from '../support/mailbox';
import { callOffBrunch, afterTheHold } from '../support/lifecycle';
import { fixturePlaces } from '../support/places';
import { hostSetsDeadline, setDeadlineAsOf, tickScheduler } from '../support/scheduler';
import { createConfirmedBrunch, createVotingBrunch, inviteNewcomer } from '../support/showcase';
import { daysFromNow } from '../support/time';
import { TOAST_WORDS, toast } from '../support/toasts';
import { addAttendee, confirmBrunch, passConfirmedTime } from '../support/voting';
import { getDb } from '../support/db';
import type { BrunchId } from '@brunchsters/shared';

// Journeys B9 and B10 (spec 0015 M7): what the clock does. The real scheduler function runs on the
// real queue, started with a `scheduler/tick` event for one brunch (`support/scheduler.ts`), so the
// journeys neither wait 15 minutes nor touch each other's brunches. What time it is comes from the
// state the journey sets (a deadline close and old, a brunch time long gone), never a faked clock.

const reminderEmails = async (address: string) =>
  (await emailsTo(address)).filter((mail) => mail.subject.includes('closes soon'));

const reminderRows = (userId: string, brunchId: BrunchId) =>
  getDb().notification.count({
    where: { userId, brunchId, notificationType: { code: 'vote.deadline.approaching' } },
  });

async function statusOf(brunchId: BrunchId): Promise<string> {
  const brunch = await getDb().brunch.findFirstOrThrow({
    where: { id: brunchId },
    include: { status: true },
  });
  return brunch.status.code;
}

test.describe('B9 — a deadline reminder goes to the people who still have a vote to cast', () => {
  test('once per deadline, to members who can vote and have not; a moved deadline reminds again; one set just now does not', async ({
    makeActor,
  }) => {
    // a real queue run for each of four ticks, and an email wait on top of the sign-ins: more than 30 s when the whole suite is running.
    test.slow();
    const host = await makeActor('host');
    const voter = await makeActor('voter');
    const maybe = await makeActor('maybe');
    const pending = await makeActor('pending');
    const decliner = await makeActor('decliner');
    const { brunchId, title } = await createVotingBrunch({
      host,
      // `yes` has voted; `maybe` can vote and has not; `pending` has not answered, so cannot vote.
      guests: { yes: voter, maybe, pending },
    });
    await addAttendee({ brunchId, host: host.user, user: decliner.user, response: 'no' });

    // A day before the vote closes, the deadline having been set days ago.
    const deadline = await setDeadlineAsOf({ brunchId, hoursAhead: 5, setDaysAgo: 3 });
    await tickScheduler({ brunchId, ticks: 1 });

    await expect.poll(() => reminderRows(maybe.user.id, brunchId)).toBe(1);
    const [mail] = await waitForEmails({ to: maybe.user.email, count: 1 });
    expect(mail?.subject).toBe(`${title} closes soon — have you voted?`);
    expect(mail?.html).toContain(`/brunch/${brunchId}`);
    expect(await reminderEmails(maybe.user.email)).toHaveLength(1);
    // Not the one who voted, who said no, or who cannot vote yet.
    for (const quiet of [voter, decliner, pending]) {
      expect(await reminderRows(quiet.user.id, brunchId)).toBe(0);
      expect(await reminderEmails(quiet.user.email)).toHaveLength(0);
    }

    // The row words it, and it is the bell's one unread.
    await maybe.page.goto('/notifications');
    await expect(inboxRow(maybe.page, `Last call to vote on ${title}`)).toBeVisible();
    await expectBell(maybe.page, 1);

    // The clock asks again (it does, every 15 minutes): nothing more goes out for the same deadline.
    await tickScheduler({ brunchId, ticks: 2 });
    expect(await reminderRows(maybe.user.id, brunchId)).toBe(1);
    expect(await reminderEmails(maybe.user.email)).toHaveLength(1);

    // The host moves the deadline (set days ago, so it is a different one that counts): reminded again.
    expect(deadline.getTime()).toBeGreaterThan(Date.now());
    await setDeadlineAsOf({ brunchId, hoursAhead: 9, setDaysAgo: 3 });
    await tickScheduler({ brunchId, ticks: 3 });
    await expect.poll(async () => (await reminderEmails(maybe.user.email)).length).toBe(2);
    expect(await reminderRows(maybe.user.id, brunchId)).toBe(2);

    // A deadline the host sets right now, a few hours out, is no news to anyone: no reminder.
    await hostSetsDeadline({ brunchId, host: host.user, hoursAhead: 12 });
    await tickScheduler({ brunchId, ticks: 4 });
    expect(await reminderRows(maybe.user.id, brunchId)).toBe(2);
    expect(await reminderEmails(maybe.user.email)).toHaveLength(2);
  });
});

test.describe('B9b — a deadline chosen when the brunch is made is not reminded about', () => {
  test('a deadline a few hours out, set at creation, sends no last call after the first invites', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const guest = await makeActor('guest');
    const brunchId = await createBrunch({
      host: host.user,
      title: `Tonight ${uniqueSuffix()}`,
      locations: [fixturePlaces.sunnySide, fixturePlaces.harborBistro],
      times: [daysFromNow(3), daysFromNow(4)],
      votingDeadline: new Date(Date.now() + 10 * 3_600_000),
    });
    await addAttendee({ brunchId, host: host.user, user: guest.user, response: 'maybe' });

    await tickScheduler({ brunchId, ticks: 1 });

    expect(await reminderRows(guest.user.id, brunchId)).toBe(0);
    expect(await reminderEmails(guest.user.email)).toHaveLength(0);
  });
});

test.describe('B10 — a brunch that has happened is over, and stays over', () => {
  test('six hours after its time it is over: read-only for everyone, and its invite link says so', async ({
    makeActor,
    page,
  }) => {
    // three sign-ins, a run on the queue and four page loads: more than 30 s when the whole suite is running.
    test.slow();
    const host = await makeActor('host');
    const guest = await makeActor('guest');
    const { brunchId, title } = await createConfirmedBrunch({ host, guest });
    const link = await inviteNewcomer({ host, brunchId });

    // Its time goes by (a day): the clock completes it.
    await passConfirmedTime(brunchId);
    await tickScheduler({ brunchId, ticks: 1 });
    await expect.poll(() => statusOf(brunchId)).toBe('completed');

    // The brunch page says so and offers nothing to change.
    await guest.page.goto(`/brunch/${brunchId}`);
    await expect(guest.page.getByRole('heading', { name: 'Over.' })).toBeVisible();
    await expect(guest.page.getByText('Over', { exact: true })).toBeVisible();
    await expect(guest.page.getByRole('heading', { name: 'You in?' })).toHaveCount(0);

    // The server refuses it too, with the code that says why, not the one for a called-off brunch.
    const refused = await guest.context.request.post(`/api/v1/brunches/${brunchId}/rsvp`, {
      data: { response: 'no' },
    });
    expect(refused.status()).toBe(409);
    expect(((await refused.json()) as { error?: { code?: string } }).error?.code).toBe(
      'brunch_over',
    );

    // The host's manage page has nothing to manage; a link to it from before goes to the same words.
    await host.page.goto(`/brunch/${brunchId}/manage`);
    await expect(host.page.getByRole('heading', { name: 'Over.' })).toBeVisible();
    await expect(host.page.getByRole('button', { name: 'Call it off' })).toHaveCount(0);

    // An invite link to it says it already happened, and offers no RSVP.
    await page.goto(link);
    await expect(page.getByRole('heading', { name: `${title} already happened.` })).toBeVisible();

    // And the clock does not do it twice.
    await tickScheduler({ brunchId, ticks: 2 });
    expect(await statusOf(brunchId)).toBe('completed');
  });

  test('a brunch the host called off before its time passed cannot be brought back after, and is never completed', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const guest = await makeActor('guest');
    const brunchId = await createBrunch({
      host: host.user,
      title: `Late Return ${uniqueSuffix()}`,
      locations: [fixturePlaces.sunnySide],
      times: [daysFromNow(3)],
    });
    await addAttendee({ brunchId, host: host.user, user: guest.user, response: 'yes' });
    await confirmBrunch({
      brunchId,
      host: host.user,
      place: fixturePlaces.sunnySide.name,
      timeIndex: 0,
    });
    await callOffBrunch({ brunchId, host: host.user, at: afterTheHold(), announce: false });
    await passConfirmedTime(brunchId);

    // The clock leaves a called-off brunch alone, however long ago its time was.
    await tickScheduler({ brunchId, ticks: 1 });
    expect(await statusOf(brunchId)).toBe('cancelled');

    // Bringing it back would make it over the moment it came back: refused, with the words, and the
    // page is told so it stays as it is.
    await host.page.goto(`/brunch/${brunchId}/manage`);
    await host.page.getByRole('button', { name: 'Bring it back' }).click();
    await expect(toast(host.page, TOAST_WORDS.brunchOver)).toBeVisible();
    expect(await statusOf(brunchId)).toBe('cancelled');
  });
});
