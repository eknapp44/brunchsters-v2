import type { DbClient } from '@brunchsters/database';
import type { BrunchId } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import { markCancelNoticeSent } from './markCancelNoticeSent';

const BRUNCH_ID = 'brunch-uuid' as BrunchId;
const CANCELLED_AT = new Date('2026-10-23T12:00:00.000Z');
const NOW = new Date('2026-10-23T12:05:00.000Z');

const dbWith = (updateMany: ReturnType<typeof vi.fn>): DbClient =>
  ({ brunch: { updateMany } }) as unknown as DbClient;

describe('markCancelNoticeSent', () => {
  it('marks this cancellation, and only while it is still the one announced and not yet marked', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });

    const result = await markCancelNoticeSent(
      { brunchId: BRUNCH_ID, cancelledAt: CANCELLED_AT, now: NOW },
      { db: dbWith(updateMany) },
    );

    expect(result._unsafeUnwrap()).toEqual({ marked: true });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: BRUNCH_ID, cancelledAt: CANCELLED_AT, cancelNoticeSentAt: null },
      data: { cancelNoticeSentAt: NOW },
    });
  });

  it('marks nothing when a newer cancellation has taken over or it was already marked', async () => {
    const result = await markCancelNoticeSent(
      { brunchId: BRUNCH_ID, cancelledAt: CANCELLED_AT },
      { db: dbWith(vi.fn().mockResolvedValue({ count: 0 })) },
    );

    expect(result._unsafeUnwrap()).toEqual({ marked: false });
  });

  it('reports a database failure as an error', async () => {
    const result = await markCancelNoticeSent(
      { brunchId: BRUNCH_ID, cancelledAt: CANCELLED_AT },
      { db: dbWith(vi.fn().mockRejectedValue(new Error('down'))) },
    );

    expect(result._unsafeUnwrapErr().kind).toBe('db_error');
  });
});
