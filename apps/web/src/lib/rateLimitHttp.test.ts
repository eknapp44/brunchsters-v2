import { afterEach, describe, expect, it, vi } from 'vitest';
import { clientIp, rateLimitedResponse, rateLimiterUnavailableResponse } from './rateLimitHttp';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('rateLimitedResponse', () => {
  it('is a 429 with Retry-After and the same facts in the body', async () => {
    const response = rateLimitedResponse({ policy: 'resend-invite', retryAfterSeconds: 540 });

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('540');
    expect(await response.json()).toEqual({
      error: { code: 'rate_limited', message: 'Too many requests' },
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
    expect(await response.json()).toEqual({
      error: { code: 'unavailable', message: 'Temporarily unavailable' },
    });
    expect(log).toHaveBeenCalledWith('POST /invites: the rate limiter is unavailable', cause);
  });
});

describe('clientIp', () => {
  const headers = (init: Record<string, string>): Headers => new Headers(init);

  it('is the first address in x-forwarded-for, trimmed', () => {
    expect(clientIp(headers({ 'x-forwarded-for': ' 203.0.113.7 , 10.0.0.1, 10.0.0.2' }))).toBe(
      '203.0.113.7',
    );
  });

  it('falls back to x-real-ip, then to one shared "unknown" (stricter, never looser)', () => {
    expect(clientIp(headers({ 'x-real-ip': '198.51.100.4' }))).toBe('198.51.100.4');
    expect(clientIp(headers({ 'x-forwarded-for': '  ', 'x-real-ip': '198.51.100.4' }))).toBe(
      '198.51.100.4',
    );
    expect(clientIp(headers({}))).toBe('unknown');
    expect(clientIp(headers({ 'x-forwarded-for': '', 'x-real-ip': ' ' }))).toBe('unknown');
  });

  it('prefers x-forwarded-for when both are present', () => {
    expect(
      clientIp(headers({ 'x-forwarded-for': '203.0.113.7', 'x-real-ip': '198.51.100.4' })),
    ).toBe('203.0.113.7');
  });
});
