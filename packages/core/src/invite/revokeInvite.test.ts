import type { DbClient } from '@brunchsters/database';
import type { InviteId, UserId } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import { revokeInvite } from './revokeInvite';

const HOST_ID = 'host-uuid' as UserId;
const INVITE_ID = 'invite-uuid' as InviteId;

const BASE_INVITE = {
  id: INVITE_ID,
  brunchId: 'brunch-uuid',
  brunch: { id: 'brunch-uuid', hostId: HOST_ID, status: { code: 'active' } },
};

type MockTx = {
  brunchInvite: { update: ReturnType<typeof vi.fn> };
  brunchAttendee: { updateMany: ReturnType<typeof vi.fn> };
};

function makeMockTx(overrides: Partial<MockTx> = {}): MockTx {
  return {
    brunchInvite: { update: vi.fn().mockResolvedValue({ id: INVITE_ID }) },
    brunchAttendee: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    ...overrides,
  };
}

function makeMockDb(
  overrides: {
    findFirst?: ReturnType<typeof vi.fn>;
    tx?: MockTx;
  } = {},
): DbClient {
  const tx = overrides.tx ?? makeMockTx();
  return {
    brunchInvite: {
      findFirst: overrides.findFirst ?? vi.fn().mockResolvedValue(BASE_INVITE),
    },
    $transaction: vi.fn().mockImplementation((fn: (tx: MockTx) => Promise<unknown>) => fn(tx)),
  } as unknown as DbClient;
}

describe('revokeInvite', () => {
  it('soft-deletes the invite', async () => {
    const tx = makeMockTx();
    const db = makeMockDb({ tx });

    const result = await revokeInvite({ inviteId: INVITE_ID, requestedById: HOST_ID }, { db });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ id: INVITE_ID });
    expect(tx.brunchInvite.update).toHaveBeenCalledWith({
      where: { id: INVITE_ID },
      data: { deletedAt: expect.any(Date), deletedBy: HOST_ID },
    });
  });

  it('also soft-deletes the linked BrunchAttendee row, so a known-user invitee loses brunch access too', async () => {
    const tx = makeMockTx();
    const db = makeMockDb({ tx });

    await revokeInvite({ inviteId: INVITE_ID, requestedById: HOST_ID }, { db });

    expect(tx.brunchAttendee.updateMany).toHaveBeenCalledWith({
      where: { inviteId: INVITE_ID },
      data: { deletedAt: expect.any(Date), deletedBy: HOST_ID },
    });
  });

  it('returns invite_not_found when the invite does not exist', async () => {
    const db = makeMockDb({ findFirst: vi.fn().mockResolvedValue(null) });

    const result = await revokeInvite({ inviteId: INVITE_ID, requestedById: HOST_ID }, { db });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'invite_not_found' });
  });

  it('refuses a member who is not the host (they may know the brunch exists)', async () => {
    const db = makeMockDb();

    // Membership is looked up only on this path.
    Object.assign(db, {
      brunchAttendee: { findFirst: vi.fn().mockResolvedValue({ id: 'attendee-id' }) },
    });

    const result = await revokeInvite(
      { inviteId: INVITE_ID, requestedById: 'someone-else-uuid' as UserId },
      { db },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'not_host' });
  });

  it('treats an outsider as if it does not exist (no 403 that confirms it is real)', async () => {
    const db = makeMockDb();

    // Membership is looked up only on this path.
    Object.assign(db, {
      brunchAttendee: { findFirst: vi.fn().mockResolvedValue(null) },
    });

    const result = await revokeInvite(
      { inviteId: INVITE_ID, requestedById: 'someone-else-uuid' as UserId },
      { db },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'invite_not_found' });
  });

  it('returns db_error when the transaction fails', async () => {
    const db = makeMockDb();
    db.$transaction = vi
      .fn()
      .mockRejectedValue(new Error('boom')) as unknown as typeof db.$transaction;

    const result = await revokeInvite({ inviteId: INVITE_ID, requestedById: HOST_ID }, { db });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'db_error', cause: expect.any(Error) });
  });
});

describe('revokeInvite — a brunch that is not open', () => {
  it('refuses a called-off brunch and revokes nothing', async () => {
    const tx = makeMockTx();
    const db = makeMockDb({
      tx,
      findFirst: vi.fn().mockResolvedValue({
        ...BASE_INVITE,
        brunch: { ...BASE_INVITE.brunch, status: { code: 'cancelled' } },
      }),
    });

    const result = await revokeInvite({ inviteId: INVITE_ID, requestedById: HOST_ID }, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_called_off' });
    expect(tx.brunchInvite.update).not.toHaveBeenCalled();
    expect(tx.brunchAttendee.updateMany).not.toHaveBeenCalled();
  });
});
