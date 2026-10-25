import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as BrunchstersCore from '@brunchsters/core';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@brunchsters/core', async (importOriginal) => {
  const actual = await importOriginal<typeof BrunchstersCore>();
  return {
    ...actual,
    respondToInvite: vi.fn(),
  };
});

import { respondToInvite } from '@brunchsters/core';
import { RATE_LIMIT_POLICIES } from '@brunchsters/shared';
import { auth } from '@/auth';
import { enforceLimit, enforceWriteLimit } from '@/lib/rateLimit';
import { rateLimitedResponse } from '@/lib/rateLimitHttp';
import { POST } from './route';
import { errorCodeOf } from '@/test-support/errorCodeOf';

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);
const mockRespondToInvite = vi.mocked(respondToInvite);
const mockEnforceLimit = vi.mocked(enforceLimit);
const mockEnforceWriteLimit = vi.mocked(enforceWriteLimit);

const SESSION = { user: { id: 'viewer-user-uuid' } };

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/v1/invites/token/some-token/respond', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function params(token: string): Promise<{ token: string }> {
  return Promise.resolve({ token });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('POST /api/v1/invites/token/[token]/respond', () => {
  it('returns 401 when there is no session', async () => {
    mockAuth.mockResolvedValue(null);

    const response = await POST(postRequest({ response: 'yes' }), { params: params('some-token') });

    expect(response.status).toBe(401);
    expect(await errorCodeOf(response)).toBe('signed_out');
    expect(mockRespondToInvite).not.toHaveBeenCalled();
  });

  it('returns 422 for an invalid response value', async () => {
    mockAuth.mockResolvedValue(SESSION);

    const response = await POST(postRequest({ response: 'sure' }), {
      params: params('some-token'),
    });

    expect(response.status).toBe(422);
    expect(await errorCodeOf(response)).toBe('invalid');
    expect(mockRespondToInvite).not.toHaveBeenCalled();
  });

  it('returns 200 on a successful response', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockRespondToInvite.mockResolvedValue(ok({ brunchId: 'brunch-uuid' as never }));

    const response = await POST(postRequest({ response: 'yes' }), { params: params('some-token') });

    expect(response.status).toBe(200);
    expect(mockRespondToInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'some-token',
        viewerId: 'viewer-user-uuid',
        response: 'yes',
      }),
      expect.anything(),
    );
  });

  it('returns 404 for an invalid, expired, or revoked token', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockRespondToInvite.mockResolvedValue(err({ kind: 'invalid_token' }));

    const response = await POST(postRequest({ response: 'yes' }), { params: params('bad-token') });

    expect(response.status).toBe(404);
    expect(await errorCodeOf(response)).toBe('not_found');
  });

  it('returns 500 on an unexpected service error', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockRespondToInvite.mockResolvedValue(err({ kind: 'db_error', cause: new Error('boom') }));

    const response = await POST(postRequest({ response: 'yes' }), { params: params('some-token') });

    expect(response.status).toBe(500);
    expect(await errorCodeOf(response)).toBe('internal');
  });
});

describe('POST /api/v1/invites/token/[token]/respond — the budgets', () => {
  it('spends the address budget even for a signed-out caller, before the session check', async () => {
    mockAuth.mockResolvedValue(null);

    const response = await POST(
      new Request('http://localhost/x', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
        body: JSON.stringify({ response: 'yes' }),
      }),
      { params: params('some-token') },
    );

    expect(response.status).toBe(401);
    expect(await errorCodeOf(response)).toBe('signed_out');
    expect(mockEnforceLimit).toHaveBeenCalledWith({
      policy: RATE_LIMIT_POLICIES.inviteTokenPerIp,
      subject: '203.0.113.9',
      route: 'invite response',
    });
    // No person yet, so no write budget either.
    expect(mockEnforceWriteLimit).not.toHaveBeenCalled();
  });

  it('refuses a limited address with 429 before it even asks who is calling', async () => {
    mockEnforceLimit.mockResolvedValue(
      rateLimitedResponse({ policy: 'invite-token', retryAfterSeconds: 30 }),
    );

    const response = await POST(postRequest({ response: 'yes' }), { params: params('some-token') });

    expect(response.status).toBe(429);
    expect(mockAuth).not.toHaveBeenCalled();
    expect(mockRespondToInvite).not.toHaveBeenCalled();
  });

  it('spends the signed-in person write budget, and a refusal stops the response', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockEnforceWriteLimit.mockResolvedValue(
      rateLimitedResponse({ policy: 'writes', retryAfterSeconds: 12 }),
    );

    const response = await POST(postRequest({ response: 'yes' }), { params: params('some-token') });

    expect(mockEnforceWriteLimit).toHaveBeenCalledWith('viewer-user-uuid');
    expect(response.status).toBe(429);
    expect(mockRespondToInvite).not.toHaveBeenCalled();
  });
});
