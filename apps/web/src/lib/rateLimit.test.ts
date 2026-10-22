import { afterEach, describe, expect, it, vi } from 'vitest';
import { rateLimitedResponse, rateLimiterUnavailableResponse } from './rateLimit';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('rateLimitedResponse', () => {
  it('is a 429 with Retry-After and the same facts in the body', async () => {
    const response = rateLimitedResponse({ policy: 'resend-invite', retryAfterSeconds: 540 });

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('540');
    expect(await response.json()).toEqual({
      error: 'Too many requests',
      policy: 'resend-invite',
      retryAfterSeconds: 540,
    });
  });
});

describe('rateLimiterUnavailableResponse', () => {
  it('fails closed with a 503, logs the cause, and tells the caller nothing about it', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const cause = new Error('connection refused');

    const response = rateLimiterUnavailableResponse({ route: 'POST /invites', cause });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Temporarily unavailable' });
    expect(log).toHaveBeenCalledWith('POST /invites: the rate limiter is unavailable', cause);
  });
});
