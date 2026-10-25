import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@brunchsters/core', () => ({ removeTime: vi.fn() }));

import { removeTime } from '@brunchsters/core';
import { auth } from '@/auth';
import { DELETE } from './route';
import { errorCodeOf } from '@/test-support/errorCodeOf';

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);
const mockRemoveTime = vi.mocked(removeTime);

const SESSION = { user: { id: 'host-user-uuid' } };
const VALID_BRUNCH_ID = '11111111-1111-4111-8111-111111111111';
const VALID_TIME_ID = '33333333-3333-4333-8333-333333333333';

function params(id: string, optionId: string): Promise<{ id: string; optionId: string }> {
  return Promise.resolve({ id, optionId });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('DELETE /api/v1/brunches/[id]/times/[optionId]', () => {
  it('returns 401 when there is no session', async () => {
    mockAuth.mockResolvedValue(null);

    const response = await DELETE(new Request('http://localhost'), {
      params: params(VALID_BRUNCH_ID, VALID_TIME_ID),
    });

    expect(response.status).toBe(401);
    expect(await errorCodeOf(response)).toBe('signed_out');
    expect(mockRemoveTime).not.toHaveBeenCalled();
  });

  it('returns 404 for a malformed brunch id', async () => {
    mockAuth.mockResolvedValue(SESSION);

    const response = await DELETE(new Request('http://localhost'), {
      params: params('not-a-uuid', VALID_TIME_ID),
    });

    expect(response.status).toBe(404);
    expect(await errorCodeOf(response)).toBe('not_found');
    expect(mockRemoveTime).not.toHaveBeenCalled();
  });

  it('returns 404 for a malformed time id', async () => {
    mockAuth.mockResolvedValue(SESSION);

    const response = await DELETE(new Request('http://localhost'), {
      params: params(VALID_BRUNCH_ID, 'not-a-uuid'),
    });

    expect(response.status).toBe(404);
    expect(await errorCodeOf(response)).toBe('not_found');
    expect(mockRemoveTime).not.toHaveBeenCalled();
  });

  it('returns 204 on success', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockRemoveTime.mockResolvedValue(ok({ id: VALID_TIME_ID as never }));

    const response = await DELETE(new Request('http://localhost'), {
      params: params(VALID_BRUNCH_ID, VALID_TIME_ID),
    });

    expect(response.status).toBe(204);
    expect(mockRemoveTime).toHaveBeenCalledWith(
      { brunchId: VALID_BRUNCH_ID, requestedById: 'host-user-uuid', timeId: VALID_TIME_ID },
      expect.anything(),
    );
  });

  it('returns 403 when the requester is not the host', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockRemoveTime.mockResolvedValue(err({ kind: 'not_host' }));

    const response = await DELETE(new Request('http://localhost'), {
      params: params(VALID_BRUNCH_ID, VALID_TIME_ID),
    });

    expect(response.status).toBe(403);
    expect(await errorCodeOf(response)).toBe('forbidden');
  });

  it('returns 409 when the brunch is not active', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockRemoveTime.mockResolvedValue(err({ kind: 'brunch_not_active' }));

    const response = await DELETE(new Request('http://localhost'), {
      params: params(VALID_BRUNCH_ID, VALID_TIME_ID),
    });

    expect(response.status).toBe(409);
    expect(await errorCodeOf(response)).toBe('brunch_not_active');
  });

  it('returns 404 when the time is unknown', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockRemoveTime.mockResolvedValue(err({ kind: 'unknown_option' }));

    const response = await DELETE(new Request('http://localhost'), {
      params: params(VALID_BRUNCH_ID, VALID_TIME_ID),
    });

    expect(response.status).toBe(404);
    expect(await errorCodeOf(response)).toBe('not_found');
  });

  it('returns 409 when the time is already confirmed', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockRemoveTime.mockResolvedValue(err({ kind: 'option_confirmed' }));

    const response = await DELETE(new Request('http://localhost'), {
      params: params(VALID_BRUNCH_ID, VALID_TIME_ID),
    });

    expect(response.status).toBe(409);
    expect(await errorCodeOf(response)).toBe('option_confirmed');
  });

  it('returns 409 when removing the last remaining time', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockRemoveTime.mockResolvedValue(err({ kind: 'last_option' }));

    const response = await DELETE(new Request('http://localhost'), {
      params: params(VALID_BRUNCH_ID, VALID_TIME_ID),
    });

    expect(response.status).toBe(409);
    expect(await errorCodeOf(response)).toBe('last_option');
  });

  it('returns 500 on an unexpected service error', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockRemoveTime.mockResolvedValue(err({ kind: 'db_error', cause: new Error('boom') }));

    const response = await DELETE(new Request('http://localhost'), {
      params: params(VALID_BRUNCH_ID, VALID_TIME_ID),
    });

    expect(response.status).toBe(500);
    expect(await errorCodeOf(response)).toBe('internal');
  });
});
