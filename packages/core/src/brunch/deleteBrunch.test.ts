import type { DbClient } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import { deleteBrunch } from './deleteBrunch';

const BRUNCH_ID = 'brunch-uuid' as BrunchId;
const HOST_ID = 'host-uuid' as UserId;
const OTHER_ID = 'other-uuid' as UserId;
const NOW = new Date('2026-10-23T12:00:00.000Z');
const input = { brunchId: BRUNCH_ID, requestedById: HOST_ID, now: NOW };

function makeMockDb(
  overrides: {
    readonly statusCode?: string;
    readonly brunch?: unknown;
    readonly updateMany?: ReturnType<typeof vi.fn>;
    readonly member?: boolean;
    readonly cancellation?: { cancelledAt: Date | null; cancelNoticeSentAt: Date | null };
  } = {},
) {
  const updateMany = overrides.updateMany ?? vi.fn().mockResolvedValue({ count: 1 });
  const db = {
    brunch: {
      findFirst: vi.fn().mockResolvedValue(
        'brunch' in overrides
          ? overrides.brunch
          : {
              id: BRUNCH_ID,
              hostId: HOST_ID,
              statusId: 'status-x',
              status: { code: overrides.statusCode ?? 'draft' },
              cancelledAt: overrides.cancellation?.cancelledAt ?? null,
              cancelNoticeSentAt: overrides.cancellation?.cancelNoticeSentAt ?? null,
            },
      ),
      updateMany,
    },
    brunchAttendee: {
      findFirst: vi.fn().mockResolvedValue(overrides.member === true ? { id: 'a' } : null),
    },
  } as unknown as DbClient;
  return { db, updateMany };
}

describe('deleteBrunch', () => {
  it.each(['draft', 'cancelled'])('soft-deletes a %s brunch', async (statusCode) => {
    const { db, updateMany } = makeMockDb({
      statusCode,
      cancellation: {
        cancelledAt: new Date(NOW.getTime() - 3 * 3_600_000),
        cancelNoticeSentAt: NOW,
      },
    });

    const result = await deleteBrunch(input, { db });

    expect(result._unsafeUnwrap()).toEqual({ brunchId: BRUNCH_ID });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: BRUNCH_ID, statusId: 'status-x', deletedAt: null },
      data: { deletedAt: NOW, deletedBy: HOST_ID },
    });
  });

  describe('a called-off brunch whose guests may not have been told yet', () => {
    const minutesAgo = (minutes: number): Date => new Date(NOW.getTime() - minutes * 60_000);
    const deleteWith = async (cancellation: {
      cancelledAt: Date | null;
      cancelNoticeSentAt: Date | null;
    }) => {
      const { db, updateMany } = makeMockDb({ statusCode: 'cancelled', cancellation });
      return { result: await deleteBrunch(input, { db }), updateMany };
    };

    it('waits while the notice has not gone out, and deletes nothing', async () => {
      const { result, updateMany } = await deleteWith({
        cancelledAt: minutesAgo(1),
        cancelNoticeSentAt: null,
      });

      expect(result._unsafeUnwrapErr()).toEqual({ kind: 'notice_pending' });
      expect(updateMany).not.toHaveBeenCalled();
    });

    it('still waits just after the hold is over, until the function has run', async () => {
      const { result } = await deleteWith({ cancelledAt: minutesAgo(6), cancelNoticeSentAt: null });

      expect(result._unsafeUnwrapErr()).toEqual({ kind: 'notice_pending' });
    });

    it('deletes once the notice has gone out', async () => {
      const { result, updateMany } = await deleteWith({
        cancelledAt: minutesAgo(6),
        cancelNoticeSentAt: minutesAgo(1),
      });

      expect(result.isOk()).toBe(true);
      expect(updateMany).toHaveBeenCalled();
    });

    it('does not trap the host if the notice never goes out: it opens up after a grace period', async () => {
      const { result } = await deleteWith({
        cancelledAt: minutesAgo(5 + 61),
        cancelNoticeSentAt: null,
      });

      expect(result.isOk()).toBe(true);
    });

    it('has nothing to wait for when no cancellation moment is recorded', async () => {
      const { result } = await deleteWith({ cancelledAt: null, cancelNoticeSentAt: null });

      expect(result.isOk()).toBe(true);
    });

    it('does not apply to a draft, which nobody was ever told about', async () => {
      const { db } = makeMockDb({
        statusCode: 'draft',
        cancellation: { cancelledAt: minutesAgo(1), cancelNoticeSentAt: null },
      });

      expect((await deleteBrunch(input, { db })).isOk()).toBe(true);
    });
  });

  it.each(['active', 'confirmed'])(
    'will not delete a live (%s) brunch: it must be called off first',
    async (statusCode) => {
      const { db, updateMany } = makeMockDb({ statusCode });

      const result = await deleteBrunch(input, { db });

      expect(result._unsafeUnwrapErr()).toEqual({ kind: 'not_deletable', statusCode });
      expect(updateMany).not.toHaveBeenCalled();
    },
  );

  it('answers 404 for a brunch that is already deleted or never existed', async () => {
    const { db, updateMany } = makeMockDb({ brunch: null });

    const result = await deleteBrunch(input, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('tells an outsider the brunch does not exist, and a member who is not the host not_host', async () => {
    const outsider = makeMockDb({ member: false });
    const member = makeMockDb({ member: true });

    const asOutsider = await deleteBrunch({ ...input, requestedById: OTHER_ID }, outsider);
    const asMember = await deleteBrunch({ ...input, requestedById: OTHER_ID }, member);

    expect(asOutsider._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
    expect(asMember._unsafeUnwrapErr()).toEqual({ kind: 'not_host' });
    expect(outsider.updateMany).not.toHaveBeenCalled();
    expect(member.updateMany).not.toHaveBeenCalled();
  });

  it('is not deletable when the status changed under it (a bring-back or confirm got there first)', async () => {
    const { db } = makeMockDb({ updateMany: vi.fn().mockResolvedValue({ count: 0 }) });

    const result = await deleteBrunch(input, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'not_deletable', statusCode: 'draft' });
  });
});
