import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@brunchsters/core', () => ({
  confirmBrunch: vi.fn(),
  NoopEventBus: class {
    async emit(): Promise<void> {}
  },
}));

import { confirmBrunch } from '@brunchsters/core';
import { auth } from '@/auth';
import { POST } from './route';
import { errorCodeOf } from '@/test-support/errorCodeOf';

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);
const mockConfirmBrunch = vi.mocked(confirmBrunch);

const SESSION = { user: { id: 'host-user-uuid' } };
const VALID_BRUNCH_ID = '11111111-1111-4111-8111-111111111111';
const LOCATION_ID = '22222222-2222-4222-8222-222222222222';
const TIME_ID = '33333333-3333-4333-8333-333333333333';

function postRequest(body: unknown): Request {
  return new Request(`http://localhost/api/v1/brunches/${VALID_BRUNCH_ID}/confirm`, {
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

describe('POST /api/v1/brunches/[id]/confirm', () => {
  it('returns 401 when there is no session', async () => {
    mockAuth.mockResolvedValue(null);

    const response = await POST(postRequest({ locationId: LOCATION_ID, timeId: TIME_ID }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(401);
    expect(await errorCodeOf(response)).toBe('signed_out');
    expect(mockConfirmBrunch).not.toHaveBeenCalled();
  });

  it('returns 404 for a malformed brunch id', async () => {
    mockAuth.mockResolvedValue(SESSION);

    const response = await POST(postRequest({ locationId: LOCATION_ID, timeId: TIME_ID }), {
      params: params('not-a-uuid'),
    });

    expect(response.status).toBe(404);
    expect(await errorCodeOf(response)).toBe('not_found');
    expect(mockConfirmBrunch).not.toHaveBeenCalled();
  });

  it('returns 422 when locationId is missing', async () => {
    mockAuth.mockResolvedValue(SESSION);

    const response = await POST(postRequest({ timeId: TIME_ID }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(422);
    expect(await errorCodeOf(response)).toBe('invalid');
    expect(mockConfirmBrunch).not.toHaveBeenCalled();
  });

  it('returns 200 with the brunchId on success', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockConfirmBrunch.mockResolvedValue(ok({ brunchId: VALID_BRUNCH_ID as never }));

    const response = await POST(postRequest({ locationId: LOCATION_ID, timeId: TIME_ID }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ brunchId: VALID_BRUNCH_ID });
    expect(mockConfirmBrunch).toHaveBeenCalledWith(
      {
        brunchId: VALID_BRUNCH_ID,
        requestedById: 'host-user-uuid',
        locationId: LOCATION_ID,
        timeId: TIME_ID,
      },
      expect.anything(),
    );
  });

  it('returns 403 when the requester is not the host', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockConfirmBrunch.mockResolvedValue(err({ kind: 'not_host' }));

    const response = await POST(postRequest({ locationId: LOCATION_ID, timeId: TIME_ID }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(403);
    expect(await errorCodeOf(response)).toBe('forbidden');
  });

  it('returns 409 when the brunch is already confirmed', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockConfirmBrunch.mockResolvedValue(err({ kind: 'brunch_not_active' }));

    const response = await POST(postRequest({ locationId: LOCATION_ID, timeId: TIME_ID }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(409);
    expect(await errorCodeOf(response)).toBe('already_confirmed');
  });

  it('returns 409 when there are no locations', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockConfirmBrunch.mockResolvedValue(err({ kind: 'no_locations' }));

    const response = await POST(postRequest({ locationId: LOCATION_ID, timeId: TIME_ID }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(409);
    expect(await errorCodeOf(response)).toBe('nothing_to_confirm');
  });

  it('returns 409 when there are no times', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockConfirmBrunch.mockResolvedValue(err({ kind: 'no_times' }));

    const response = await POST(postRequest({ locationId: LOCATION_ID, timeId: TIME_ID }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(409);
    expect(await errorCodeOf(response)).toBe('nothing_to_confirm');
  });

  it('returns 404 when the option is unknown', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockConfirmBrunch.mockResolvedValue(err({ kind: 'unknown_option' }));

    const response = await POST(postRequest({ locationId: LOCATION_ID, timeId: TIME_ID }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(404);
    expect(await errorCodeOf(response)).toBe('option_gone');
  });

  it('returns 404 when the brunch does not exist', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockConfirmBrunch.mockResolvedValue(err({ kind: 'brunch_not_found' }));

    const response = await POST(postRequest({ locationId: LOCATION_ID, timeId: TIME_ID }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(404);
    expect(await errorCodeOf(response)).toBe('not_found');
  });

  it('returns 500 on an unexpected service error', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockConfirmBrunch.mockResolvedValue(err({ kind: 'db_error', cause: new Error('boom') }));

    const response = await POST(postRequest({ locationId: LOCATION_ID, timeId: TIME_ID }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(500);
    expect(await errorCodeOf(response)).toBe('internal');
  });
});
