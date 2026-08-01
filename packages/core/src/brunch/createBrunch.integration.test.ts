import { createDb } from '@brunchsters/database';
import type { UserId } from '@brunchsters/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NoopEventBus } from '../events/NoopEventBus';
import { createBrunch } from './createBrunch';
import { getBrunchById } from './getBrunchById';

// Requires: supabase start + seeded lookup tables (pnpm db:seed).
// Unique suffix per test run so parallel runs and retries don't collide.
const RUN_ID = Date.now();
const HOST_EMAIL = `integration-brunch-host-${RUN_ID}@example.com`;
const OTHER_EMAIL = `integration-brunch-other-${RUN_ID}@example.com`;

const db = createDb();
const eventBus = new NoopEventBus();

let hostId: UserId;
let otherUserId: UserId;
const createdBrunchIds: string[] = [];

const LOCATION_A = {
  placeId: `place-a-${RUN_ID}`,
  placeName: 'Cafe A',
  placeAddress: '1 Main St',
  placeUrl: 'https://maps.google.com/?cid=a',
  timezone: 'America/Chicago',
};

const LOCATION_B = {
  placeId: `place-b-${RUN_ID}`,
  placeName: 'Cafe B',
  placeAddress: '2 Main St',
  placeUrl: 'https://maps.google.com/?cid=b',
  timezone: 'America/New_York',
};

beforeAll(async () => {
  const host = await db.user.create({
    data: { name: 'Integration Brunch Host', email: HOST_EMAIL },
  });
  hostId = host.id as UserId;

  const other = await db.user.create({
    data: { name: 'Integration Other User', email: OTHER_EMAIL },
  });
  otherUserId = other.id as UserId;
});

afterAll(async () => {
  // FK order: leaf tables first, then brunch, then users.
  await db.brunchTime.deleteMany({ where: { brunchId: { in: createdBrunchIds } } });
  await db.brunchLocation.deleteMany({ where: { brunchId: { in: createdBrunchIds } } });
  await db.brunchAttendee.deleteMany({ where: { brunchId: { in: createdBrunchIds } } });
  await db.brunchInvite.deleteMany({ where: { brunchId: { in: createdBrunchIds } } });
  await db.brunch.deleteMany({ where: { id: { in: createdBrunchIds } } });
  await db.user.deleteMany({ where: { email: { in: [HOST_EMAIL, OTHER_EMAIL] } } });
});

async function createTestBrunch(
  overrides: Partial<Parameters<typeof createBrunch>[0]> = {},
): Promise<string> {
  const result = await createBrunch(
    { title: 'Integration Brunch', locations: [], times: [], hostId, ...overrides },
    { db, eventBus },
  );
  expect(result.isOk()).toBe(true);
  const id = result._unsafeUnwrap().id;
  createdBrunchIds.push(id);
  return id;
}

describe('createBrunch (integration — real Postgres)', () => {
  it('creates brunch, expired synthetic invite, and yes-RSVP host attendee', async () => {
    const brunchId = await createTestBrunch();

    const brunch = await db.brunch.findFirst({
      where: { id: brunchId },
      include: { status: true },
    });
    expect(brunch).not.toBeNull();
    expect(brunch?.status.code).toBe('draft');
    expect(brunch?.hostId).toBe(hostId);

    const invite = await db.brunchInvite.findFirst({ where: { brunchId } });
    expect(invite).not.toBeNull();
    expect(invite?.invitedUserId).toBe(hostId);
    expect(invite?.invitedEmail).toBe(HOST_EMAIL);
    // Born expired — never redeemable.
    expect(invite != null && invite.tokenExpiresAt <= new Date()).toBe(true);

    const attendee = await db.brunchAttendee.findFirst({
      where: { brunchId },
      include: { rsvpStatus: true },
    });
    expect(attendee).not.toBeNull();
    expect(attendee?.userId).toBe(hostId);
    expect(attendee?.inviteId).toBe(invite?.id);
    expect(attendee?.rsvpStatus.code).toBe('yes');
    expect(attendee?.respondedAt).not.toBeNull();
  });

  it('marks a single location host_decides', async () => {
    const brunchId = await createTestBrunch({ locations: [LOCATION_A] });

    const locations = await db.brunchLocation.findMany({
      where: { brunchId },
      include: { decisionType: true },
    });
    expect(locations).toHaveLength(1);
    expect(locations[0]?.decisionType.code).toBe('host_decides');
    expect(locations[0]?.timezone).toBe('America/Chicago');
  });

  it('marks two locations group_vote', async () => {
    const brunchId = await createTestBrunch({ locations: [LOCATION_A, LOCATION_B] });

    const locations = await db.brunchLocation.findMany({
      where: { brunchId },
      include: { decisionType: true },
    });
    expect(locations).toHaveLength(2);
    expect(locations.every((l) => l.decisionType.code === 'group_vote')).toBe(true);
  });

  it('marks a single time host_decides and stores UTC', async () => {
    const brunchId = await createTestBrunch({
      times: [{ scheduledAt: '2026-08-01T15:00:00.000Z' }],
    });

    const times = await db.brunchTime.findMany({
      where: { brunchId },
      include: { decisionType: true },
    });
    expect(times).toHaveLength(1);
    expect(times[0]?.decisionType.code).toBe('host_decides');
    expect(times[0]?.scheduledAt.toISOString()).toBe('2026-08-01T15:00:00.000Z');
  });

  it('marks two times group_vote, independently of a single location', async () => {
    const brunchId = await createTestBrunch({
      locations: [LOCATION_A],
      times: [
        { scheduledAt: '2026-08-01T15:00:00.000Z' },
        { scheduledAt: '2026-08-02T15:00:00.000Z' },
      ],
    });

    const locations = await db.brunchLocation.findMany({
      where: { brunchId },
      include: { decisionType: true },
    });
    expect(locations[0]?.decisionType.code).toBe('host_decides');

    const times = await db.brunchTime.findMany({
      where: { brunchId },
      include: { decisionType: true },
    });
    expect(times).toHaveLength(2);
    expect(times.every((t) => t.decisionType.code === 'group_vote')).toBe(true);
  });

  it('stores votingDeadline on the brunch', async () => {
    const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const brunchId = await createTestBrunch({ votingDeadline: deadline.toISOString() });

    const brunch = await db.brunch.findFirst({ where: { id: brunchId } });
    expect(brunch?.votingDeadline?.toISOString()).toBe(deadline.toISOString());
  });

  it('getBrunchById returns the brunch for the host and undefined for a non-member', async () => {
    const brunchId = await createTestBrunch({ title: 'Access Test Brunch' });

    const asHost = await getBrunchById(
      { brunchId: brunchId as Parameters<typeof getBrunchById>[0]['brunchId'], viewerId: hostId },
      { db },
    );
    expect(asHost?.title).toBe('Access Test Brunch');

    const asStranger = await getBrunchById(
      {
        brunchId: brunchId as Parameters<typeof getBrunchById>[0]['brunchId'],
        viewerId: otherUserId,
      },
      { db },
    );
    expect(asStranger).toBeUndefined();
  });
});
