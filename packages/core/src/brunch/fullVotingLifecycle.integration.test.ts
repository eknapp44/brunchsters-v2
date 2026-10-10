import { createDb } from '@brunchsters/database';
import type { BrunchLocationId, BrunchTimeId, InviteToken, UserId } from '@brunchsters/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { respondToInvite } from '../invite/respondToInvite';
import { sendInvites } from '../invite/sendInvites';
import { NoopEventBus } from '../events/NoopEventBus';
import { addTime } from './addTime';
import { castTimeBallot } from './castTimeBallot';
import { closeVoting } from './closeVoting';
import { confirmBrunch } from './confirmBrunch';
import { createBrunch } from './createBrunch';
import { getBrunchVoting } from './getBrunchVoting';

// Requires: supabase start + seeded lookup tables (pnpm db:seed).
//
// Spec 0005's acceptance criteria call for "full add-options -> vote ->
// change vote -> close -> confirm lifecycle" as one integration test. Every
// other integration file in this spec tests one milestone's own slice
// (options, voting, closing, confirming) against its own fixtures — none of
// them chains all five stages against the same brunch. This file is that
// missing chain: a single brunch, carried through every stage in order,
// checked at each step with the real services and real Postgres.
const RUN_ID = Date.now();
const HOST_EMAIL = `integration-lifecycle-host-${RUN_ID}@example.com`;
const VOTER_1_EMAIL = `integration-lifecycle-voter1-${RUN_ID}@example.com`;
const VOTER_2_EMAIL = `integration-lifecycle-voter2-${RUN_ID}@example.com`;

const db = createDb();
const eventBus = new NoopEventBus();
const createdBrunchIds: string[] = [];

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('Expected a row, found none');
  return value;
}

afterAll(async () => {
  await db.brunchLocationVote.deleteMany({
    where: { brunchLocation: { brunchId: { in: createdBrunchIds } } },
  });
  await db.brunchTimeVote.deleteMany({
    where: { brunchTime: { brunchId: { in: createdBrunchIds } } },
  });
  await db.brunchLocation.deleteMany({ where: { brunchId: { in: createdBrunchIds } } });
  await db.brunchTime.deleteMany({ where: { brunchId: { in: createdBrunchIds } } });
  await db.brunchAttendee.deleteMany({ where: { brunchId: { in: createdBrunchIds } } });
  await db.brunchInvite.deleteMany({ where: { brunchId: { in: createdBrunchIds } } });
  await db.brunch.deleteMany({ where: { id: { in: createdBrunchIds } } });
  await db.user.deleteMany({
    where: { email: { in: [HOST_EMAIL, VOTER_1_EMAIL, VOTER_2_EMAIL] } },
  });
});

describe('full voting lifecycle (integration — real Postgres)', () => {
  it('carries one brunch through add-options -> vote -> change vote -> close -> confirm', async () => {
    const host = await db.user.create({
      data: { name: 'Integration Lifecycle Host', email: HOST_EMAIL },
    });
    const hostId = host.id as UserId;
    const voter1 = await db.user.create({
      data: { name: 'Integration Lifecycle Voter 1', email: VOTER_1_EMAIL },
    });
    const voter1Id = voter1.id as UserId;
    const voter2 = await db.user.create({
      data: { name: 'Integration Lifecycle Voter 2', email: VOTER_2_EMAIL },
    });
    const voter2Id = voter2.id as UserId;

    // 1. Create a brunch with one location and one time — host_decides mode
    // for both, exactly like a brunch that skipped the wizard's vote option.
    const scheduledAtFirst = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    const created = await createBrunch(
      {
        title: 'Full Lifecycle Brunch',
        hostId,
        locations: [
          {
            placeId: `place-a-${RUN_ID}`,
            placeName: 'Cafe A',
            placeAddress: '1 Main St',
            placeUrl: 'https://maps.google.com/?cid=a',
            timezone: 'America/Chicago',
          },
        ],
        times: [{ scheduledAt: scheduledAtFirst.toISOString() }],
      },
      { db, eventBus },
    );
    expect(created.isOk()).toBe(true);
    const brunchId = created._unsafeUnwrap().id;
    createdBrunchIds.push(brunchId);

    const invites = await sendInvites(
      { brunchId, invitedById: hostId, emails: [VOTER_1_EMAIL, VOTER_2_EMAIL] },
      { db, eventBus },
    );
    expect(invites.isOk()).toBe(true);

    for (const [email, userId, response] of [
      [VOTER_1_EMAIL, voter1Id, 'yes'],
      [VOTER_2_EMAIL, voter2Id, 'yes'],
    ] as const) {
      const invite = required(
        await db.brunchInvite.findFirst({ where: { brunchId, invitedEmail: email } }),
      );
      const joined = await respondToInvite(
        { token: invite.token as InviteToken, viewerId: userId, response },
        { db, eventBus },
      );
      expect(joined.isOk()).toBe(true);
    }

    // 2. Add a second time — this is the stage that genuinely needed a real
    // spec (0005 M2 exists because createBrunch alone could never do this):
    // the brunch flips from host_decides to group_vote for times.
    const scheduledAtSecond = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000);
    const added = await addTime(
      { brunchId, requestedById: hostId, scheduledAt: scheduledAtSecond.toISOString() },
      { db },
    );
    expect(added.isOk()).toBe(true);

    const timesAfterAdd = await db.brunchTime.findMany({
      where: { brunchId },
      orderBy: { scheduledAt: 'asc' },
    });
    expect(timesAfterAdd).toHaveLength(2);
    const [timeFirst, timeSecond] = timesAfterAdd;
    const timeFirstId = required(timeFirst).id as BrunchTimeId;
    const timeSecondId = required(timeSecond).id as BrunchTimeId;

    const location = required(await db.brunchLocation.findFirst({ where: { brunchId } }));
    const locationId = location.id as BrunchLocationId;

    let voting = await getBrunchVoting({ brunchId, viewerId: hostId }, { db });
    expect(voting?.times.mode).toBe('group_vote');
    expect(voting?.locations.mode).toBe('host_decides');

    // 3. Vote — both voters pick the first time.
    const vote1 = await castTimeBallot(
      { brunchId, voterId: voter1Id, optionIds: [timeFirstId] },
      { db, eventBus },
    );
    expect(vote1.isOk()).toBe(true);
    const vote2 = await castTimeBallot(
      { brunchId, voterId: voter2Id, optionIds: [timeFirstId] },
      { db, eventBus },
    );
    expect(vote2.isOk()).toBe(true);

    voting = await getBrunchVoting({ brunchId, viewerId: hostId }, { db });
    expect(voting?.times.options.find((o) => o.id === timeFirstId)?.voteCount).toBe(2);

    // 4. Change vote — voter 1 moves to the second time.
    const revised = await castTimeBallot(
      { brunchId, voterId: voter1Id, optionIds: [timeSecondId] },
      { db, eventBus },
    );
    expect(revised.isOk()).toBe(true);

    voting = await getBrunchVoting({ brunchId, viewerId: hostId }, { db });
    expect(voting?.times.options.find((o) => o.id === timeFirstId)?.voteCount).toBe(1);
    expect(voting?.times.options.find((o) => o.id === timeSecondId)?.voteCount).toBe(1);

    // 5. Close voting — manually, before any deadline.
    const closed = await closeVoting({ brunchId, requestedById: hostId }, { db });
    expect(closed.isOk()).toBe(true);

    const ballotAfterClose = await castTimeBallot(
      { brunchId, voterId: voter2Id, optionIds: [timeSecondId] },
      { db, eventBus },
    );
    expect(ballotAfterClose._unsafeUnwrapErr()).toEqual({ kind: 'voting_closed' });

    // 6. Confirm — host picks the tied second time (their prerogative) and
    // the only location. Both are now tied at 1 vote, so this also exercises
    // "the host may confirm any option, not just the leader" for real.
    const confirmed = await confirmBrunch(
      { brunchId, requestedById: hostId, locationId, timeId: timeSecondId },
      { db, eventBus },
    );
    expect(confirmed.isOk()).toBe(true);

    const finalBrunch = required(
      await db.brunch.findFirst({ where: { id: brunchId }, include: { status: true } }),
    );
    expect(finalBrunch.status.code).toBe('confirmed');

    const finalLocation = required(
      await db.brunchLocation.findFirst({ where: { id: locationId } }),
    );
    expect(finalLocation.isConfirmed).toBe(true);
    const finalTime = required(await db.brunchTime.findFirst({ where: { id: timeSecondId } }));
    expect(finalTime.isConfirmed).toBe(true);

    const invite1 = required(
      await db.brunchInvite.findFirst({ where: { brunchId, invitedEmail: VOTER_1_EMAIL } }),
    );
    expect(invite1.tokenExpiresAt.toISOString()).toBe(
      new Date(scheduledAtSecond.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    );

    // Confirming again is rejected — the brunch is locked.
    const secondConfirm = await confirmBrunch(
      { brunchId, requestedById: hostId, locationId, timeId: timeFirstId },
      { db, eventBus },
    );
    expect(secondConfirm._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_active' });
  });
});
