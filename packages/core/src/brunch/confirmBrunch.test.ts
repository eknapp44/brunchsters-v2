import type { DbClient } from '@brunchsters/database';
import type { BrunchId, BrunchLocationId, BrunchTimeId, UserId } from '@brunchsters/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@brunchsters/database', () => ({ isUniqueConstraintError: vi.fn() }));

import { isUniqueConstraintError } from '@brunchsters/database';
import type { EventBus } from '../events/EventBus';
import { confirmBrunch } from './confirmBrunch';

beforeEach(() => {
  vi.mocked(isUniqueConstraintError).mockReturnValue(false);
});

const BRUNCH_ID = 'brunch-uuid' as BrunchId;
const HOST_ID = 'host-uuid' as UserId;
const OTHER_ID = 'other-uuid' as UserId;
const LOCATION_A = 'location-a-uuid' as BrunchLocationId;
const LOCATION_B = 'location-b-uuid' as BrunchLocationId;
const TIME_A = 'time-a-uuid' as BrunchTimeId;
const TIME_B = 'time-b-uuid' as BrunchTimeId;
const SCHEDULED_AT = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

const OPEN_BRUNCH = {
  id: BRUNCH_ID,
  hostId: HOST_ID,
  statusId: 'status-active',
  status: { code: 'active' },
  votingDeadline: null,
  votingClosedAt: null,
};

type MockTx = {
  brunchStatus: { findFirst: ReturnType<typeof vi.fn> };
  user: { findFirst: ReturnType<typeof vi.fn> };
  brunchLocation: { update: ReturnType<typeof vi.fn> };
  brunchTime: { update: ReturnType<typeof vi.fn> };
  brunch: { updateMany: ReturnType<typeof vi.fn> };
  brunchInvite: { updateMany: ReturnType<typeof vi.fn> };
};

function makeMockTx(overrides: Partial<MockTx> = {}): MockTx {
  return {
    brunchStatus: {
      findFirst:
        overrides.brunchStatus?.findFirst ?? vi.fn().mockResolvedValue({ id: 'status-confirmed' }),
    },
    user: {
      findFirst:
        overrides.user?.findFirst ??
        vi.fn().mockResolvedValue({ id: HOST_ID, email: 'host@example.com' }),
    },
    brunchLocation: { update: overrides.brunchLocation?.update ?? vi.fn().mockResolvedValue({}) },
    brunchTime: { update: overrides.brunchTime?.update ?? vi.fn().mockResolvedValue({}) },
    brunch: {
      updateMany: overrides.brunch?.updateMany ?? vi.fn().mockResolvedValue({ count: 1 }),
    },
    brunchInvite: {
      updateMany: overrides.brunchInvite?.updateMany ?? vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

type Overrides = {
  findFirstBrunch?: ReturnType<typeof vi.fn>;
  findManyLocations?: ReturnType<typeof vi.fn>;
  findManyTimes?: ReturnType<typeof vi.fn>;
  tx?: MockTx;
};

function makeMockDb(overrides: Overrides): DbClient & { readonly tx: MockTx } {
  const tx = overrides.tx ?? makeMockTx();
  const db = {
    brunch: {
      findFirst: overrides.findFirstBrunch ?? vi.fn().mockResolvedValue(OPEN_BRUNCH),
    },
    brunchLocation: {
      findMany:
        overrides.findManyLocations ??
        vi.fn().mockResolvedValue([
          { id: LOCATION_A, votes: [{ id: 'v1' }] },
          { id: LOCATION_B, votes: [] },
        ]),
    },
    brunchTime: {
      findMany:
        overrides.findManyTimes ??
        vi.fn().mockResolvedValue([
          { id: TIME_A, scheduledAt: SCHEDULED_AT, votes: [{ id: 'v1' }] },
          { id: TIME_B, scheduledAt: SCHEDULED_AT, votes: [] },
        ]),
    },
    $transaction: vi.fn().mockImplementation((fn: (tx: MockTx) => Promise<unknown>) => fn(tx)),
  };
  return { ...db, tx } as unknown as DbClient & { readonly tx: MockTx };
}

function makeMockEventBus(emit = vi.fn().mockResolvedValue(undefined)): EventBus {
  return { emit };
}

const BASE_INPUT = {
  brunchId: BRUNCH_ID,
  requestedById: HOST_ID,
  locationId: LOCATION_A,
  timeId: TIME_A,
};

describe('confirmBrunch', () => {
  it('confirms the chosen location and time and moves the brunch to confirmed', async () => {
    const db = makeMockDb({});

    const result = await confirmBrunch(BASE_INPUT, { db, eventBus: makeMockEventBus() });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ brunchId: BRUNCH_ID });
    expect(db.tx.brunchLocation.update).toHaveBeenCalledWith({
      where: { id: LOCATION_A },
      data: { isConfirmed: true, confirmedAt: expect.any(Date) },
    });
    expect(db.tx.brunchTime.update).toHaveBeenCalledWith({
      where: { id: TIME_A },
      data: { isConfirmed: true, confirmedAt: expect.any(Date) },
    });
    expect(db.tx.brunch.updateMany).toHaveBeenCalledWith({
      where: { id: BRUNCH_ID, statusId: 'status-active' },
      data: { statusId: 'status-confirmed', votingClosedAt: expect.any(Date) },
    });
  });

  it('preserves an already-set votingClosedAt rather than overwriting it', async () => {
    const earlierClose = new Date('2026-01-01T00:00:00.000Z');
    const db = makeMockDb({
      findFirstBrunch: vi.fn().mockResolvedValue({ ...OPEN_BRUNCH, votingClosedAt: earlierClose }),
    });

    await confirmBrunch(BASE_INPUT, { db, eventBus: makeMockEventBus() });

    expect(db.tx.brunch.updateMany).toHaveBeenCalledWith({
      where: { id: BRUNCH_ID, statusId: 'status-active' },
      data: { statusId: 'status-confirmed', votingClosedAt: earlierClose },
    });
  });

  it('recomputes tokenExpiresAt on every invite except the host synthetic one', async () => {
    const db = makeMockDb({});

    await confirmBrunch(BASE_INPUT, { db, eventBus: makeMockEventBus() });

    const expectedExpiry = new Date(SCHEDULED_AT.getTime() + 7 * 24 * 60 * 60 * 1000);
    expect(db.tx.brunchInvite.updateMany).toHaveBeenCalledWith({
      where: {
        brunchId: BRUNCH_ID,
        deletedAt: null,
        NOT: { invitedEmail: { equals: 'host@example.com', mode: 'insensitive' } },
      },
      data: { tokenExpiresAt: expectedExpiry },
    });
  });

  it('floors tokenExpiresAt at now + 7 days when the chosen time has already passed', async () => {
    // Nothing stops confirming a time that's gone stale (addTime only
    // validates futureness at creation, not at confirm time) — without the
    // floor, scheduledAt + 7 days could still land in the past for anything
    // more than a week stale, retroactively expiring every outstanding
    // invite on a brunch that was just confirmed (architect review, F8).
    const pastScheduledAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const db = makeMockDb({
      findManyTimes: vi.fn().mockResolvedValue([
        { id: TIME_A, scheduledAt: pastScheduledAt, votes: [{ id: 'v1' }] },
        { id: TIME_B, scheduledAt: pastScheduledAt, votes: [] },
      ]),
    });

    const before = Date.now();
    await confirmBrunch(BASE_INPUT, { db, eventBus: makeMockEventBus() });
    const after = Date.now();

    const call = (db.tx.brunchInvite.updateMany as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      data: { tokenExpiresAt: Date };
    };
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(call.data.tokenExpiresAt.getTime()).toBeGreaterThanOrEqual(before + sevenDaysMs);
    expect(call.data.tokenExpiresAt.getTime()).toBeLessThanOrEqual(after + sevenDaysMs);
  });

  it('emits brunch/confirmed with whether each pick was the vote leader', async () => {
    const emit = vi.fn().mockResolvedValue(undefined);
    const db = makeMockDb({});

    await confirmBrunch(BASE_INPUT, { db, eventBus: makeMockEventBus(emit) });

    expect(emit).toHaveBeenCalledWith('brunch/confirmed', {
      brunchId: BRUNCH_ID,
      locationId: LOCATION_A,
      timeId: TIME_A,
      locationWasVoteLeader: true,
      timeWasVoteLeader: true,
    });
  });

  it('reports locationWasVoteLeader false when confirming a non-leading option', async () => {
    const emit = vi.fn().mockResolvedValue(undefined);
    const db = makeMockDb({});

    await confirmBrunch(
      { ...BASE_INPUT, locationId: LOCATION_B },
      { db, eventBus: makeMockEventBus(emit) },
    );

    expect(emit).toHaveBeenCalledWith(
      'brunch/confirmed',
      expect.objectContaining({ locationId: LOCATION_B, locationWasVoteLeader: false }),
    );
  });

  it('allows confirming a non-leading option — host prerogative, not an error', async () => {
    const db = makeMockDb({});

    const result = await confirmBrunch(
      { ...BASE_INPUT, locationId: LOCATION_B },
      {
        db,
        eventBus: makeMockEventBus(),
      },
    );

    expect(result.isOk()).toBe(true);
  });

  it('refuses a member who is not the host (they may know the brunch exists)', async () => {
    const db = makeMockDb({});

    // Membership is looked up only on this path.
    Object.assign(db, {
      brunchAttendee: { findFirst: vi.fn().mockResolvedValue({ id: 'attendee-id' }) },
    });

    const result = await confirmBrunch(
      { ...BASE_INPUT, requestedById: OTHER_ID },
      { db, eventBus: makeMockEventBus() },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'not_host' });
    expect(db.tx.brunch.updateMany).not.toHaveBeenCalled();
  });

  it('treats an outsider as if it does not exist (no 403 that confirms it is real)', async () => {
    const db = makeMockDb({});

    // Membership is looked up only on this path.
    Object.assign(db, {
      brunchAttendee: { findFirst: vi.fn().mockResolvedValue(null) },
    });

    const result = await confirmBrunch(
      { ...BASE_INPUT, requestedById: OTHER_ID },
      { db, eventBus: makeMockEventBus() },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
    expect(db.tx.brunch.updateMany).not.toHaveBeenCalled();
  });

  it('rejects when the brunch does not exist', async () => {
    const db = makeMockDb({ findFirstBrunch: vi.fn().mockResolvedValue(null) });

    const result = await confirmBrunch(BASE_INPUT, { db, eventBus: makeMockEventBus() });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
  });

  it('rejects a brunch that is not active (covers already-confirmed)', async () => {
    const db = makeMockDb({
      findFirstBrunch: vi.fn().mockResolvedValue({ ...OPEN_BRUNCH, status: { code: 'confirmed' } }),
    });

    const result = await confirmBrunch(BASE_INPUT, { db, eventBus: makeMockEventBus() });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_active' });
  });

  it('rejects a brunch with no locations', async () => {
    const db = makeMockDb({ findManyLocations: vi.fn().mockResolvedValue([]) });

    const result = await confirmBrunch(BASE_INPUT, { db, eventBus: makeMockEventBus() });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'no_locations' });
  });

  it('rejects a brunch with no times', async () => {
    const db = makeMockDb({ findManyTimes: vi.fn().mockResolvedValue([]) });

    const result = await confirmBrunch(BASE_INPUT, { db, eventBus: makeMockEventBus() });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'no_times' });
  });

  it('rejects an unknown locationId', async () => {
    const db = makeMockDb({});

    const result = await confirmBrunch(
      { ...BASE_INPUT, locationId: 'not-a-real-location' as BrunchLocationId },
      { db, eventBus: makeMockEventBus() },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'unknown_option' });
  });

  it('rejects an unknown timeId', async () => {
    const db = makeMockDb({});

    const result = await confirmBrunch(
      { ...BASE_INPUT, timeId: 'not-a-real-time' as BrunchTimeId },
      { db, eventBus: makeMockEventBus() },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'unknown_option' });
  });

  it('maps a db error from the transaction', async () => {
    const cause = new Error('connection refused');
    const db = makeMockDb({});
    db.$transaction = vi.fn().mockRejectedValue(cause);

    const result = await confirmBrunch(BASE_INPUT, { db, eventBus: makeMockEventBus() });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'db_error', cause });
  });

  it('maps a unique-constraint collision from a concurrent confirm to brunch_not_active', async () => {
    // Two genuinely concurrent confirms race on the partial unique index
    // (one confirmed location/time per brunch) — the loser hits a P2002,
    // not a re-fetch-inside-transaction check. brunch_not_active is a more
    // honest answer than a generic db_error (architect review, F12); see
    // confirmBrunch.integration.test.ts for the real-concurrency proof.
    vi.mocked(isUniqueConstraintError).mockReturnValue(true);
    const db = makeMockDb({});
    db.$transaction = vi.fn().mockRejectedValue(new Error('P2002'));

    const result = await confirmBrunch(BASE_INPUT, { db, eventBus: makeMockEventBus() });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_active' });
  });

  it('still returns Ok when the event emit throws', async () => {
    const db = makeMockDb({});
    const emit = vi.fn().mockRejectedValue(new Error('bus unavailable'));

    const result = await confirmBrunch(BASE_INPUT, { db, eventBus: makeMockEventBus(emit) });

    expect(result.isOk()).toBe(true);
  });
});

describe('confirmBrunch — the status can change under it', () => {
  it('reports invalid_transition and emits nothing when the status changed after it was read', async () => {
    const tx = makeMockTx({ brunch: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) } });
    const db = makeMockDb({ tx });
    const emit = vi.fn().mockResolvedValue(undefined);

    const result = await confirmBrunch(BASE_INPUT, { db, eventBus: { emit } });

    expect(result._unsafeUnwrapErr()).toEqual({
      kind: 'invalid_transition',
      from: 'active',
      to: 'confirmed',
    });
    expect(emit).not.toHaveBeenCalled();
  });

  it('refuses a cancelled brunch before touching anything', async () => {
    const db = makeMockDb({
      findFirstBrunch: vi.fn().mockResolvedValue({ ...OPEN_BRUNCH, status: { code: 'cancelled' } }),
    });

    const result = await confirmBrunch(BASE_INPUT, { db, eventBus: makeMockEventBus() });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_active' });
    expect(db.tx.brunch.updateMany).not.toHaveBeenCalled();
  });
});
