import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as BrunchstersCore from '@brunchsters/core';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@brunchsters/core', async (importOriginal) => {
  const actual = await importOriginal<typeof BrunchstersCore>();
  return { ...actual, reinstateBrunch: vi.fn() };
});

import { reinstateBrunch } from '@brunchsters/core';
import { auth } from '@/auth';
import { enforceWriteLimit } from '@/lib/rateLimit';
import { rateLimitedResponse } from '@/lib/rateLimitHttp';
import { POST } from './route';

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);
const mockReinstateBrunch = vi.mocked(reinstateBrunch);
const mockEnforceWriteLimit = vi.mocked(enforceWriteLimit);

const SESSION = { user: { id: 'host-user-uuid' } };
const BRUNCH_ID = '11111111-1111-4111-8111-111111111111';

const call = (id: string = BRUNCH_ID): Promise<Response> =>
  POST(new Request(`http://localhost/api/v1/brunches/${id}/reinstate`, { method: 'POST' }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  vi.resetAllMocks();
});

describe('POST /api/v1/brunches/[id]/reinstate', () => {
  it('returns 401 when there is no session, and spends nothing', async () => {
    mockAuth.mockResolvedValue(null);

    expect((await call()).status).toBe(401);
    expect(mockEnforceWriteLimit).not.toHaveBeenCalled();
    expect(mockReinstateBrunch).not.toHaveBeenCalled();
  });

  it('spends the signed-in person write budget first, and stops when it is spent', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockEnforceWriteLimit.mockResolvedValue(
      rateLimitedResponse({ policy: 'writes', retryAfterSeconds: 12 }),
    );

    const response = await call('not-a-uuid');

    expect(mockEnforceWriteLimit).toHaveBeenCalledWith('host-user-uuid');
    expect(response.status).toBe(429);
    expect(mockReinstateBrunch).not.toHaveBeenCalled();
  });

  it('returns 404 for a malformed brunch id', async () => {
    mockAuth.mockResolvedValue(SESSION);

    expect((await call('not-a-uuid')).status).toBe(404);
    expect(mockReinstateBrunch).not.toHaveBeenCalled();
  });

  it('returns 200 and asks the service as the session user', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockReinstateBrunch.mockResolvedValue(ok({ brunchId: BRUNCH_ID as never }));

    const response = await call();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ brunchId: BRUNCH_ID });
    expect(mockReinstateBrunch).toHaveBeenCalledWith(
      { brunchId: BRUNCH_ID, requestedById: 'host-user-uuid' },
      expect.anything(),
    );
  });

  it.each([
    ['an outsider or a made-up id', { kind: 'brunch_not_found' as const }, 404],
    ['a member who is not the host', { kind: 'not_host' as const }, 403],
    ['a brunch that is not called off', { kind: 'not_called_off' as const }, 409],
    ['a brunch with nothing to go back to', { kind: 'nothing_to_restore' as const }, 409],
    [
      'a status that changed meanwhile',
      { kind: 'invalid_transition' as const, from: 'cancelled', to: 'confirmed' },
      409,
    ],
    ['a database failure', { kind: 'db_error' as const, cause: new Error('x') }, 500],
  ])('answers correctly for %s', async (_label, error, status) => {
    mockAuth.mockResolvedValue(SESSION);
    mockReinstateBrunch.mockResolvedValue(err(error));

    expect((await call()).status).toBe(status);
  });
});
