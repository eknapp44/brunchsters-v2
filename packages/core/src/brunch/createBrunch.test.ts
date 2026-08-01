import type { DbClient } from '@brunchsters/database';
import type { UserId } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import type { EventBus } from '../events/EventBus';
import { createBrunch, createBrunchRequestSchema, type CreateBrunchInput } from './createBrunch';

const HOST_ID = 'host-user-uuid' as UserId;

const BASE_INPUT: CreateBrunchInput = {
  title: 'Weekend Brunch',
  locations: [],
  times: [],
  hostId: HOST_ID,
};

const LOCATION_A = {
  placeId: 'place-a',
  placeName: 'Cafe A',
  placeAddress: '1 Main St',
  placeUrl: 'https://maps.google.com/?cid=a',
  timezone: 'America/Chicago',
};

const LOCATION_B = {
  placeId: 'place-b',
  placeName: 'Cafe B',
  placeAddress: '2 Main St',
  placeUrl: 'https://maps.google.com/?cid=b',
  timezone: 'America/New_York',
};

type MockTx = {
  brunchStatus: { findFirst: ReturnType<typeof vi.fn> };
  rsvpStatus: { findFirst: ReturnType<typeof vi.fn> };
  brunchDecisionType: { findFirst: ReturnType<typeof vi.fn> };
  user: { findFirst: ReturnType<typeof vi.fn> };
  brunch: { create: ReturnType<typeof vi.fn> };
  brunchInvite: { create: ReturnType<typeof vi.fn> };
  brunchAttendee: { create: ReturnType<typeof vi.fn> };
  brunchLocation: { createMany: ReturnType<typeof vi.fn> };
  brunchTime: { createMany: ReturnType<typeof vi.fn> };
};

function makeMockTx(overrides: Partial<MockTx> = {}): MockTx {
  return {
    brunchStatus: { findFirst: vi.fn().mockResolvedValue({ id: 'status-draft' }) },
    rsvpStatus: { findFirst: vi.fn().mockResolvedValue({ id: 'rsvp-yes' }) },
    brunchDecisionType: {
      findFirst: vi
        .fn()
        .mockImplementation(({ where }: { where: { code: string } }) =>
          Promise.resolve(
            where.code === 'host_decides' ? { id: 'dt-host-decides' } : { id: 'dt-group-vote' },
          ),
        ),
    },
    user: { findFirst: vi.fn().mockResolvedValue({ id: HOST_ID, email: 'host@example.com' }) },
    brunch: { create: vi.fn().mockResolvedValue({ id: 'new-brunch-uuid' }) },
    brunchInvite: { create: vi.fn().mockResolvedValue({ id: 'invite-uuid' }) },
    brunchAttendee: { create: vi.fn().mockResolvedValue({}) },
    brunchLocation: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    brunchTime: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    ...overrides,
  };
}

function makeMockDb(tx: MockTx): DbClient {
  return {
    $transaction: vi.fn().mockImplementation((fn: (tx: MockTx) => Promise<unknown>) => fn(tx)),
  } as unknown as DbClient;
}

function makeMockEventBus(emit = vi.fn().mockResolvedValue(undefined)): EventBus {
  return { emit };
}

describe('createBrunch', () => {
  it('creates brunch, synthetic invite, and host attendee with no locations or times', async () => {
    const tx = makeMockTx();
    const db = makeMockDb(tx);

    const result = await createBrunch(BASE_INPUT, { db, eventBus: makeMockEventBus() });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ id: 'new-brunch-uuid' });
    expect(tx.brunch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Weekend Brunch',
          hostId: HOST_ID,
          statusId: 'status-draft',
        }),
      }),
    );
    expect(tx.brunchAttendee.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          brunchId: 'new-brunch-uuid',
          userId: HOST_ID,
          inviteId: 'invite-uuid',
          rsvpStatusId: 'rsvp-yes',
          respondedAt: expect.any(Date),
        }),
      }),
    );
    expect(tx.brunchLocation.createMany).not.toHaveBeenCalled();
    expect(tx.brunchTime.createMany).not.toHaveBeenCalled();
  });

  it('creates the synthetic host invite already expired', async () => {
    const tx = makeMockTx();
    const before = new Date();

    await createBrunch(BASE_INPUT, { db: makeMockDb(tx), eventBus: makeMockEventBus() });

    const inviteData = tx.brunchInvite.create.mock.calls[0]?.[0]?.data as {
      tokenExpiresAt: Date;
      invitedEmail: string;
    };
    expect(inviteData.tokenExpiresAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(inviteData.tokenExpiresAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(inviteData.invitedEmail).toBe('host@example.com');
  });

  it('uses host_decides for a single location', async () => {
    const tx = makeMockTx();

    await createBrunch(
      { ...BASE_INPUT, locations: [LOCATION_A] },
      { db: makeMockDb(tx), eventBus: makeMockEventBus() },
    );

    expect(tx.brunchLocation.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ decisionTypeId: 'dt-host-decides' })],
      }),
    );
  });

  it('uses group_vote for two locations', async () => {
    const tx = makeMockTx();

    await createBrunch(
      { ...BASE_INPUT, locations: [LOCATION_A, LOCATION_B] },
      { db: makeMockDb(tx), eventBus: makeMockEventBus() },
    );

    expect(tx.brunchLocation.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({ decisionTypeId: 'dt-group-vote' }),
          expect.objectContaining({ decisionTypeId: 'dt-group-vote' }),
        ],
      }),
    );
  });

  it('uses host_decides for a single time', async () => {
    const tx = makeMockTx();

    await createBrunch(
      { ...BASE_INPUT, times: [{ scheduledAt: '2026-08-01T15:00:00.000Z' }] },
      { db: makeMockDb(tx), eventBus: makeMockEventBus() },
    );

    expect(tx.brunchTime.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            decisionTypeId: 'dt-host-decides',
            scheduledAt: new Date('2026-08-01T15:00:00.000Z'),
          }),
        ],
      }),
    );
  });

  it('uses group_vote for two times', async () => {
    const tx = makeMockTx();

    await createBrunch(
      {
        ...BASE_INPUT,
        times: [
          { scheduledAt: '2026-08-01T15:00:00.000Z' },
          { scheduledAt: '2026-08-02T15:00:00.000Z' },
        ],
      },
      { db: makeMockDb(tx), eventBus: makeMockEventBus() },
    );

    expect(tx.brunchTime.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({ decisionTypeId: 'dt-group-vote' }),
          expect.objectContaining({ decisionTypeId: 'dt-group-vote' }),
        ],
      }),
    );
  });

  it('infers decision types for locations and times independently', async () => {
    const tx = makeMockTx();

    await createBrunch(
      {
        ...BASE_INPUT,
        locations: [LOCATION_A],
        times: [
          { scheduledAt: '2026-08-01T15:00:00.000Z' },
          { scheduledAt: '2026-08-02T15:00:00.000Z' },
        ],
      },
      { db: makeMockDb(tx), eventBus: makeMockEventBus() },
    );

    expect(tx.brunchLocation.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ decisionTypeId: 'dt-host-decides' })],
      }),
    );
    expect(tx.brunchTime.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ decisionTypeId: 'dt-group-vote' }),
        ]),
      }),
    );
  });

  it('stores votingDeadline when provided', async () => {
    const tx = makeMockTx();

    await createBrunch(
      { ...BASE_INPUT, votingDeadline: '2026-07-30T12:00:00.000Z' },
      { db: makeMockDb(tx), eventBus: makeMockEventBus() },
    );

    expect(tx.brunch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          votingDeadline: new Date('2026-07-30T12:00:00.000Z'),
        }),
      }),
    );
  });

  it('emits brunch/created with brunchId and hostId after success', async () => {
    const emit = vi.fn().mockResolvedValue(undefined);

    await createBrunch(BASE_INPUT, {
      db: makeMockDb(makeMockTx()),
      eventBus: makeMockEventBus(emit),
    });

    expect(emit).toHaveBeenCalledWith('brunch/created', {
      brunchId: 'new-brunch-uuid',
      hostId: HOST_ID,
    });
  });

  it('still returns Ok when the event emit throws', async () => {
    const emit = vi.fn().mockRejectedValue(new Error('bus unavailable'));

    const result = await createBrunch(BASE_INPUT, {
      db: makeMockDb(makeMockTx()),
      eventBus: makeMockEventBus(emit),
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ id: 'new-brunch-uuid' });
  });

  it('returns db_error when the transaction fails', async () => {
    const cause = new Error('connection refused');
    const db = {
      $transaction: vi.fn().mockRejectedValue(cause),
    } as unknown as DbClient;

    const result = await createBrunch(BASE_INPUT, { db, eventBus: makeMockEventBus() });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'db_error', cause });
  });

  it('returns lookup_not_found when a lookup row is missing', async () => {
    const tx = makeMockTx({
      brunchStatus: { findFirst: vi.fn().mockResolvedValue(null) },
    });

    const result = await createBrunch(BASE_INPUT, {
      db: makeMockDb(tx),
      eventBus: makeMockEventBus(),
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({
      kind: 'lookup_not_found',
      code: 'BrunchStatus:draft',
    });
  });

  it('does not emit an event when the transaction fails', async () => {
    const emit = vi.fn();
    const db = {
      $transaction: vi.fn().mockRejectedValue(new Error('boom')),
    } as unknown as DbClient;

    await createBrunch(BASE_INPUT, { db, eventBus: makeMockEventBus(emit) });

    expect(emit).not.toHaveBeenCalled();
  });
});

describe('createBrunchRequestSchema', () => {
  it('rejects a votingDeadline in the past', () => {
    const result = createBrunchRequestSchema.safeParse({
      title: 'Weekend Brunch',
      votingDeadline: '2020-01-01T12:00:00.000Z',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a missing title', () => {
    const result = createBrunchRequestSchema.safeParse({});

    expect(result.success).toBe(false);
  });

  it('rejects a title over 100 characters', () => {
    const result = createBrunchRequestSchema.safeParse({ title: 'x'.repeat(101) });

    expect(result.success).toBe(false);
  });

  it('rejects an invalid IANA timezone in a location', () => {
    const result = createBrunchRequestSchema.safeParse({
      title: 'Weekend Brunch',
      locations: [{ ...LOCATION_A, timezone: 'Not/AZone' }],
    });

    expect(result.success).toBe(false);
  });

  it('defaults locations and times to empty arrays', () => {
    const result = createBrunchRequestSchema.parse({ title: 'Weekend Brunch' });

    expect(result.locations).toEqual([]);
    expect(result.times).toEqual([]);
  });
});
