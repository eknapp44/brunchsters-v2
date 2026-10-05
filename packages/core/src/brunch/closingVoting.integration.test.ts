import { createDb } from '@brunchsters/database';
import type { BrunchId, BrunchLocationId, InviteToken, UserId } from '@brunchsters/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { respondToInvite } from '../invite/respondToInvite';
import { sendInvites } from '../invite/sendInvites';
import { NoopEventBus } from '../events/NoopEventBus';
import { castLocationBallot } from './castLocationBallot';
import { closeVoting } from './closeVoting';
import { createBrunch } from './createBrunch';
import { getBrunchVoting } from './getBrunchVoting';
import { updateVotingDeadline } from './updateVotingDeadline';

// Requires: supabase start + seeded lookup tables (pnpm db:seed).
const RUN_ID = Date.now();
const HOST_EMAIL = `integration-closevoting-host-${RUN_ID}@example.com`;
const VOTER_1_EMAIL = `integration-closevoting-voter1-${RUN_ID}@example.com`;
const VOTER_2_EMAIL = `integration-closevoting-voter2-${RUN_ID}@example.com`;

const db = createDb();
const eventBus = new NoopEventBus();

let hostId: UserId;
let voter1Id: UserId;
let voter2Id: UserId;
const createdBrunchIds: string[] = [];

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('Expected a row, found none');
  return value;
}

beforeAll(async () => {
  const host = await db.user.create({
    data: { name: 'Integration CloseVoting Host', email: HOST_EMAIL },
  });
  hostId = host.id as UserId;
  const voter1 = await db.user.create({
    data: { name: 'Integration CloseVoting Voter 1', email: VOTER_1_EMAIL },
  });
  voter1Id = voter1.id as UserId;
  const voter2 = await db.user.create({
    data: { name: 'Integration CloseVoting Voter 2', email: VOTER_2_EMAIL },
  });
  voter2Id = voter2.id as UserId;
});

afterAll(async () => {
  await db.brunchLocationVote.deleteMany({
    where: { brunchLocation: { brunchId: { in: createdBrunchIds } } },
  });
  await db.brunchLocation.deleteMany({ where: { brunchId: { in: createdBrunchIds } } });
  await db.brunchAttendee.deleteMany({ where: { brunchId: { in: createdBrunchIds } } });
  await db.brunchInvite.deleteMany({ where: { brunchId: { in: createdBrunchIds } } });
  await db.brunch.deleteMany({ where: { id: { in: createdBrunchIds } } });
  await db.user.deleteMany({
    where: { email: { in: [HOST_EMAIL, VOTER_1_EMAIL, VOTER_2_EMAIL] } },
  });
});

// Host + two yes-RSVP voters = 3 eligible attendees (the host counts —
// plan.md's floor-of-3 rationale). Real activation path: sendInvites moves
// draft -> active, not a test-only shortcut.
async function createThreeEligibleBrunch(
  title: string,
): Promise<{ brunchId: BrunchId; locationA: BrunchLocationId; locationB: BrunchLocationId }> {
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
      times: [],
    },
    { db, eventBus },
  );
  expect(brunch.isOk()).toBe(true);
  const brunchId = brunch._unsafeUnwrap().id;
  createdBrunchIds.push(brunchId);

  const invites = await sendInvites(
    { brunchId, invitedById: hostId, emails: [VOTER_1_EMAIL, VOTER_2_EMAIL] },
    { db, eventBus },
  );
  expect(invites.isOk()).toBe(true);

  for (const [email, userId] of [
    [VOTER_1_EMAIL, voter1Id],
    [VOTER_2_EMAIL, voter2Id],
  ] as const) {
    const invite = required(
      await db.brunchInvite.findFirst({ where: { brunchId, invitedEmail: email } }),
    );
    const joined = await respondToInvite(
      { token: invite.token as InviteToken, viewerId: userId, response: 'yes' },
      { db, eventBus },
    );
    expect(joined.isOk()).toBe(true);
  }

  const locations = await db.brunchLocation.findMany({
    where: { brunchId },
    orderBy: { createdAt: 'asc' },
  });
  const [first, second] = locations;
  return {
    brunchId,
    locationA: required(first).id as BrunchLocationId,
    locationB: required(second).id as BrunchLocationId,
  };
}

describe('closing voting (integration — real Postgres)', () => {
  it('computes the right ratio and nudge for 2 of 3 eligible attendees voting', async () => {
    const { brunchId, locationA } = await createThreeEligibleBrunch('ratio');

    await castLocationBallot(
      { brunchId, voterId: hostId, optionIds: [locationA] },
      { db, eventBus },
    );
    await castLocationBallot(
      { brunchId, voterId: voter1Id, optionIds: [locationA] },
      { db, eventBus },
    );

    const voting = await getBrunchVoting({ brunchId, viewerId: hostId }, { db });

    expect(voting?.locations.eligibleCount).toBe(3);
    expect(voting?.locations.participationRatio).toBeCloseTo(2 / 3);
    expect(voting?.locations.shouldSuggestClosing).toBe(true);
  });

  it('rejects a ballot once the host has closed voting', async () => {
    const { brunchId, locationA } = await createThreeEligibleBrunch('manual-close');

    const closed = await closeVoting({ brunchId, requestedById: hostId }, { db });
    expect(closed.isOk()).toBe(true);

    const result = await castLocationBallot(
      { brunchId, voterId: voter1Id, optionIds: [locationA] },
      { db, eventBus },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'voting_closed' });
  });

  it('rejects a ballot once the deadline has passed, without setting votingClosedAt', async () => {
    const { brunchId, locationA } = await createThreeEligibleBrunch('past-deadline');

    // Bypasses updateVotingDeadlineRequestSchema's future-only validation —
    // that check lives at the API boundary, not in the service — to set up
    // a deadline that has already naturally passed, the same way a real
    // deadline eventually does with no job needed to notice it.
    const updated = await updateVotingDeadline(
      { brunchId, requestedById: hostId, votingDeadline: '2000-01-01T00:00:00.000Z' },
      { db },
    );
    expect(updated.isOk()).toBe(true);

    const result = await castLocationBallot(
      { brunchId, voterId: voter1Id, optionIds: [locationA] },
      { db, eventBus },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'voting_closed' });

    const brunch = required(await db.brunch.findFirst({ where: { id: brunchId } }));
    expect(brunch.votingClosedAt).toBeNull();
  });

  it('closeVoting rejects a double-close', async () => {
    const { brunchId } = await createThreeEligibleBrunch('double-close');

    const first = await closeVoting({ brunchId, requestedById: hostId }, { db });
    expect(first.isOk()).toBe(true);

    const second = await closeVoting({ brunchId, requestedById: hostId }, { db });
    expect(second._unsafeUnwrapErr()).toEqual({ kind: 'already_closed' });
  });

  it('updateVotingDeadline rejects once voting is closed', async () => {
    const { brunchId } = await createThreeEligibleBrunch('deadline-after-close');

    const closed = await closeVoting({ brunchId, requestedById: hostId }, { db });
    expect(closed.isOk()).toBe(true);

    const result = await updateVotingDeadline(
      { brunchId, requestedById: hostId, votingDeadline: undefined },
      { db },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'already_closed' });
  });
});
