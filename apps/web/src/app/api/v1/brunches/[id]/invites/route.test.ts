import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as BrunchstersCore from '@brunchsters/core';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@brunchsters/core', async (importOriginal) => {
  const actual = await importOriginal<typeof BrunchstersCore>();
  return {
    ...actual, // keep the real sendInvitesRequestSchema — validation runs for real
    sendInvites: vi.fn(),
  };
});

import { sendInvites } from '@brunchsters/core';
import { auth } from '@/auth';
import { POST } from './route';
import { errorCodeOf } from '@/test-support/errorCodeOf';

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);
const mockSendInvites = vi.mocked(sendInvites);

const SESSION = { user: { id: 'host-user-uuid' } };
const VALID_BRUNCH_ID = '11111111-1111-4111-8111-111111111111';

function postRequest(body: unknown): Request {
  return new Request(`http://localhost/api/v1/brunches/${VALID_BRUNCH_ID}/invites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function params(id: string): Promise<{ id: string }> {
  return Promise.resolve({ id });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('POST /api/v1/brunches/[id]/invites', () => {
  it('returns 401 when there is no session', async () => {
    mockAuth.mockResolvedValue(null);

    const response = await POST(postRequest({ emails: ['a@example.com'] }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(401);
    expect(await errorCodeOf(response)).toBe('signed_out');
    expect(mockSendInvites).not.toHaveBeenCalled();
  });

  it('returns 404 for a malformed brunch id', async () => {
    mockAuth.mockResolvedValue(SESSION);

    const response = await POST(postRequest({ emails: ['a@example.com'] }), {
      params: params('not-a-uuid'),
    });

    expect(response.status).toBe(404);
    expect(await errorCodeOf(response)).toBe('not_found');
    expect(mockSendInvites).not.toHaveBeenCalled();
  });

  it('returns 422 when emails is empty', async () => {
    mockAuth.mockResolvedValue(SESSION);

    const response = await POST(postRequest({ emails: [] }), { params: params(VALID_BRUNCH_ID) });

    expect(response.status).toBe(422);
    expect(await errorCodeOf(response)).toBe('invalid');
    expect(mockSendInvites).not.toHaveBeenCalled();
  });

  it('returns 201 with the created invites on success', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockSendInvites.mockResolvedValue(
      ok([{ id: 'invite-1' as never, invitedEmail: 'a@example.com' as never }]),
    );

    const response = await POST(postRequest({ emails: ['a@example.com'] }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      invites: [{ id: 'invite-1', invitedEmail: 'a@example.com' }],
    });
    expect(mockSendInvites).toHaveBeenCalledWith(
      expect.objectContaining({ invitedById: 'host-user-uuid', emails: ['a@example.com'] }),
      expect.anything(),
    );
  });

  it('returns 403 when the requester is not the host', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockSendInvites.mockResolvedValue(err({ kind: 'not_host' }));

    const response = await POST(postRequest({ emails: ['a@example.com'] }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(403);
    expect(await errorCodeOf(response)).toBe('forbidden');
  });

  it('returns 404 when the brunch does not exist', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockSendInvites.mockResolvedValue(err({ kind: 'brunch_not_found' }));

    const response = await POST(postRequest({ emails: ['a@example.com'] }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(404);
    expect(await errorCodeOf(response)).toBe('not_found');
  });

  it('returns 500 on an unexpected service error', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockSendInvites.mockResolvedValue(err({ kind: 'db_error', cause: new Error('boom') }));

    const response = await POST(postRequest({ emails: ['a@example.com'] }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(500);
    expect(await errorCodeOf(response)).toBe('internal');
  });
});

describe('POST /api/v1/brunches/[id]/invites — rate limits', () => {
  it('hands the service a rate limiter', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockSendInvites.mockResolvedValue(ok([]));

    await POST(postRequest({ emails: ['a@example.com'] }), { params: params(VALID_BRUNCH_ID) });

    expect(mockSendInvites).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ rateLimiter: expect.anything() }),
    );
  });

  it('answers 429 with Retry-After, the policy and the wait when a budget is spent', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockSendInvites.mockResolvedValue(
      err({ kind: 'rate_limited', policy: 'invite-emails-brunch', retryAfterSeconds: 3600 }),
    );

    const response = await POST(postRequest({ emails: ['a@example.com'] }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('3600');
    expect(await response.json()).toEqual({
      error: { code: 'rate_limited', message: 'Too many requests' },
      policy: 'invite-emails-brunch',
      retryAfterSeconds: 3600,
    });
  });

  it('fails closed with 503 when the limiter cannot count', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockAuth.mockResolvedValue(SESSION);
    mockSendInvites.mockResolvedValue(
      err({ kind: 'rate_limiter_unavailable', cause: new Error('down') }),
    );

    const response = await POST(postRequest({ emails: ['a@example.com'] }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(503);
    expect(await errorCodeOf(response)).toBe('unavailable');
    expect(await response.json()).toEqual({
      error: { code: 'unavailable', message: 'Temporarily unavailable' },
    });
  });
});
