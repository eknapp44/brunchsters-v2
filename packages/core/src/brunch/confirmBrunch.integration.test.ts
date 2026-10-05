import { createDb } from '@brunchsters/database';
import type {
  BrunchId,
  BrunchLocationId,
  BrunchTimeId,
  InviteToken,
  UserId,
} from '@brunchsters/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { respondToInvite } from '../invite/respondToInvite';
import { sendInvites } from '../invite/sendInvites';
import { NoopEventBus } from '../events/NoopEventBus';
import { castLocationBallot } from './castLocationBallot';
import { confirmBrunch } from './confirmBrunch';
import { createBrunch } from './createBrunch';

// Requires: supabase start + seeded lookup tables (pnpm db:seed).
const RUN_ID = Date.now();
const HOST_EMAIL = `integration-confirm-host-${RUN_ID}@example.com`;
const VOTER_EMAIL = `integration-confirm-voter-${RUN_ID}@example.com`;

const db = createDb();
const eventBus = new NoopEventBus();

let hostId: UserId;
let voterId: UserId;
const createdBrunchIds: string[] = [];

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('Expected a row, found none');
  return value;
}

beforeAll(async () => {
  const host = await db.user.create({
    data: { name: 'Integration Confirm Host', email: HOST_EMAIL },
  });
  hostId = host.id as UserId;
  const voter = await db.user.create({
    data: { name: 'Integration Confirm Voter', email: VOTER_EMAIL },
  });
  voterId = voter.id as UserId;
});

afterAll(async () => {
  await db.brunchLocationVote.deleteMany({
    where: { brunchLocation: { brunchId: { in: createdBrunchIds } } },
  });
  await db.brunchLocation.deleteMany({ where: { brunchId: { in: createdBrunchIds } } });
  await db.brunchTime.deleteMany({ where: { brunchId: { in: createdBrunchIds } } });
  await db.brunchAttendee.deleteMany({ where: { brunchId: { in: createdBrunchIds } } });
  await db.brunchInvite.deleteMany({ where: { brunchId: { in: createdBrunchIds } } });
  await db.brunch.deleteMany({ where: { id: { in: createdBrunchIds } } });
  await db.user.deleteMany({ where: { email: { in: [HOST_EMAIL, VOTER_EMAIL] } } });
});

async function createConfirmableBrunch(title: string): Promise<{
  brunchId: BrunchId;
  locationA: BrunchLocationId;
  locationB: BrunchLocationId;
  timeA: BrunchTimeId;
  timeB: BrunchTimeId;
  scheduledAtA: Date;
}> {
  const scheduledAtA = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const scheduledAtB = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);

  const brunch = await createBrunch(
    {
      title,
      hostId,
      locations: [
        {
          placeId: `place-a-${RUN_ID}-${title}`,
          placeName: 'Cafe A',
          placeAddress: '1 Main St',
          placeUrl: 'https://maps.google.com/?cid=a',
          timezone: 'America/Chicago',
        },
        {
          placeId: `place-b-${RUN_ID}-${title}`,
          placeName: 'Cafe B',
          placeAddress: '2 Main St',
          placeUrl: 'https://maps.google.com/?cid=b',
          timezone: 'America/Chicago',
        },
      ],
      times: [
        { scheduledAt: scheduledAtA.toISOString() },
        { scheduledAt: scheduledAtB.toISOString() },
      ],
    },
    { db, eventBus },
  );
  expect(brunch.isOk()).toBe(true);
  const brunchId = brunch._unsafeUnwrap().id;
  createdBrunchIds.push(brunchId);

  const invites = await sendInvites(
    { brunchId, invitedById: hostId, emails: [VOTER_EMAIL] },
    { db, eventBus },
  );
  expect(invites.isOk()).toBe(true);

  const invite = required(
    await db.brunchInvite.findFirst({ where: { brunchId, invitedEmail: VOTER_EMAIL } }),
  );
  const joined = await respondToInvite(
    { token: invite.token as InviteToken, viewerId: voterId, response: 'yes' },
    { db, eventBus },
  );
  expect(joined.isOk()).toBe(true);

  const locations = await db.brunchLocation.findMany({
    where: { brunchId },
    orderBy: { createdAt: 'asc' },
  });
  const times = await db.brunchTime.findMany({
    where: { brunchId },
    orderBy: { scheduledAt: 'asc' },
  });
  const [locA, locB] = locations;
  const [timeA, timeB] = times;

  return {
    brunchId,
    locationA: required(locA).id as BrunchLocationId,
    locationB: required(locB).id as BrunchLocationId,
    timeA: required(timeA).id as BrunchTimeId,
    timeB: required(timeB).id as BrunchTimeId,
    scheduledAtA,
  };
}

describe('confirmBrunch (integration — real Postgres)', () => {
  it('writes all five changes atomically', async () => {
    const { brunchId, locationA, timeA, scheduledAtA } = await createConfirmableBrunch('atomic');

    const result = await confirmBrunch(
      { brunchId, requestedById: hostId, locationId: locationA, timeId: timeA },
      { db, eventBus },
    );
    expect(result.isOk()).toBe(true);

    const location = required(await db.brunchLocation.findFirst({ where: { id: locationA } }));
    expect(location.isConfirmed).toBe(true);
    expect(location.confirmedAt).not.toBeNull();

    const time = required(await db.brunchTime.findFirst({ where: { id: timeA } }));
    expect(time.isConfirmed).toBe(true);
    expect(time.confirmedAt).not.toBeNull();

    const brunch = required(
      await db.brunch.findFirst({ where: { id: brunchId }, include: { status: true } }),
    );
    expect(brunch.status.code).toBe('confirmed');
    expect(brunch.votingClosedAt).not.toBeNull();

    const invite = required(
      await db.brunchInvite.findFirst({ where: { brunchId, invitedEmail: VOTER_EMAIL } }),
    );
    expect(invite.tokenExpiresAt.toISOString()).toBe(
      new Date(scheduledAtA.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    );
  });

  it('rejects a second confirm on an already-confirmed brunch', async () => {
    const { brunchId, locationA, locationB, timeA, timeB } =
      await createConfirmableBrunch('double-confirm');

    const first = await confirmBrunch(
      { brunchId, requestedById: hostId, locationId: locationA, timeId: timeA },
      { db, eventBus },
    );
    expect(first.isOk()).toBe(true);

    const second = await confirmBrunch(
      { brunchId, requestedById: hostId, locationId: locationB, timeId: timeB },
      { db, eventBus },
    );

    expect(second._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_active' });
  });

  it('the partial unique index rejects a second confirmed location inserted directly', async () => {
    const { locationA, locationB } = await createConfirmableBrunch('partial-index');

    await db.brunchLocation.update({
      where: { id: locationA },
      data: { isConfirmed: true },
    });

    await expect(
      db.brunchLocation.update({ where: { id: locationB }, data: { isConfirmed: true } }),
    ).rejects.toThrow();
  });

  it('casting a ballot for the non-chosen option does not block confirming the other', async () => {
    const { brunchId, locationA, locationB, timeA } =
      await createConfirmableBrunch('vote-then-confirm');

    await castLocationBallot(
      { brunchId, voterId: voterId, optionIds: [locationB] },
      { db, eventBus },
    );

    const result = await confirmBrunch(
      { brunchId, requestedById: hostId, locationId: locationA, timeId: timeA },
      { db, eventBus },
    );

    expect(result.isOk()).toBe(true);
  });
});
