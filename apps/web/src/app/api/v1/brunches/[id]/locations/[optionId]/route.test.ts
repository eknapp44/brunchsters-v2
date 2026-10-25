import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@brunchsters/core', () => ({ removeLocation: vi.fn() }));

import { removeLocation } from '@brunchsters/core';
import { auth } from '@/auth';
import { DELETE } from './route';
import { errorCodeOf } from '@/test-support/errorCodeOf';

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);
const mockRemoveLocation = vi.mocked(removeLocation);

const SESSION = { user: { id: 'host-user-uuid' } };
const VALID_BRUNCH_ID = '11111111-1111-4111-8111-111111111111';
const VALID_LOCATION_ID = '22222222-2222-4222-8222-222222222222';

function params(id: string, optionId: string): Promise<{ id: string; optionId: string }> {
  return Promise.resolve({ id, optionId });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('DELETE /api/v1/brunches/[id]/locations/[optionId]', () => {
  it('returns 401 when there is no session', async () => {
    mockAuth.mockResolvedValue(null);

    const response = await DELETE(new Request('http://localhost'), {
      params: params(VALID_BRUNCH_ID, VALID_LOCATION_ID),
    });

    expect(response.status).toBe(401);
    expect(await errorCodeOf(response)).toBe('signed_out');
    expect(mockRemoveLocation).not.toHaveBeenCalled();
  });

  it('returns 404 for a malformed brunch id', async () => {
    mockAuth.mockResolvedValue(SESSION);

    const response = await DELETE(new Request('http://localhost'), {
      params: params('not-a-uuid', VALID_LOCATION_ID),
    });

    expect(response.status).toBe(404);
    expect(await errorCodeOf(response)).toBe('not_found');
    expect(mockRemoveLocation).not.toHaveBeenCalled();
  });

  it('returns 404 for a malformed location id', async () => {
    mockAuth.mockResolvedValue(SESSION);

    const response = await DELETE(new Request('http://localhost'), {
      params: params(VALID_BRUNCH_ID, 'not-a-uuid'),
    });

    expect(response.status).toBe(404);
    expect(await errorCodeOf(response)).toBe('not_found');
    expect(mockRemoveLocation).not.toHaveBeenCalled();
  });

  it('returns 204 on success', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockRemoveLocation.mockResolvedValue(ok({ id: VALID_LOCATION_ID as never }));

    const response = await DELETE(new Request('http://localhost'), {
      params: params(VALID_BRUNCH_ID, VALID_LOCATION_ID),
    });

    expect(response.status).toBe(204);
    expect(mockRemoveLocation).toHaveBeenCalledWith(
      {
        brunchId: VALID_BRUNCH_ID,
        requestedById: 'host-user-uuid',
        locationId: VALID_LOCATION_ID,
      },
      expect.anything(),
    );
  });

  it('returns 403 when the requester is not the host', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockRemoveLocation.mockResolvedValue(err({ kind: 'not_host' }));

    const response = await DELETE(new Request('http://localhost'), {
      params: params(VALID_BRUNCH_ID, VALID_LOCATION_ID),
    });

    expect(response.status).toBe(403);
    expect(await errorCodeOf(response)).toBe('forbidden');
  });

  it('returns 409 when the brunch is not active', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockRemoveLocation.mockResolvedValue(err({ kind: 'brunch_not_active' }));

    const response = await DELETE(new Request('http://localhost'), {
      params: params(VALID_BRUNCH_ID, VALID_LOCATION_ID),
    });

    expect(response.status).toBe(409);
    expect(await errorCodeOf(response)).toBe('brunch_not_active');
  });

  it('returns 404 when the location is unknown', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockRemoveLocation.mockResolvedValue(err({ kind: 'unknown_option' }));

    const response = await DELETE(new Request('http://localhost'), {
      params: params(VALID_BRUNCH_ID, VALID_LOCATION_ID),
    });

    expect(response.status).toBe(404);
    expect(await errorCodeOf(response)).toBe('not_found');
  });

  it('returns 409 when the location is already confirmed', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockRemoveLocation.mockResolvedValue(err({ kind: 'option_confirmed' }));

    const response = await DELETE(new Request('http://localhost'), {
      params: params(VALID_BRUNCH_ID, VALID_LOCATION_ID),
    });

    expect(response.status).toBe(409);
    expect(await errorCodeOf(response)).toBe('option_confirmed');
  });

  it('returns 409 when removing the last remaining location', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockRemoveLocation.mockResolvedValue(err({ kind: 'last_option' }));

    const response = await DELETE(new Request('http://localhost'), {
      params: params(VALID_BRUNCH_ID, VALID_LOCATION_ID),
    });

    expect(response.status).toBe(409);
    expect(await errorCodeOf(response)).toBe('last_option');
  });

  it('returns 500 on an unexpected service error', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockRemoveLocation.mockResolvedValue(err({ kind: 'db_error', cause: new Error('boom') }));

    const response = await DELETE(new Request('http://localhost'), {
      params: params(VALID_BRUNCH_ID, VALID_LOCATION_ID),
    });

    expect(response.status).toBe(500);
    expect(await errorCodeOf(response)).toBe('internal');
  });
});
