import type { DbClient } from '@brunchsters/database';
import type { BrunchId, BrunchTimeId, UserId } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import { removeTime, type RemoveTimeInput } from './removeTime';

const BRUNCH_ID = 'brunch-uuid' as BrunchId;
const OTHER_BRUNCH_ID = 'other-brunch-uuid' as BrunchId;
const TIME_ID = 'time-uuid' as BrunchTimeId;
const HOST_ID = 'host-uuid' as UserId;
const OTHER_ID = 'other-uuid' as UserId;

const BASE_INPUT: RemoveTimeInput = {
  brunchId: BRUNCH_ID,
  requestedById: HOST_ID,
  timeId: TIME_ID,
};

type MockTx = {
  $executeRaw: ReturnType<typeof vi.fn>;
  brunchTime: { count: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
};

function makeMockTx(overrides: Partial<MockTx['brunchTime']> = {}): MockTx {
  return {
    $executeRaw: vi.fn().mockResolvedValue(0),
    brunchTime: {
      count: overrides.count ?? vi.fn().mockResolvedValue(2),
      update: overrides.update ?? vi.fn().mockResolvedValue({ id: TIME_ID }),
    },
  };
}

type Overrides = {
  findFirstBrunch?: ReturnType<typeof vi.fn>;
  findFirstTime?: ReturnType<typeof vi.fn>;
  tx?: MockTx;
};

function makeMockDb(overrides: Overrides): DbClient & { readonly tx: MockTx } {
  const tx = overrides.tx ?? makeMockTx();
  const db = {
    brunch: {
      findFirst:
        overrides.findFirstBrunch ??
        vi.fn().mockResolvedValue({ id: BRUNCH_ID, hostId: HOST_ID, status: { code: 'active' } }),
    },
    brunchTime: {
      findFirst:
        overrides.findFirstTime ??
        vi.fn().mockResolvedValue({ id: TIME_ID, brunchId: BRUNCH_ID, isConfirmed: false }),
    },
    $transaction: vi.fn().mockImplementation((fn: (tx: MockTx) => Promise<unknown>) => fn(tx)),
  };
  return { ...db, tx } as unknown as DbClient & { readonly tx: MockTx };
}

describe('removeTime', () => {
  it('soft-deletes the time when there are other options left', async () => {
    const db = makeMockDb({});

    const result = await removeTime(BASE_INPUT, { db });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ id: TIME_ID });
    expect(db.tx.brunchTime.update).toHaveBeenCalledWith({
      where: { id: TIME_ID },
      data: { deletedAt: expect.any(Date), deletedBy: HOST_ID },
    });
  });

  it('rejects when the brunch does not exist', async () => {
    const db = makeMockDb({ findFirstBrunch: vi.fn().mockResolvedValue(null) });

    const result = await removeTime(BASE_INPUT, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
    expect(db.tx.brunchTime.update).not.toHaveBeenCalled();
  });

  it('refuses a member who is not the host (they may know the brunch exists)', async () => {
    const db = makeMockDb({});

    // Membership is looked up only on this path.
    Object.assign(db, {
      brunchAttendee: { findFirst: vi.fn().mockResolvedValue({ id: 'attendee-id' }) },
    });

    const result = await removeTime({ ...BASE_INPUT, requestedById: OTHER_ID }, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'not_host' });
    expect(db.tx.brunchTime.update).not.toHaveBeenCalled();
  });

  it('treats an outsider as if it does not exist (no 403 that confirms it is real)', async () => {
    const db = makeMockDb({});

    // Membership is looked up only on this path.
    Object.assign(db, {
      brunchAttendee: { findFirst: vi.fn().mockResolvedValue(null) },
    });

    const result = await removeTime({ ...BASE_INPUT, requestedById: OTHER_ID }, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
    expect(db.tx.brunchTime.update).not.toHaveBeenCalled();
  });

  it('rejects a brunch that is not active', async () => {
    const db = makeMockDb({
      findFirstBrunch: vi
        .fn()
        .mockResolvedValue({ id: BRUNCH_ID, hostId: HOST_ID, status: { code: 'cancelled' } }),
    });

    const result = await removeTime(BASE_INPUT, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_active' });
    expect(db.tx.brunchTime.update).not.toHaveBeenCalled();
  });

  it('rejects an unknown time id', async () => {
    const db = makeMockDb({ findFirstTime: vi.fn().mockResolvedValue(null) });

    const result = await removeTime(BASE_INPUT, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'unknown_option' });
    expect(db.tx.brunchTime.update).not.toHaveBeenCalled();
  });

  it('rejects a time id that belongs to another brunch', async () => {
    const findFirstTime = vi.fn().mockResolvedValue(null);
    const db = makeMockDb({ findFirstTime });

    await removeTime({ ...BASE_INPUT, brunchId: OTHER_BRUNCH_ID }, { db });

    expect(findFirstTime).toHaveBeenCalledWith({
      where: { id: TIME_ID, brunchId: OTHER_BRUNCH_ID },
    });
  });

  it('rejects removing a confirmed time', async () => {
    const db = makeMockDb({
      findFirstTime: vi
        .fn()
        .mockResolvedValue({ id: TIME_ID, brunchId: BRUNCH_ID, isConfirmed: true }),
    });

    const result = await removeTime(BASE_INPUT, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'option_confirmed' });
    expect(db.tx.brunchTime.update).not.toHaveBeenCalled();
  });

  it('rejects removing the last remaining time', async () => {
    const tx = makeMockTx({ count: vi.fn().mockResolvedValue(1) });
    const db = makeMockDb({ tx });

    const result = await removeTime(BASE_INPUT, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'last_option' });
    expect(tx.brunchTime.update).not.toHaveBeenCalled();
  });

  it('always filters deletedAt: null on the sibling count, since count() bypasses the soft-delete extension', async () => {
    const count = vi.fn().mockResolvedValue(2);
    const tx = makeMockTx({ count });
    const db = makeMockDb({ tx });

    await removeTime(BASE_INPUT, { db });

    expect(count).toHaveBeenCalledWith({
      where: { brunchId: BRUNCH_ID, deletedAt: null },
    });
  });

  it('locks the Brunch row before re-checking the remaining-option count', async () => {
    const tx = makeMockTx();
    const db = makeMockDb({ tx });

    await removeTime(BASE_INPUT, { db });

    expect(tx.$executeRaw).toHaveBeenCalled();
  });

  it('maps a db error on update', async () => {
    const cause = new Error('connection refused');
    const tx = makeMockTx({ update: vi.fn().mockRejectedValue(cause) });
    const db = makeMockDb({ tx });

    const result = await removeTime(BASE_INPUT, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'db_error', cause });
  });
});
