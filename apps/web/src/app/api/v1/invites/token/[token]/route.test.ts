import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@brunchsters/core', () => ({ getInviteByToken: vi.fn() }));

import { getInviteByToken } from '@brunchsters/core';
import { RATE_LIMIT_POLICIES } from '@brunchsters/shared';
import { enforceLimit } from '@/lib/rateLimit';
import { rateLimitedResponse } from '@/lib/rateLimitHttp';
import { GET } from './route';
import { errorCodeOf } from '@/test-support/errorCodeOf';

const mockGetInviteByToken = vi.mocked(getInviteByToken);
const mockEnforceLimit = vi.mocked(enforceLimit);

function params(token: string): Promise<{ token: string }> {
  return Promise.resolve({ token });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('GET /api/v1/invites/token/[token]', () => {
  it('returns 200 with the preview for a valid token — no auth required', async () => {
    mockGetInviteByToken.mockResolvedValue({
      brunchTitle: 'Weekend Brunch',
      hostName: 'Alice Host',
      description: 'Pancakes and mimosas',
      brunchStatusLabel: 'Active',
      isCalledOff: false,
    });

    const response = await GET(new Request('http://localhost'), { params: params('valid-token') });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      brunchTitle: 'Weekend Brunch',
      hostName: 'Alice Host',
      description: 'Pancakes and mimosas',
      brunchStatusLabel: 'Active',
      isCalledOff: false,
    });
  });

  it('returns 404 for an invalid, expired, or revoked token', async () => {
    mockGetInviteByToken.mockResolvedValue(undefined);

    const response = await GET(new Request('http://localhost'), { params: params('bad-token') });

    expect(response.status).toBe(404);
    expect(await errorCodeOf(response)).toBe('not_found');
  });
});

describe('GET /api/v1/invites/token/[token] — the address budget', () => {
  it('spends the budget of the address the request came from, before anything is looked up', async () => {
    mockGetInviteByToken.mockResolvedValue(undefined);

    await GET(
      new Request('http://localhost', { headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' } }),
      { params: params('bad-token') },
    );

    expect(mockEnforceLimit).toHaveBeenCalledWith({
      policy: RATE_LIMIT_POLICIES.inviteTokenPerIp,
      subject: '203.0.113.7',
      route: 'invite preview',
    });
  });

  it('refuses a limited address with 429 and looks nothing up, even if the token is real', async () => {
    mockEnforceLimit.mockResolvedValue(
      rateLimitedResponse({ policy: 'invite-token', retryAfterSeconds: 42 }),
    );
    mockGetInviteByToken.mockResolvedValue({
      brunchTitle: 'Weekend Brunch',
      hostName: 'Alice Host',
      description: undefined,
      brunchStatusLabel: 'Active',
      isCalledOff: false,
    });

    const response = await GET(new Request('http://localhost'), { params: params('real-token') });

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('42');
    expect(mockGetInviteByToken).not.toHaveBeenCalled();
  });

  it('shares one budget between callers with no address header (stricter, never looser)', async () => {
    mockGetInviteByToken.mockResolvedValue(undefined);

    await GET(new Request('http://localhost'), { params: params('a') });

    expect(mockEnforceLimit).toHaveBeenCalledWith(expect.objectContaining({ subject: 'unknown' }));
  });
});
