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
    const { db, updateMany } = makeMockDb({ statusCode });

    const result = await deleteBrunch(input, { db });

    expect(result._unsafeUnwrap()).toEqual({ brunchId: BRUNCH_ID });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: BRUNCH_ID, statusId: 'status-x', deletedAt: null },
      data: { deletedAt: NOW, deletedBy: HOST_ID },
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
