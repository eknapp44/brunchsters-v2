import { describe, expect, it } from 'vitest';
import { readRateLimit } from './readRateLimit';

function answer(status: number, body?: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
}

describe('readRateLimit', () => {
  it('reads the policy and the wait from the body of a 429', async () => {
    const facts = await readRateLimit(
      answer(429, { error: 'Too many requests', policy: 'resend-invite', retryAfterSeconds: 540 }),
    );

    expect(facts).toEqual({ policy: 'resend-invite', retryAfterSeconds: 540 });
  });

  it('is undefined for any answer that is not a 429', async () => {
    for (const status of [200, 201, 400, 401, 403, 404, 500, 503]) {
      expect(await readRateLimit(answer(status, { retryAfterSeconds: 5 }))).toBeUndefined();
    }
  });

  it('falls back to the Retry-After header when the body has no usable wait', async () => {
    expect(await readRateLimit(answer(429, {}, { 'Retry-After': '120' }))).toEqual({
      policy: 'unknown',
      retryAfterSeconds: 120,
    });
    expect(
      await readRateLimit(answer(429, { retryAfterSeconds: 0 }, { 'Retry-After': '30' })),
    ).toEqual({ policy: 'unknown', retryAfterSeconds: 30 });
  });

  it('falls back to a minute when nothing says how long, and survives a body that is not JSON', async () => {
    expect(await readRateLimit(answer(429))).toEqual({
      policy: 'unknown',
      retryAfterSeconds: 60,
    });
    expect(await readRateLimit(new Response('<html>slow down</html>', { status: 429 }))).toEqual({
      policy: 'unknown',
      retryAfterSeconds: 60,
    });
  });

  it('ignores a wait that is not a whole positive number', async () => {
    for (const bad of [-5, 1.5, '10', null]) {
      expect(
        await readRateLimit(answer(429, { policy: 'writes', retryAfterSeconds: bad })),
      ).toEqual({ policy: 'writes', retryAfterSeconds: 60 });
    }
  });
});
