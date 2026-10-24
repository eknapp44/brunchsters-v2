import { RATE_LIMIT_POLICIES, type UserId } from '@brunchsters/shared';
import { describe, expect, it } from 'vitest';
import { InMemoryRateLimiter } from '../rateLimit/InMemoryRateLimiter';
import { getCancelWait } from './getCancelWait';

const HOST_ID = 'host-uuid' as UserId;
const OTHER_ID = 'other-uuid' as UserId;
const policy = RATE_LIMIT_POLICIES.cancelNoticesPerHost;

async function spend(rateLimiter: InMemoryRateLimiter, subject: string, times: number) {
  for (let i = 0; i < times; i += 1) await rateLimiter.consume({ policy, subject });
}

describe('getCancelWait', () => {
  it('has no wait while the host still has cancellations left today', async () => {
    const rateLimiter = new InMemoryRateLimiter();
    await spend(rateLimiter, HOST_ID, policy.limit - 1);

    expect(
      (await getCancelWait({ hostId: HOST_ID }, { rateLimiter }))._unsafeUnwrap(),
    ).toBeUndefined();
  });

  it('waits, with the policy and the seconds left, once the day is spent', async () => {
    const rateLimiter = new InMemoryRateLimiter();
    await spend(rateLimiter, HOST_ID, policy.limit);

    const wait = (await getCancelWait({ hostId: HOST_ID }, { rateLimiter }))._unsafeUnwrap();

    expect(wait?.policy).toBe('cancel-notices-host');
    expect(wait?.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it('is the host own day only: someone else spending theirs changes nothing', async () => {
    const rateLimiter = new InMemoryRateLimiter();
    await spend(rateLimiter, OTHER_ID, policy.limit);

    expect(
      (await getCancelWait({ hostId: HOST_ID }, { rateLimiter }))._unsafeUnwrap(),
    ).toBeUndefined();
  });

  it('asking spends nothing', async () => {
    const rateLimiter = new InMemoryRateLimiter();
    await spend(rateLimiter, HOST_ID, policy.limit - 1);

    await getCancelWait({ hostId: HOST_ID }, { rateLimiter });
    await getCancelWait({ hostId: HOST_ID }, { rateLimiter });

    expect(
      (await getCancelWait({ hostId: HOST_ID }, { rateLimiter }))._unsafeUnwrap(),
    ).toBeUndefined();
  });

  it('reports an unreadable counter as an error, so the page can show no wait', async () => {
    const rateLimiter = new InMemoryRateLimiter({ failWith: new Error('down') });

    expect(
      (await getCancelWait({ hostId: HOST_ID }, { rateLimiter }))._unsafeUnwrapErr().kind,
    ).toBe('rate_limiter_unavailable');
  });
});
