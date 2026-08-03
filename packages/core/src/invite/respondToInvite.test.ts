import type { DbClient } from '@brunchsters/database';
import type { UserId } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import type { EventBus } from '../events/EventBus';
import { respondToInvite, respondToInviteRequestSchema } from './respondToInvite';

const VIEWER_ID = 'viewer-uuid' as UserId;
const TOKEN = 'valid-token';

const BASE_INVITE = {
  id: 'invite-uuid',
  brunchId: 'brunch-uuid',
  invitedUserId: null as string | null,
  token: TOKEN,
};

type MockTx = {
  rsvpStatus: { findFirst: ReturnType<typeof vi.fn> };
  brunchAttendee: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  brunchInvite: { update: ReturnType<typeof vi.fn> };
};

function makeMockTx(overrides: Partial<MockTx> = {}): MockTx {
  return {
    rsvpStatus: { findFirst: vi.fn().mockResolvedValue({ id: 'rsvp-yes', code: 'yes' }) },
    brunchAttendee: {
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
    },
    brunchInvite: { update: vi.fn().mockResolvedValue({}) },
    ...overrides,
  };
}

function makeMockDb(tx: MockTx, invite: unknown = BASE_INVITE): DbClient {
  return {
    brunchInvite: { findFirst: vi.fn().mockResolvedValue(invite) },
    $transaction: vi.fn().mockImplementation((fn: (tx: MockTx) => Promise<unknown>) => fn(tx)),
  } as unknown as DbClient;
}

function makeMockEventBus(emit = vi.fn().mockResolvedValue(undefined)): EventBus {
  return { emit };
}

describe('respondToInvite', () => {
  it('creates a new attendee row on first response and backfills invitedUserId', async () => {
    const tx = makeMockTx();
    const db = makeMockDb(tx);

    const result = await respondToInvite(
      { token: TOKEN, viewerId: VIEWER_ID, response: 'yes' },
      { db, eventBus: makeMockEventBus() },
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ brunchId: 'brunch-uuid' });
    expect(tx.brunchAttendee.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: VIEWER_ID, rsvpStatusId: 'rsvp-yes' }),
      }),
    );
    expect(tx.brunchInvite.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { invitedUserId: VIEWER_ID } }),
    );
  });

  it('does not backfill invitedUserId when it is already set', async () => {
    const tx = makeMockTx();
    const db = makeMockDb(tx, { ...BASE_INVITE, invitedUserId: 'already-set-uuid' });

    await respondToInvite(
      { token: TOKEN, viewerId: VIEWER_ID, response: 'yes' },
      { db, eventBus: makeMockEventBus() },
    );

    expect(tx.brunchInvite.update).not.toHaveBeenCalled();
  });

  it('updates the existing attendee row on a subsequent response (change of mind)', async () => {
    const tx = makeMockTx({
      brunchAttendee: {
        findFirst: vi.fn().mockResolvedValue({ id: 'attendee-uuid' }),
        update: vi.fn().mockResolvedValue({}),
        create: vi.fn(),
      },
    });
    const db = makeMockDb(tx);

    const result = await respondToInvite(
      { token: TOKEN, viewerId: VIEWER_ID, response: 'maybe' },
      { db, eventBus: makeMockEventBus() },
    );

    expect(result.isOk()).toBe(true);
    expect(tx.brunchAttendee.create).not.toHaveBeenCalled();
    expect(tx.brunchAttendee.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'attendee-uuid' },
        data: expect.objectContaining({ rsvpStatusId: 'rsvp-yes' }),
      }),
    );
  });

  it("treats an already-member viewer (e.g. the host clicking someone else's link) as a no-op, not a duplicate-row error", async () => {
    const create = vi.fn();
    const update = vi.fn();
    const tx = makeMockTx({
      brunchAttendee: {
        // First call checks by inviteId (no attendee for THIS invite yet);
        // second call checks by brunchId+userId (viewer already belongs
        // to the brunch some other way, e.g. as host).
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 'existing-membership-uuid' }),
        update,
        create,
      },
    });
    const db = makeMockDb(tx);
    const emit = vi.fn().mockResolvedValue(undefined);

    const result = await respondToInvite(
      { token: TOKEN, viewerId: VIEWER_ID, response: 'yes' },
      { db, eventBus: makeMockEventBus(emit) },
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ brunchId: 'brunch-uuid' });
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('returns invalid_token for an expired, revoked, or nonexistent token', async () => {
    const tx = makeMockTx();
    const db = makeMockDb(tx, null);

    const result = await respondToInvite(
      { token: 'bad-token', viewerId: VIEWER_ID, response: 'yes' },
      { db, eventBus: makeMockEventBus() },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'invalid_token' });
  });

  it('returns lookup_not_found when the RsvpStatus row is missing', async () => {
    const tx = makeMockTx({ rsvpStatus: { findFirst: vi.fn().mockResolvedValue(null) } });
    const db = makeMockDb(tx);

    const result = await respondToInvite(
      { token: TOKEN, viewerId: VIEWER_ID, response: 'yes' },
      { db, eventBus: makeMockEventBus() },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'lookup_not_found', code: 'RsvpStatus:yes' });
  });

  it('returns db_error on unexpected transaction failure', async () => {
    const tx = makeMockTx();
    const db = makeMockDb(tx);
    db.$transaction = vi
      .fn()
      .mockRejectedValue(new Error('boom')) as unknown as typeof db.$transaction;

    const result = await respondToInvite(
      { token: TOKEN, viewerId: VIEWER_ID, response: 'yes' },
      { db, eventBus: makeMockEventBus() },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'db_error', cause: expect.any(Error) });
  });

  it('still returns Ok when event emission fails', async () => {
    const tx = makeMockTx();
    const db = makeMockDb(tx);
    const eventBus = makeMockEventBus(vi.fn().mockRejectedValue(new Error('emit failed')));

    const result = await respondToInvite(
      { token: TOKEN, viewerId: VIEWER_ID, response: 'yes' },
      { db, eventBus },
    );

    expect(result.isOk()).toBe(true);
  });

  it('emits attendee/rsvp.received on first response', async () => {
    const tx = makeMockTx();
    const db = makeMockDb(tx);
    const emit = vi.fn().mockResolvedValue(undefined);

    await respondToInvite(
      { token: TOKEN, viewerId: VIEWER_ID, response: 'yes' },
      { db, eventBus: makeMockEventBus(emit) },
    );

    expect(emit).toHaveBeenCalledWith(
      'attendee/rsvp.received',
      expect.objectContaining({ viewerId: VIEWER_ID }),
    );
  });

  it('emits attendee/rsvp.changed on a subsequent response', async () => {
    const tx = makeMockTx({
      brunchAttendee: {
        findFirst: vi.fn().mockResolvedValue({ id: 'attendee-uuid' }),
        update: vi.fn().mockResolvedValue({}),
        create: vi.fn(),
      },
    });
    const db = makeMockDb(tx);
    const emit = vi.fn().mockResolvedValue(undefined);

    await respondToInvite(
      { token: TOKEN, viewerId: VIEWER_ID, response: 'no' },
      { db, eventBus: makeMockEventBus(emit) },
    );

    expect(emit).toHaveBeenCalledWith(
      'attendee/rsvp.changed',
      expect.objectContaining({ viewerId: VIEWER_ID }),
    );
  });
});

describe('respondToInviteRequestSchema', () => {
  it('accepts yes, no, and maybe', () => {
    for (const response of ['yes', 'no', 'maybe']) {
      expect(respondToInviteRequestSchema.safeParse({ response }).success).toBe(true);
    }
  });

  it('rejects anything else', () => {
    expect(respondToInviteRequestSchema.safeParse({ response: 'sure' }).success).toBe(false);
  });
});
