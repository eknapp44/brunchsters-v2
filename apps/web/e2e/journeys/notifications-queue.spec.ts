import { getDb } from '../support/db';
import { createBrunch, uniqueSuffix } from '../support/factories';
import { expect, test, type Actor } from '../support/fixtures';
import { inviteRow } from '../support/invites';
import {
  afterTheHold,
  announceCancellation,
  bringBackBrunch,
  callOffBrunch,
} from '../support/lifecycle';
import { fixturePlaces } from '../support/places';
import { daysFromNow } from '../support/time';
import { addAttendee, listOptions } from '../support/voting';
import type { BrunchId, UserId } from '@brunchsters/shared';

// Journey B13 (spec 0015 M2): the notification rows are written through the real queue. No screen
// reads them yet (the bell and inbox arrive in M4), so these journeys read the rows from the
// database: what they prove is the wiring a unit test cannot, that an event the app emits reaches
// its Inngest function and ends as the right row for the right person. Each "nobody" assertion is
// made after a row that does arrive in the same run, so the quiet is observed after the queue has
// demonstrably got past it, never by sleeping.

async function rowsFor(userId: UserId, brunchId: BrunchId) {
  return getDb().notification.findMany({
    where: { userId, brunchId },
    include: { notificationType: true },
    orderBy: { createdAt: 'asc' },
  });
}

async function typesFor(userId: UserId, brunchId: BrunchId): Promise<string[]> {
  return (await rowsFor(userId, brunchId)).map((row) => row.notificationType.code);
}

async function typesEventually(
  userId: UserId,
  brunchId: BrunchId,
  expected: readonly string[],
): Promise<void> {
  await expect
    .poll(async () => (await typesFor(userId, brunchId)).sort())
    .toEqual([...expected].sort());
}

const post = (actor: Actor, path: string, data?: unknown) =>
  actor.context.request.post(path, data === undefined ? {} : { data });
const put = (actor: Actor, path: string, data: unknown) =>
  actor.context.request.put(path, { data });

test.describe('B13 — what happens on a brunch reaches the right inbox through the real queue', () => {
  test('a reply, a vote and a suggestion tell the host; confirming tells the members, not the host', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const ann = await makeActor('ann');
    const decliner = await makeActor('decliner');
    const brunchId = await createBrunch({
      host: host.user,
      title: `Queue Brunch ${uniqueSuffix()}`,
      // Two of each, so there is something to vote on.
      locations: [fixturePlaces.sunnySide, fixturePlaces.harborBistro],
      times: [daysFromNow(10), daysFromNow(11)],
    });
    await addAttendee({ brunchId, host: host.user, user: decliner.user, response: 'no' });
    await addAttendee({ brunchId, host: host.user, user: ann.user, response: 'yes' });
    const b = `/api/v1/brunches/${brunchId}`;
    const options = await listOptions(brunchId);

    // Ann changes her answer and votes: the host hears of each, once, as a count.
    expect((await post(ann, `${b}/rsvp`, { response: 'maybe' })).status()).toBe(200);
    const voted = await put(ann, `${b}/votes/locations`, { optionIds: [options.locations[0]?.id] });
    expect(voted.status(), await voted.text()).toBe(200);
    await typesEventually(host.user.id, brunchId, ['rsvp.received', 'vote.cast']);
    const replies = (await rowsFor(host.user.id, brunchId)).find(
      (row) => row.notificationType.code === 'rsvp.received',
    );
    expect(replies?.data).toMatchObject({ kind: 'rsvp.received', count: 1 });

    // A suggestion that waits for the host is one more row; the suggester hears nothing.
    expect(
      (
        await post(ann, `${b}/location-suggestions`, {
          placeId: fixturePlaces.pacificBrunchHouse.placeId,
          placeName: fixturePlaces.pacificBrunchHouse.name,
          placeAddress: fixturePlaces.pacificBrunchHouse.address,
          placeUrl: fixturePlaces.pacificBrunchHouse.placeUrl,
          timezone: fixturePlaces.pacificBrunchHouse.timezone,
        })
      ).status(),
    ).toBe(201);
    await typesEventually(host.user.id, brunchId, [
      'rsvp.received',
      'vote.cast',
      'location.suggested',
    ]);

    // The host locks it in: Ann is told it is on; the host (who did it) and the person who said
    // no are not. The host's confirmation was the last thing to happen, so once Ann's row is there
    // the queue has gone past the other two.
    expect(
      (
        await post(host, `${b}/confirm`, {
          locationId: options.locations[0]?.id,
          timeId: options.times[0]?.id,
        })
      ).status(),
    ).toBe(200);
    await typesEventually(ann.user.id, brunchId, ['brunch.confirmed']);
    expect(await typesFor(decliner.user.id, brunchId)).toEqual([]);
    expect(await typesFor(host.user.id, brunchId)).not.toContain('brunch.confirmed');
    expect(await typesFor(ann.user.id, brunchId)).not.toContain('location.suggested');
  });

  test('calling off, and bringing back, write the rows only when people were told', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const ann = await makeActor('ann');
    const decliner = await makeActor('decliner');

    // Changed my mind inside the hold: the called-off event still arrives, and finds it open again.
    const quiet = await createBrunch({ host: host.user, title: `Quiet ${uniqueSuffix()}` });
    await addAttendee({ brunchId: quiet, host: host.user, user: ann.user, response: 'yes' });
    const quietAt = await callOffBrunch({
      brunchId: quiet,
      host: host.user,
      at: afterTheHold(),
      announce: false,
    });
    await bringBackBrunch({ brunchId: quiet, host: host.user, announce: false });
    await announceCancellation({ brunchId: quiet, cancelledAt: quietAt });

    // A brunch that really is called off, then brought back.
    const real = await createBrunch({ host: host.user, title: `Really Off ${uniqueSuffix()}` });
    await addAttendee({ brunchId: real, host: host.user, user: decliner.user, response: 'no' });
    await addAttendee({ brunchId: real, host: host.user, user: ann.user, response: 'yes' });
    await callOffBrunch({ brunchId: real, host: host.user, at: afterTheHold() });
    await typesEventually(ann.user.id, real, ['brunch.cancelled']);

    await bringBackBrunch({ brunchId: real, host: host.user });
    await typesEventually(ann.user.id, real, ['brunch.cancelled', 'brunch.reinstated']);

    // A second cancellation is a new row, not a replay.
    await callOffBrunch({ brunchId: real, host: host.user, at: afterTheHold(30) });
    await typesEventually(ann.user.id, real, [
      'brunch.cancelled',
      'brunch.cancelled',
      'brunch.reinstated',
    ]);

    // The brunch brought back inside its hold produced nothing, and nor did the host or the
    // person who said no, at any point.
    expect(await typesFor(ann.user.id, quiet)).toEqual([]);
    expect(await typesFor(host.user.id, real)).toEqual([]);
    expect(await typesFor(decliner.user.id, real)).toEqual([]);
  });

  test('an invitation reaches the inbox of someone who has an account, and only theirs', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const guest = await makeActor('guest');
    const title = `Invitation ${uniqueSuffix()}`;
    const brunchId = await createBrunch({ host: host.user, title });
    const stranger = `no-account-${uniqueSuffix()}@example.com`;

    await host.page.goto(`/brunch/${brunchId}`);
    // The address with no account first: if it wrongly wrote a row, it would be there by the time
    // the guest's arrives.
    for (const address of [stranger, guest.user.email]) {
      await host.page.getByLabel('Invite more people').fill(address);
      await host.page.getByRole('button', { name: 'Round up the crew' }).click();
      await expect(inviteRow(host.page, address)).toContainText('pending');
    }

    await typesEventually(guest.user.id, brunchId, ['invite.received']);
    const [row] = await rowsFor(guest.user.id, brunchId);
    const invite = await getDb().brunchInvite.findFirstOrThrow({
      where: { brunchId, invitedEmail: guest.user.email },
    });
    // The row names the invite, never its token.
    expect(row?.data).toMatchObject({ kind: 'invite.received', inviteId: invite.id });
    expect(JSON.stringify(row)).not.toContain(invite.token);
    expect(await getDb().notification.count({ where: { userId: host.user.id } })).toBe(0);
    expect(
      await getDb().notification.count({ where: { brunchId, userId: { not: guest.user.id } } }),
    ).toBe(0);
  });
});
