import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@brunchsters/core', () => ({ closeVoting: vi.fn() }));

import { closeVoting } from '@brunchsters/core';
import { auth } from '@/auth';
import { POST } from './route';

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);
const mockCloseVoting = vi.mocked(closeVoting);

const SESSION = { user: { id: 'host-user-uuid' } };
const VALID_BRUNCH_ID = '11111111-1111-4111-8111-111111111111';

function params(id: string): Promise<{ id: string }> {
  return Promise.resolve({ id });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('POST /api/v1/brunches/[id]/voting/close', () => {
  it('returns 401 when there is no session', async () => {
    mockAuth.mockResolvedValue(null);

    const response = await POST(new Request('http://localhost'), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(401);
    expect(mockCloseVoting).not.toHaveBeenCalled();
  });

  it('returns 404 for a malformed brunch id', async () => {
    mockAuth.mockResolvedValue(SESSION);

    const response = await POST(new Request('http://localhost'), { params: params('not-a-uuid') });

    expect(response.status).toBe(404);
    expect(mockCloseVoting).not.toHaveBeenCalled();
  });

  it('returns 200 with votingClosedAt on success', async () => {
    mockAuth.mockResolvedValue(SESSION);
    const votingClosedAt = new Date();
    mockCloseVoting.mockResolvedValue(ok({ votingClosedAt }));

    const response = await POST(new Request('http://localhost'), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ votingClosedAt: votingClosedAt.toISOString() });
    expect(mockCloseVoting).toHaveBeenCalledWith(
      { brunchId: VALID_BRUNCH_ID, requestedById: 'host-user-uuid' },
      expect.anything(),
    );
  });

  it('returns 403 when the requester is not the host', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockCloseVoting.mockResolvedValue(err({ kind: 'not_host' }));

    const response = await POST(new Request('http://localhost'), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(403);
  });

  it('returns 409 when already closed', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockCloseVoting.mockResolvedValue(err({ kind: 'already_closed' }));

    const response = await POST(new Request('http://localhost'), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(409);
  });

  it('returns 409 when the brunch is not active (a draft has no voting to close)', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockCloseVoting.mockResolvedValue(err({ kind: 'brunch_not_active' }));

    const response = await POST(new Request('http://localhost'), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Brunch is not open for voting' });
  });

  it('returns 404 when the brunch does not exist', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockCloseVoting.mockResolvedValue(err({ kind: 'brunch_not_found' }));

    const response = await POST(new Request('http://localhost'), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(404);
  });

  it('returns 500 on an unexpected service error', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockCloseVoting.mockResolvedValue(err({ kind: 'db_error', cause: new Error('boom') }));

    const response = await POST(new Request('http://localhost'), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(500);
  });
});
