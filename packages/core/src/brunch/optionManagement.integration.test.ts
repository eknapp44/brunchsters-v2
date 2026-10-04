import { createDb } from '@brunchsters/database';
import type { BrunchId, BrunchLocationId, BrunchTimeId, UserId } from '@brunchsters/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NoopEventBus } from '../events/NoopEventBus';
import { addLocation } from './addLocation';
import { addTime } from './addTime';
import { createBrunch } from './createBrunch';
import { deriveDecisionMode } from './guards/deriveDecisionMode';
import { removeLocation } from './removeLocation';
import { removeTime } from './removeTime';

// Requires: supabase start + seeded lookup tables (pnpm db:seed).
const RUN_ID = Date.now();
const HOST_EMAIL = `integration-option-host-${RUN_ID}@example.com`;

const db = createDb();
const eventBus = new NoopEventBus();

let hostId: UserId;
let activeStatusId: string;
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
    data: { name: 'Integration Option Host', email: HOST_EMAIL },
  });
  hostId = host.id as UserId;

  const activeStatus = required(await db.brunchStatus.findFirst({ where: { code: 'active' } }));
  activeStatusId = activeStatus.id;
});

afterAll(async () => {
  await db.brunchLocation.deleteMany({ where: { brunchId: { in: createdBrunchIds } } });
  await db.brunchTime.deleteMany({ where: { brunchId: { in: createdBrunchIds } } });
  await db.brunchAttendee.deleteMany({ where: { brunchId: { in: createdBrunchIds } } });
  await db.brunchInvite.deleteMany({ where: { brunchId: { in: createdBrunchIds } } });
  await db.brunch.deleteMany({ where: { id: { in: createdBrunchIds } } });
  await db.user.deleteMany({ where: { email: HOST_EMAIL } });
});

function required<T>(value: T | null): T {
  if (value === null) throw new Error('Expected a row, found none');
  return value;
}

async function createTestBrunch(
  overrides: Partial<Parameters<typeof createBrunch>[0]> = {},
): Promise<BrunchId> {
  const result = await createBrunch(
    { title: 'Integration Brunch', locations: [], times: [], hostId, ...overrides },
    { db, eventBus },
  );
  expect(result.isOk()).toBe(true);
  const id = result._unsafeUnwrap().id;
  createdBrunchIds.push(id);

  // addLocation/addTime/removeLocation/removeTime all require an active
  // brunch; createBrunch leaves it draft until the real app sends an invite.
  await db.brunch.update({ where: { id }, data: { statusId: activeStatusId } });

  return id;
}

describe('option management (integration — real Postgres)', () => {
  it('adding a second time flips the derived mode, removing one flips it back', async () => {
    const brunchId = await createTestBrunch({
      times: [{ scheduledAt: '2026-08-01T15:00:00.000Z' }],
    });

    expect(await deriveDecisionMode({ brunchId, kind: 'time' }, { db })).toBe('host_decides');

    const added = await addTime(
      { brunchId, requestedById: hostId, scheduledAt: '2026-08-02T15:00:00.000Z' },
      { db },
    );
    expect(added.isOk()).toBe(true);
    expect(await deriveDecisionMode({ brunchId, kind: 'time' }, { db })).toBe('group_vote');

    const removed = await removeTime(
      { brunchId, requestedById: hostId, timeId: added._unsafeUnwrap().id },
      { db },
    );
    expect(removed.isOk()).toBe(true);
    expect(await deriveDecisionMode({ brunchId, kind: 'time' }, { db })).toBe('host_decides');
  });

  it('adding and removing a location behaves the same, independently of times', async () => {
    const brunchId = await createTestBrunch({ locations: [LOCATION_A] });

    expect(await deriveDecisionMode({ brunchId, kind: 'location' }, { db })).toBe('host_decides');

    const added = await addLocation(
      { brunchId, requestedById: hostId, location: LOCATION_B },
      { db },
    );
    expect(added.isOk()).toBe(true);
    expect(await deriveDecisionMode({ brunchId, kind: 'location' }, { db })).toBe('group_vote');

    const removed = await removeLocation(
      { brunchId, requestedById: hostId, locationId: added._unsafeUnwrap().id },
      { db },
    );
    expect(removed.isOk()).toBe(true);
    expect(await deriveDecisionMode({ brunchId, kind: 'location' }, { db })).toBe('host_decides');
  });

  it('rejects removing the last remaining option', async () => {
    const brunchId = await createTestBrunch({
      times: [{ scheduledAt: '2026-08-01T15:00:00.000Z' }],
    });
    const time = required(await db.brunchTime.findFirst({ where: { brunchId } }));

    const result = await removeTime(
      { brunchId, requestedById: hostId, timeId: time.id as BrunchTimeId },
      { db },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'last_option' });
  });

  it('rejects removing a confirmed option', async () => {
    const brunchId = await createTestBrunch({
      locations: [LOCATION_A, LOCATION_B],
    });
    const location = required(
      await db.brunchLocation.findFirst({ where: { brunchId, placeId: LOCATION_A.placeId } }),
    );
    await db.brunchLocation.update({ where: { id: location.id }, data: { isConfirmed: true } });

    const result = await removeLocation(
      { brunchId, requestedById: hostId, locationId: location.id as BrunchLocationId },
      { db },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'option_confirmed' });
  });

  it('rejects an option id that belongs to another brunch', async () => {
    const brunchA = await createTestBrunch({ locations: [LOCATION_A] });
    const brunchB = await createTestBrunch({ locations: [LOCATION_B] });
    const locationInA = required(
      await db.brunchLocation.findFirst({ where: { brunchId: brunchA } }),
    );

    const result = await removeLocation(
      { brunchId: brunchB, requestedById: hostId, locationId: locationInA.id as BrunchLocationId },
      { db },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'unknown_option' });
  });

  it('soft-deleted options are excluded from deriveDecisionMode', async () => {
    const brunchId = await createTestBrunch({ locations: [LOCATION_A] });
    const added = await addLocation(
      { brunchId, requestedById: hostId, location: LOCATION_B },
      { db },
    );
    expect(await deriveDecisionMode({ brunchId, kind: 'location' }, { db })).toBe('group_vote');

    await removeLocation(
      { brunchId, requestedById: hostId, locationId: added._unsafeUnwrap().id },
      { db },
    );

    // Soft-deleted, not hard-deleted — still present in the table, but
    // excluded from the mode derivation's filtered count.
    const stillPresent = await db.brunchLocation.findFirst({
      where: { id: added._unsafeUnwrap().id },
    });
    expect(stillPresent).toBeNull(); // soft-delete extension filters findFirst too
    expect(await deriveDecisionMode({ brunchId, kind: 'location' }, { db })).toBe('host_decides');
  });
});
