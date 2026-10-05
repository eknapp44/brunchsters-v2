import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as BrunchstersCore from '@brunchsters/core';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@brunchsters/core', async (importOriginal) => {
  const actual = await importOriginal<typeof BrunchstersCore>();
  return {
    ...actual, // keep the real updateVotingDeadlineRequestSchema — validation runs for real
    updateVotingDeadline: vi.fn(),
  };
});

import { updateVotingDeadline } from '@brunchsters/core';
import { auth } from '@/auth';
import { PATCH } from './route';

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);
const mockUpdateVotingDeadline = vi.mocked(updateVotingDeadline);

const SESSION = { user: { id: 'host-user-uuid' } };
const VALID_BRUNCH_ID = '11111111-1111-4111-8111-111111111111';
const FUTURE_ISO = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

function patchRequest(body: unknown): Request {
  return new Request(`http://localhost/api/v1/brunches/${VALID_BRUNCH_ID}/voting/deadline`, {
    method: 'PATCH',
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

describe('PATCH /api/v1/brunches/[id]/voting/deadline', () => {
  it('returns 401 when there is no session', async () => {
    mockAuth.mockResolvedValue(null);

    const response = await PATCH(patchRequest({ votingDeadline: FUTURE_ISO }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(401);
    expect(mockUpdateVotingDeadline).not.toHaveBeenCalled();
  });

  it('returns 404 for a malformed brunch id', async () => {
    mockAuth.mockResolvedValue(SESSION);

    const response = await PATCH(patchRequest({ votingDeadline: FUTURE_ISO }), {
      params: params('not-a-uuid'),
    });

    expect(response.status).toBe(404);
    expect(mockUpdateVotingDeadline).not.toHaveBeenCalled();
  });

  it('returns 422 for a past datetime', async () => {
    mockAuth.mockResolvedValue(SESSION);

    const response = await PATCH(patchRequest({ votingDeadline: '2000-01-01T00:00:00.000Z' }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(422);
    expect(mockUpdateVotingDeadline).not.toHaveBeenCalled();
  });

  it('returns 200 and passes undefined through to clear the deadline', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockUpdateVotingDeadline.mockResolvedValue(ok({ votingDeadline: undefined }));

    const response = await PATCH(patchRequest({ votingDeadline: null }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(200);
    expect(mockUpdateVotingDeadline).toHaveBeenCalledWith(
      expect.objectContaining({ requestedById: 'host-user-uuid', votingDeadline: undefined }),
      expect.anything(),
    );
  });

  it('returns 200 with the saved deadline on success', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockUpdateVotingDeadline.mockResolvedValue(ok({ votingDeadline: new Date(FUTURE_ISO) }));

    const response = await PATCH(patchRequest({ votingDeadline: FUTURE_ISO }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ votingDeadline: FUTURE_ISO });
    expect(mockUpdateVotingDeadline).toHaveBeenCalledWith(
      expect.objectContaining({ requestedById: 'host-user-uuid', votingDeadline: FUTURE_ISO }),
      expect.anything(),
    );
  });

  it('returns 403 when the requester is not the host', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockUpdateVotingDeadline.mockResolvedValue(err({ kind: 'not_host' }));

    const response = await PATCH(patchRequest({ votingDeadline: FUTURE_ISO }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(403);
  });

  it('returns 409 when voting is already closed', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockUpdateVotingDeadline.mockResolvedValue(err({ kind: 'already_closed' }));

    const response = await PATCH(patchRequest({ votingDeadline: FUTURE_ISO }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(409);
  });

  it('returns 404 when the brunch does not exist', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockUpdateVotingDeadline.mockResolvedValue(err({ kind: 'brunch_not_found' }));

    const response = await PATCH(patchRequest({ votingDeadline: FUTURE_ISO }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(404);
  });

  it('returns 500 on an unexpected service error', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockUpdateVotingDeadline.mockResolvedValue(err({ kind: 'db_error', cause: new Error('boom') }));

    const response = await PATCH(patchRequest({ votingDeadline: FUTURE_ISO }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(500);
  });
});
