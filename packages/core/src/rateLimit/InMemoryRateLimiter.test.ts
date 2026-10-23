import { describe, expect, it } from 'vitest';
import { InMemoryRateLimiter } from './InMemoryRateLimiter';
import { describeRateLimiterContract } from './rateLimiterContract';

describeRateLimiterContract({
  name: 'InMemoryRateLimiter',
  create: (clock) => new InMemoryRateLimiter({ now: clock.now }),
});

describe('InMemoryRateLimiter', () => {
  it('can be told to fail, for the fail-closed paths of its callers', async () => {
    const cause = new Error('database is down');
    const limiter = new InMemoryRateLimiter({ failWith: cause });

    const result = await limiter.consume({
      policy: { name: 'any', limit: 1, windowSeconds: 60 },
      subject: 'someone',
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'db_error', cause });
  });
});
