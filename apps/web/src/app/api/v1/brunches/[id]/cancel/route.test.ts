import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as BrunchstersCore from '@brunchsters/core';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@brunchsters/core', async (importOriginal) => {
  const actual = await importOriginal<typeof BrunchstersCore>();
  return { ...actual, cancelBrunch: vi.fn() };
});

import { cancelBrunch } from '@brunchsters/core';
import { auth } from '@/auth';
import { enforceWriteLimit } from '@/lib/rateLimit';
import { rateLimitedResponse } from '@/lib/rateLimitHttp';
import { POST } from './route';
import { errorCodeOf } from '@/test-support/errorCodeOf';

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);
const mockCancelBrunch = vi.mocked(cancelBrunch);
const mockEnforceWriteLimit = vi.mocked(enforceWriteLimit);

const SESSION = { user: { id: 'host-user-uuid' } };
const BRUNCH_ID = '11111111-1111-4111-8111-111111111111';

const call = (id: string = BRUNCH_ID): Promise<Response> =>
  POST(new Request(`http://localhost/api/v1/brunches/${id}/cancel`, { method: 'POST' }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  vi.resetAllMocks();
});

describe('POST /api/v1/brunches/[id]/cancel', () => {
  it('returns 401 when there is no session, and spends nothing', async () => {
    mockAuth.mockResolvedValue(null);

    const response = await call();

    expect(response.status).toBe(401);
    expect(await errorCodeOf(response)).toBe('signed_out');
    expect(mockEnforceWriteLimit).not.toHaveBeenCalled();
    expect(mockCancelBrunch).not.toHaveBeenCalled();
  });

  it('spends the signed-in person write budget before it reads the id, and stops when it is spent', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockEnforceWriteLimit.mockResolvedValue(
      rateLimitedResponse({ policy: 'writes', retryAfterSeconds: 12 }),
    );

    const response = await call('not-a-uuid');

    expect(mockEnforceWriteLimit).toHaveBeenCalledWith('host-user-uuid');
    expect(response.status).toBe(429);
    expect(mockCancelBrunch).not.toHaveBeenCalled();
  });

  it('returns 404 for a malformed brunch id', async () => {
    mockAuth.mockResolvedValue(SESSION);

    const response = await call('not-a-uuid');

    expect(response.status).toBe(404);
    expect(await errorCodeOf(response)).toBe('not_found');
    expect(mockCancelBrunch).not.toHaveBeenCalled();
  });

  it('returns 200 with the time it was called off, for the session user as host', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockCancelBrunch.mockResolvedValue(
      ok({ brunchId: BRUNCH_ID as never, cancelledAt: new Date('2026-10-23T12:00:00.000Z') }),
    );

    const response = await call();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      brunchId: BRUNCH_ID,
      cancelledAt: '2026-10-23T12:00:00.000Z',
    });
    expect(mockCancelBrunch).toHaveBeenCalledWith(
      { brunchId: BRUNCH_ID, requestedById: 'host-user-uuid' },
      expect.anything(),
    );
  });

  it.each([
    ['an outsider or a made-up id', { kind: 'brunch_not_found' as const }, 404],
    ['a member who is not the host', { kind: 'not_host' as const }, 403],
    ['a brunch already called off', { kind: 'brunch_called_off' as const }, 409],
    ['a draft', { kind: 'invalid_transition' as const, from: 'draft', to: 'cancelled' }, 409],
    [
      'a status that changed meanwhile',
      { kind: 'invalid_transition' as const, from: 'active', to: 'cancelled' },
      409,
    ],
    ['a brunch that already happened', { kind: 'brunch_over' as const }, 409],
    [
      'a failing limiter',
      { kind: 'rate_limiter_unavailable' as const, cause: new Error('x') },
      503,
    ],
    ['a database failure', { kind: 'db_error' as const, cause: new Error('x') }, 500],
  ])('answers correctly for %s', async (_label, error, status) => {
    mockAuth.mockResolvedValue(SESSION);
    mockCancelBrunch.mockResolvedValue(err(error));

    expect((await call()).status).toBe(status);
  });

  it('answers a spent cancel budget with 429, Retry-After, and the policy that refused', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockCancelBrunch.mockResolvedValue(
      err({ kind: 'rate_limited', policy: 'cancel-notices-host', retryAfterSeconds: 321 }),
    );

    const response = await call();

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('321');
    expect(await response.json()).toMatchObject({ policy: 'cancel-notices-host' });
  });

  it('tells a draft apart from a changed status by code', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockCancelBrunch.mockResolvedValue(
      err({ kind: 'invalid_transition', from: 'draft', to: 'cancelled' }),
    );
    expect(await errorCodeOf(await call())).toBe('brunch_not_active');

    mockCancelBrunch.mockResolvedValue(
      err({ kind: 'invalid_transition', from: 'confirmed', to: 'cancelled' }),
    );
    expect(await errorCodeOf(await call())).toBe('brunch_changed');
  });
});
