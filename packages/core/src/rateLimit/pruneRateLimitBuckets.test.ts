import type { DbClient } from '@brunchsters/database';
import { describe, expect, it, vi } from 'vitest';
import { pruneRateLimitBuckets } from './pruneRateLimitBuckets';

const NOW = new Date('2026-03-10T04:00:00Z');

function fakeDb(deleteMany: ReturnType<typeof vi.fn>): DbClient {
  return { rateLimitBucket: { deleteMany } } as unknown as DbClient;
}

describe('pruneRateLimitBuckets', () => {
  it('deletes buckets whose window started more than two days ago and reports how many', async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 7 });

    const result = await pruneRateLimitBuckets({ now: NOW }, { db: fakeDb(deleteMany) });

    expect(result._unsafeUnwrap()).toEqual({ deleted: 7 });
    expect(deleteMany).toHaveBeenCalledWith({
      where: { windowStart: { lt: new Date('2026-03-08T04:00:00Z') } },
    });
  });

  it('returns a db_error instead of throwing when the delete fails', async () => {
    const cause = new Error('connection lost');
    const deleteMany = vi.fn().mockRejectedValue(cause);

    const result = await pruneRateLimitBuckets({ now: NOW }, { db: fakeDb(deleteMany) });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'db_error', cause });
  });
});
