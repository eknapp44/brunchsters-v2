import { InMemoryRateLimiter, type RateLimiter } from '@brunchsters/core';
import { RATE_LIMIT_POLICIES } from '@brunchsters/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The real module, not the stub every route test gets (vitest.setup.ts).
vi.unmock('./rateLimit');

let limiter: RateLimiter;
vi.mock('./services', () => ({ getRateLimiter: (): RateLimiter => limiter }));

import { enforceLimit, enforceWriteLimit } from './rateLimit';

beforeEach(() => {
  limiter = new InMemoryRateLimiter();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('enforceWriteLimit', () => {
  it('lets a person write up to the limit, then answers 429 with Retry-After and the policy', async () => {
    const { limit } = RATE_LIMIT_POLICIES.writesPerUser;

    for (let write = 0; write < limit; write += 1) {
      expect(await enforceWriteLimit('person-1')).toBeUndefined();
    }
    const refused = await enforceWriteLimit('person-1');

    expect(refused?.status).toBe(429);
    expect(Number(refused?.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
    expect(await refused?.json()).toMatchObject({
      error: { code: 'rate_limited', message: 'Too many requests' },
      policy: 'writes',
    });
  });

  it('counts each person separately', async () => {
    const { limit } = RATE_LIMIT_POLICIES.writesPerUser;
    for (let write = 0; write < limit; write += 1) await enforceWriteLimit('person-1');

    expect((await enforceWriteLimit('person-1'))?.status).toBe(429);
    expect(await enforceWriteLimit('person-2')).toBeUndefined();
  });

  it('fails closed with a 503 when the counter cannot be read', async () => {
    limiter = new InMemoryRateLimiter({ failWith: new Error('database is down') });

    const refused = await enforceWriteLimit('person-1');

    expect(refused?.status).toBe(503);
  });
});

describe('enforceLimit', () => {
  it('spends the policy it is given for the subject it is given, and nothing else', async () => {
    const consume = vi.fn().mockResolvedValue({ isErr: () => false, value: { allowed: true } });
    limiter = { consume } as unknown as RateLimiter;

    const answer = await enforceLimit({
      policy: RATE_LIMIT_POLICIES.placeSearchPerUser,
      subject: 'person-1',
      route: 'place search',
    });

    expect(answer).toBeUndefined();
    expect(consume).toHaveBeenCalledOnce();
    expect(consume).toHaveBeenCalledWith({
      policy: RATE_LIMIT_POLICIES.placeSearchPerUser,
      subject: 'person-1',
    });
  });

  it('names the refusing policy in the 429, so a control can word its message', async () => {
    const { limit } = RATE_LIMIT_POLICIES.placeSearchPerUser;
    const spend = () =>
      enforceLimit({
        policy: RATE_LIMIT_POLICIES.placeSearchPerUser,
        subject: 'person-1',
        route: 'place search',
      });
    for (let call = 0; call < limit; call += 1) expect(await spend()).toBeUndefined();

    const refused = await spend();

    expect(refused?.status).toBe(429);
    expect(await refused?.json()).toMatchObject({ policy: 'place-search' });
  });
});
