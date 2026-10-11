import type { DbClient } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import { closeVoting } from './closeVoting';

const BRUNCH_ID = 'brunch-uuid' as BrunchId;
const HOST_ID = 'host-uuid' as UserId;
const OTHER_ID = 'other-uuid' as UserId;

const OPEN_BRUNCH = {
  id: BRUNCH_ID,
  hostId: HOST_ID,
  status: { code: 'active' },
  votingDeadline: null,
  votingClosedAt: null,
};

function makeMockDb(overrides: {
  findFirstBrunch?: ReturnType<typeof vi.fn>;
  update?: ReturnType<typeof vi.fn>;
}): DbClient {
  return {
    brunch: {
      findFirst: overrides.findFirstBrunch ?? vi.fn().mockResolvedValue(OPEN_BRUNCH),
      update: overrides.update ?? vi.fn().mockResolvedValue({}),
    },
  } as unknown as DbClient;
}

describe('closeVoting', () => {
  it('sets votingClosedAt to now', async () => {
    const db = makeMockDb({});
    const before = new Date();

    const result = await closeVoting({ brunchId: BRUNCH_ID, requestedById: HOST_ID }, { db });

    expect(result.isOk()).toBe(true);
    const closedAt = result._unsafeUnwrap().votingClosedAt;
    expect(closedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(db.brunch.update).toHaveBeenCalledWith({
      where: { id: BRUNCH_ID },
      data: { votingClosedAt: closedAt },
    });
  });

  it('refuses a member who is not the host (they may know the brunch exists)', async () => {
    const db = makeMockDb({});

    // Membership is looked up only on this path.
    Object.assign(db, {
      brunchAttendee: { findFirst: vi.fn().mockResolvedValue({ id: 'attendee-id' }) },
    });

    const result = await closeVoting({ brunchId: BRUNCH_ID, requestedById: OTHER_ID }, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'not_host' });
    expect(db.brunch.update).not.toHaveBeenCalled();
  });

  it('treats an outsider as if it does not exist (no 403 that confirms it is real)', async () => {
    const db = makeMockDb({});

    // Membership is looked up only on this path.
    Object.assign(db, {
      brunchAttendee: { findFirst: vi.fn().mockResolvedValue(null) },
    });

    const result = await closeVoting({ brunchId: BRUNCH_ID, requestedById: OTHER_ID }, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
    expect(db.brunch.update).not.toHaveBeenCalled();
  });

  it('rejects when the brunch does not exist', async () => {
    const db = makeMockDb({ findFirstBrunch: vi.fn().mockResolvedValue(null) });

    const result = await closeVoting({ brunchId: BRUNCH_ID, requestedById: HOST_ID }, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
  });

  it('rejects a double-close (votingClosedAt already set)', async () => {
    const db = makeMockDb({
      findFirstBrunch: vi.fn().mockResolvedValue({ ...OPEN_BRUNCH, votingClosedAt: new Date() }),
    });

    const result = await closeVoting({ brunchId: BRUNCH_ID, requestedById: HOST_ID }, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'already_closed' });
    expect(db.brunch.update).not.toHaveBeenCalled();
  });

  it('rejects closing a brunch already closed by a past deadline', async () => {
    const db = makeMockDb({
      findFirstBrunch: vi.fn().mockResolvedValue({
        ...OPEN_BRUNCH,
        votingDeadline: new Date('2000-01-01T00:00:00.000Z'),
      }),
    });

    const result = await closeVoting({ brunchId: BRUNCH_ID, requestedById: HOST_ID }, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'already_closed' });
  });

  it('rejects closing an already-confirmed brunch', async () => {
    const db = makeMockDb({
      findFirstBrunch: vi.fn().mockResolvedValue({ ...OPEN_BRUNCH, status: { code: 'confirmed' } }),
    });

    const result = await closeVoting({ brunchId: BRUNCH_ID, requestedById: HOST_ID }, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'already_closed' });
  });

  it('rejects closing a draft brunch, and does not touch it', async () => {
    const update = vi.fn();
    const db = makeMockDb({
      findFirstBrunch: vi.fn().mockResolvedValue({ ...OPEN_BRUNCH, status: { code: 'draft' } }),
      update,
    });

    const result = await closeVoting({ brunchId: BRUNCH_ID, requestedById: HOST_ID }, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_active' });
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects closing a cancelled brunch', async () => {
    const db = makeMockDb({
      findFirstBrunch: vi.fn().mockResolvedValue({ ...OPEN_BRUNCH, status: { code: 'cancelled' } }),
    });

    const result = await closeVoting({ brunchId: BRUNCH_ID, requestedById: HOST_ID }, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_active' });
  });

  it('maps a db error on update', async () => {
    const cause = new Error('connection refused');
    const db = makeMockDb({ update: vi.fn().mockRejectedValue(cause) });

    const result = await closeVoting({ brunchId: BRUNCH_ID, requestedById: HOST_ID }, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'db_error', cause });
  });
});
