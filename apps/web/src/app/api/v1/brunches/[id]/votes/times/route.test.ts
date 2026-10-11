import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as BrunchstersCore from '@brunchsters/core';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@brunchsters/core', async (importOriginal) => {
  const actual = await importOriginal<typeof BrunchstersCore>();
  return {
    ...actual, // keep the real castBallotRequestSchema — validation runs for real
    castTimeBallot: vi.fn(),
  };
});

import { castTimeBallot } from '@brunchsters/core';
import { auth } from '@/auth';
import { PUT } from './route';

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);
const mockCastTimeBallot = vi.mocked(castTimeBallot);

const SESSION = { user: { id: 'voter-user-uuid' } };
const VALID_BRUNCH_ID = '11111111-1111-4111-8111-111111111111';
const OPTION_A = '22222222-2222-4222-8222-222222222222';

function putRequest(body: unknown): Request {
  return new Request(`http://localhost/api/v1/brunches/${VALID_BRUNCH_ID}/votes/times`, {
    method: 'PUT',
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

describe('PUT /api/v1/brunches/[id]/votes/times', () => {
  it('returns 401 when there is no session', async () => {
    mockAuth.mockResolvedValue(null);

    const response = await PUT(putRequest({ optionIds: [OPTION_A] }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(401);
    expect(mockCastTimeBallot).not.toHaveBeenCalled();
  });

  it('returns 404 for a malformed brunch id', async () => {
    mockAuth.mockResolvedValue(SESSION);

    const response = await PUT(putRequest({ optionIds: [OPTION_A] }), {
      params: params('not-a-uuid'),
    });

    expect(response.status).toBe(404);
    expect(mockCastTimeBallot).not.toHaveBeenCalled();
  });

  it('returns 422 for an empty optionIds array', async () => {
    mockAuth.mockResolvedValue(SESSION);

    const response = await PUT(putRequest({ optionIds: [] }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(422);
    expect(mockCastTimeBallot).not.toHaveBeenCalled();
  });

  it('returns 200 with the saved option ids on success', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockCastTimeBallot.mockResolvedValue(ok({ optionIds: [OPTION_A as never] }));

    const response = await PUT(putRequest({ optionIds: [OPTION_A] }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ optionIds: [OPTION_A] });
    expect(mockCastTimeBallot).toHaveBeenCalledWith(
      expect.objectContaining({ voterId: 'voter-user-uuid', optionIds: [OPTION_A] }),
      expect.anything(),
    );
  });

  it('returns 404 when the requester is not a member (an outsider cannot tell the brunch exists)', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockCastTimeBallot.mockResolvedValue(err({ kind: 'brunch_not_found' }));

    const response = await PUT(putRequest({ optionIds: [OPTION_A] }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(404);
  });

  it('returns 403 when the voter cannot vote', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockCastTimeBallot.mockResolvedValue(err({ kind: 'cannot_vote' }));

    const response = await PUT(putRequest({ optionIds: [OPTION_A] }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(403);
  });

  it('returns 409 when voting is closed', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockCastTimeBallot.mockResolvedValue(err({ kind: 'voting_closed' }));

    const response = await PUT(putRequest({ optionIds: [OPTION_A] }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(409);
  });

  it('returns 409 when the brunch is not active', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockCastTimeBallot.mockResolvedValue(err({ kind: 'brunch_not_active' }));

    const response = await PUT(putRequest({ optionIds: [OPTION_A] }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(409);
  });

  it('returns 409 when the kind is not a vote', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockCastTimeBallot.mockResolvedValue(err({ kind: 'not_a_vote' }));

    const response = await PUT(putRequest({ optionIds: [OPTION_A] }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(409);
  });

  it('returns 404 when the option is unknown', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockCastTimeBallot.mockResolvedValue(err({ kind: 'unknown_option' }));

    const response = await PUT(putRequest({ optionIds: [OPTION_A] }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(404);
  });

  it('returns 404 when the brunch does not exist', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockCastTimeBallot.mockResolvedValue(err({ kind: 'brunch_not_found' }));

    const response = await PUT(putRequest({ optionIds: [OPTION_A] }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(404);
  });

  it('returns 500 on an unexpected service error', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockCastTimeBallot.mockResolvedValue(err({ kind: 'db_error', cause: new Error('boom') }));

    const response = await PUT(putRequest({ optionIds: [OPTION_A] }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(500);
  });
});
