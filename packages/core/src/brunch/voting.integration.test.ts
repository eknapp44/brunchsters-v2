import { createDb } from '@brunchsters/database';
import type { BrunchId, BrunchLocationId, InviteToken, UserId } from '@brunchsters/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { respondToInvite } from '../invite/respondToInvite';
import { sendInvites } from '../invite/sendInvites';
import { updateRsvp } from '../invite/updateRsvp';
import { NoopEventBus } from '../events/NoopEventBus';
import { castLocationBallot } from './castLocationBallot';
import { createBrunch } from './createBrunch';
import { getBrunchVoting } from './getBrunchVoting';
import { removeLocation } from './removeLocation';

// Requires: supabase start + seeded lookup tables (pnpm db:seed).
const RUN_ID = Date.now();
const HOST_EMAIL = `integration-voting-host-${RUN_ID}@example.com`;
const YES_EMAIL = `integration-voting-yes-${RUN_ID}@example.com`;
const MAYBE_EMAIL = `integration-voting-maybe-${RUN_ID}@example.com`;
const NO_EMAIL = `integration-voting-no-${RUN_ID}@example.com`;

const db = createDb();
const eventBus = new NoopEventBus();

let hostId: UserId;
let yesVoterId: UserId;
let maybeVoterId: UserId;
let noVoterId: UserId;
const createdBrunchIds: string[] = [];

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('Expected a row, found none');
  return value;
}

beforeAll(async () => {
  const host = await db.user.create({
    data: { name: 'Integration Voting Host', email: HOST_EMAIL },
  });
  hostId = host.id as UserId;
  const yesVoter = await db.user.create({
    data: { name: 'Integration Voting Yes', email: YES_EMAIL },
  });
  yesVoterId = yesVoter.id as UserId;
  const maybeVoter = await db.user.create({
    data: { name: 'Integration Voting Maybe', email: MAYBE_EMAIL },
  });
  maybeVoterId = maybeVoter.id as UserId;
  const noVoter = await db.user.create({
    data: { name: 'Integration Voting No', email: NO_EMAIL },
  });
  noVoterId = noVoter.id as UserId;
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
  await db.user.deleteMany({
    where: { email: { in: [HOST_EMAIL, YES_EMAIL, MAYBE_EMAIL, NO_EMAIL] } },
  });
});

// Creates a fresh brunch with two locations, invites the three shared
// voters, and has each respond with the given RSVP — the real activation
// path (sendInvites moves draft -> active), not a test-only shortcut.
async function createVotableBrunch(
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
    { brunchId, invitedById: hostId, emails: [YES_EMAIL, MAYBE_EMAIL, NO_EMAIL] },
    { db, eventBus },
  );
  expect(invites.isOk()).toBe(true);

  for (const [email, userId, response] of [
    [YES_EMAIL, yesVoterId, 'yes'],
    [MAYBE_EMAIL, maybeVoterId, 'maybe'],
    [NO_EMAIL, noVoterId, 'no'],
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

describe('voting (integration — real Postgres)', () => {
  it('two eligible voters cast overlapping ballots and the counts are correct', async () => {
    const { brunchId, locationA, locationB } = await createVotableBrunch('overlap');

    const yesResult = await castLocationBallot(
      { brunchId, voterId: yesVoterId, optionIds: [locationA, locationB] },
      { db, eventBus },
    );
    expect(yesResult.isOk()).toBe(true);

    const maybeResult = await castLocationBallot(
      { brunchId, voterId: maybeVoterId, optionIds: [locationA] },
      { db, eventBus },
    );
    expect(maybeResult.isOk()).toBe(true);

    const voting = await getBrunchVoting({ brunchId, viewerId: hostId }, { db });
    const optionA = voting?.locations.options.find((o) => o.id === locationA);
    const optionB = voting?.locations.options.find((o) => o.id === locationB);

    expect(optionA?.voteCount).toBe(2);
    expect(optionB?.voteCount).toBe(1);
  });

  it('lets a voter revise their ballot — replace, not accumulate', async () => {
    const { brunchId, locationA, locationB } = await createVotableBrunch('revise');

    await castLocationBallot(
      { brunchId, voterId: yesVoterId, optionIds: [locationA] },
      { db, eventBus },
    );
    await castLocationBallot(
      { brunchId, voterId: yesVoterId, optionIds: [locationB] },
      { db, eventBus },
    );

    const voting = await getBrunchVoting({ brunchId, viewerId: hostId }, { db });
    const optionA = voting?.locations.options.find((o) => o.id === locationA);
    const optionB = voting?.locations.options.find((o) => o.id === locationB);

    expect(optionA?.voteCount).toBe(0);
    expect(optionB?.voteCount).toBe(1);
  });

  it('a maybe attendee can vote; a no attendee is rejected', async () => {
    const { brunchId, locationA } = await createVotableBrunch('eligibility');

    const maybeResult = await castLocationBallot(
      { brunchId, voterId: maybeVoterId, optionIds: [locationA] },
      { db, eventBus },
    );
    expect(maybeResult.isOk()).toBe(true);

    const noResult = await castLocationBallot(
      { brunchId, voterId: noVoterId, optionIds: [locationA] },
      { db, eventBus },
    );
    expect(noResult._unsafeUnwrapErr()).toEqual({ kind: 'cannot_vote' });
  });

  it('rejects an option id that belongs to another brunch', async () => {
    const { locationA } = await createVotableBrunch('cross-a');
    const { brunchId: otherBrunchId } = await createVotableBrunch('cross-b');

    const result = await castLocationBallot(
      { brunchId: otherBrunchId, voterId: hostId, optionIds: [locationA] },
      { db, eventBus },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'unknown_option' });
  });

  it('a vote survives the voter later dropping RSVP to no (spec 0005 open question, resolved: votes stay sticky)', async () => {
    const { brunchId, locationA } = await createVotableBrunch('rsvp-drop');

    const voted = await castLocationBallot(
      { brunchId, voterId: maybeVoterId, optionIds: [locationA] },
      { db, eventBus },
    );
    expect(voted.isOk()).toBe(true);

    const changed = await updateRsvp(
      { brunchId, viewerId: maybeVoterId, response: 'no' },
      { db, eventBus },
    );
    expect(changed.isOk()).toBe(true);

    const voting = await getBrunchVoting({ brunchId, viewerId: hostId }, { db });
    const optionA = voting?.locations.options.find((o) => o.id === locationA);

    // The vote itself is untouched — still counted, still attributed.
    expect(optionA?.voteCount).toBe(1);
    expect(optionA?.voters).toContain('Integration Voting Maybe');
    // But the now-ineligible voter no longer inflates participation —
    // getBrunchVoting filters participants against the *current* eligible
    // set, so this was already correct before this test existed. Eligible
    // here is the host (synthetic yes) + the yes voter — plan.md's "the
    // host counts toward eligibility" decision — now that maybeVoter opted
    // out.
    expect(voting?.locations.eligibleCount).toBe(2);
    expect(voting?.locations.participationRatio).toBe(0);
  });

  it('a removed option is excluded from vote counts', async () => {
    const { brunchId, locationA, locationB } = await createVotableBrunch('removed');

    await castLocationBallot(
      { brunchId, voterId: yesVoterId, optionIds: [locationA, locationB] },
      { db, eventBus },
    );

    const removed = await removeLocation(
      { brunchId, requestedById: hostId, locationId: locationB },
      { db },
    );
    expect(removed.isOk()).toBe(true);

    const voting = await getBrunchVoting({ brunchId, viewerId: hostId }, { db });

    expect(voting?.locations.options.map((o) => o.id)).toEqual([locationA]);
  });

  // Postgres promises no row order, and createMany gives every row it inserts the same
  // createdAt, so without an explicit orderBy these lists reshuffle between loads. Found by
  // the e2e suite (spec 0006 M4): the wizard added Sunny Side first but Harbor Bistro rendered
  // first. The inputs here are deliberately given in the *wrong* order to prove the sort.
  it('lists options chronologically / by name and voters alphabetically, whatever order they were inserted in', async () => {
    const placeBase = { placeAddress: '1 Main St', placeUrl: '', timezone: 'America/Chicago' };
    const created = await createBrunch(
      {
        title: 'ordering',
        hostId,
        locations: [
          { ...placeBase, placeId: `place-zed-${RUN_ID}`, placeName: 'Zed Cafe' },
          { ...placeBase, placeId: `place-alpha-${RUN_ID}`, placeName: 'Alpha Cafe' },
        ],
        times: [
          { scheduledAt: new Date('2031-03-03T17:00:00Z').toISOString() },
          { scheduledAt: new Date('2031-03-01T17:00:00Z').toISOString() },
          { scheduledAt: new Date('2031-03-02T17:00:00Z').toISOString() },
        ],
      },
      { db, eventBus },
    );
    const brunchId = created._unsafeUnwrap().id;
    createdBrunchIds.push(brunchId);

    await sendInvites(
      { brunchId, invitedById: hostId, emails: [YES_EMAIL, MAYBE_EMAIL] },
      { db, eventBus },
    );
    for (const [email, userId] of [
      [YES_EMAIL, yesVoterId],
      [MAYBE_EMAIL, maybeVoterId],
    ] as const) {
      const invite = required(
        await db.brunchInvite.findFirst({ where: { brunchId, invitedEmail: email } }),
      );
      await respondToInvite(
        { token: invite.token as InviteToken, viewerId: userId, response: 'yes' },
        { db, eventBus },
      );
    }

    // "Yes" votes before "Maybe", so insertion order is the reverse of alphabetical.
    const zed = required(
      await db.brunchLocation.findFirst({ where: { brunchId, placeName: 'Zed Cafe' } }),
    );
    for (const voterId of [yesVoterId, maybeVoterId]) {
      const voted = await castLocationBallot(
        { brunchId, voterId, optionIds: [zed.id as BrunchLocationId] },
        { db, eventBus },
      );
      expect(voted.isOk()).toBe(true);
    }

    const voting = required(await getBrunchVoting({ brunchId, viewerId: hostId }, { db }));

    expect(voting.locations.options.map((o) => o.placeName)).toEqual(['Alpha Cafe', 'Zed Cafe']);
    expect(voting.times.options.map((o) => o.scheduledAt.toISOString())).toEqual([
      '2031-03-01T17:00:00.000Z',
      '2031-03-02T17:00:00.000Z',
      '2031-03-03T17:00:00.000Z',
    ]);
    expect(voting.locations.options[1]?.voters).toEqual([
      'Integration Voting Maybe',
      'Integration Voting Yes',
    ]);
  });
});
