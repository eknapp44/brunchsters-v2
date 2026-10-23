import type { RateLimitPolicy } from '@brunchsters/shared';
import { describe, expect, it } from 'vitest';
import { consumeBudgets } from './consumeBudgets';
import { InMemoryRateLimiter } from './InMemoryRateLimiter';

const NOW = () => new Date('2026-03-01T12:00:10Z');
const SMALL: RateLimitPolicy = { name: 'small', limit: 1, windowSeconds: 60 };
const BIG: RateLimitPolicy = { name: 'big', limit: 10, windowSeconds: 3_600 };

describe('consumeBudgets', () => {
  it('spends every budget and succeeds when all have room', async () => {
    const limiter = new InMemoryRateLimiter({ now: NOW });

    const result = await consumeBudgets({
      limiter,
      spends: [
        { policy: SMALL, subject: 'a' },
        { policy: BIG, subject: 'a', cost: 4 },
      ],
    });

    expect(result.isOk()).toBe(true);
    // Both were really spent: SMALL is used up, BIG has 6 left.
    expect((await limiter.consume({ policy: SMALL, subject: 'a' }))._unsafeUnwrap().allowed).toBe(
      false,
    );
    expect(
      (await limiter.consume({ policy: BIG, subject: 'a', cost: 6 }))._unsafeUnwrap().allowed,
    ).toBe(true);
  });

  it('names the policy that refused and says how long to wait', async () => {
    const limiter = new InMemoryRateLimiter({ now: NOW });
    await limiter.consume({ policy: SMALL, subject: 'a' });

    const result = await consumeBudgets({
      limiter,
      spends: [
        { policy: BIG, subject: 'a' },
        { policy: SMALL, subject: 'a' },
      ],
    });

    expect(result._unsafeUnwrapErr()).toEqual({
      kind: 'rate_limited',
      policy: 'small',
      retryAfterSeconds: 50,
    });
  });

  it('stops at the first refusal and does not spend the budgets after it', async () => {
    const limiter = new InMemoryRateLimiter({ now: NOW });
    await limiter.consume({ policy: SMALL, subject: 'a' });

    await consumeBudgets({
      limiter,
      spends: [
        { policy: SMALL, subject: 'a' },
        { policy: BIG, subject: 'a', cost: 10 },
      ],
    });

    // BIG was never touched, so all ten units are still there.
    expect(
      (await limiter.consume({ policy: BIG, subject: 'a', cost: 10 }))._unsafeUnwrap().allowed,
    ).toBe(true);
  });

  it('fails closed: a limiter that cannot count is "unavailable", not "allowed"', async () => {
    const cause = new Error('database is down');
    const limiter = new InMemoryRateLimiter({ failWith: cause });

    const result = await consumeBudgets({ limiter, spends: [{ policy: SMALL, subject: 'a' }] });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'rate_limiter_unavailable', cause });
  });

  it('succeeds with nothing to spend', async () => {
    const result = await consumeBudgets({ limiter: new InMemoryRateLimiter(), spends: [] });

    expect(result.isOk()).toBe(true);
  });
});
