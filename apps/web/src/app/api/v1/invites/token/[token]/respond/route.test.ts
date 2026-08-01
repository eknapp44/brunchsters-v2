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
import { auth } from '@/auth';
import { POST } from './route';

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);
const mockRespondToInvite = vi.mocked(respondToInvite);

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
    expect(mockRespondToInvite).not.toHaveBeenCalled();
  });

  it('returns 422 for an invalid response value', async () => {
    mockAuth.mockResolvedValue(SESSION);

    const response = await POST(postRequest({ response: 'sure' }), {
      params: params('some-token'),
    });

    expect(response.status).toBe(422);
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
  });

  it('returns 500 on an unexpected service error', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockRespondToInvite.mockResolvedValue(err({ kind: 'db_error', cause: new Error('boom') }));

    const response = await POST(postRequest({ response: 'yes' }), { params: params('some-token') });

    expect(response.status).toBe(500);
  });
});
