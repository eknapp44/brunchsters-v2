import type { DbClient } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import { assertHostOf } from './assertHostOf';

const BRUNCH_ID = 'brunch-uuid' as BrunchId;
const HOST_ID = 'host-uuid' as UserId;
const OTHER_ID = 'other-uuid' as UserId;

function makeMockDb(findFirst: ReturnType<typeof vi.fn>): DbClient {
  return { brunch: { findFirst } } as unknown as DbClient;
}

describe('assertHostOf', () => {
  it('returns Ok with the brunch when the caller is the host', async () => {
    const brunch = { id: BRUNCH_ID, hostId: HOST_ID, status: { code: 'active' } };
    const db = makeMockDb(vi.fn().mockResolvedValue(brunch));

    const result = await assertHostOf({ brunchId: BRUNCH_ID, userId: HOST_ID }, { db });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe(brunch);
  });

  it('returns brunch_not_found when no brunch matches', async () => {
    const db = makeMockDb(vi.fn().mockResolvedValue(null));

    const result = await assertHostOf({ brunchId: BRUNCH_ID, userId: HOST_ID }, { db });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
  });

  it('refuses a member who is not the host (they may know the brunch exists)', async () => {
    const brunch = { id: BRUNCH_ID, hostId: HOST_ID, status: { code: 'active' } };
    const db = makeMockDb(vi.fn().mockResolvedValue(brunch));

    // Membership is looked up only on this path.
    Object.assign(db, {
      brunchAttendee: { findFirst: vi.fn().mockResolvedValue({ id: 'attendee-id' }) },
    });

    const result = await assertHostOf({ brunchId: BRUNCH_ID, userId: OTHER_ID }, { db });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'not_host' });
  });

  it('treats an outsider as if it does not exist (no 403 that confirms it is real)', async () => {
    const brunch = { id: BRUNCH_ID, hostId: HOST_ID, status: { code: 'active' } };
    const db = makeMockDb(vi.fn().mockResolvedValue(brunch));

    // Membership is looked up only on this path.
    Object.assign(db, {
      brunchAttendee: { findFirst: vi.fn().mockResolvedValue(null) },
    });

    const result = await assertHostOf({ brunchId: BRUNCH_ID, userId: OTHER_ID }, { db });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
  });

  it('includes status in the query so callers can read it without a re-query', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: BRUNCH_ID,
      hostId: HOST_ID,
      status: { code: 'active' },
    });
    const db = makeMockDb(findFirst);

    await assertHostOf({ brunchId: BRUNCH_ID, userId: HOST_ID }, { db });

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: BRUNCH_ID },
      include: { status: true },
    });
  });
});
