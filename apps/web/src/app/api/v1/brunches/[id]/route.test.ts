import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as BrunchstersCore from '@brunchsters/core';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@brunchsters/core', async (importOriginal) => {
  const actual = await importOriginal<typeof BrunchstersCore>();
  return { ...actual, deleteBrunch: vi.fn() };
});

import { deleteBrunch } from '@brunchsters/core';
import { auth } from '@/auth';
import { enforceWriteLimit } from '@/lib/rateLimit';
import { rateLimitedResponse } from '@/lib/rateLimitHttp';
import { DELETE } from './route';

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);
const mockDeleteBrunch = vi.mocked(deleteBrunch);
const mockEnforceWriteLimit = vi.mocked(enforceWriteLimit);

const SESSION = { user: { id: 'host-user-uuid' } };
const BRUNCH_ID = '11111111-1111-4111-8111-111111111111';

const call = (id: string = BRUNCH_ID): Promise<Response> =>
  DELETE(new Request(`http://localhost/api/v1/brunches/${id}`, { method: 'DELETE' }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  vi.resetAllMocks();
});

describe('DELETE /api/v1/brunches/[id]', () => {
  it('returns 401 when there is no session, and spends nothing', async () => {
    mockAuth.mockResolvedValue(null);

    expect((await call()).status).toBe(401);
    expect(mockEnforceWriteLimit).not.toHaveBeenCalled();
    expect(mockDeleteBrunch).not.toHaveBeenCalled();
  });

  it('spends the signed-in person write budget first, and stops when it is spent', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockEnforceWriteLimit.mockResolvedValue(
      rateLimitedResponse({ policy: 'writes', retryAfterSeconds: 12 }),
    );

    const response = await call('not-a-uuid');

    expect(mockEnforceWriteLimit).toHaveBeenCalledWith('host-user-uuid');
    expect(response.status).toBe(429);
    expect(mockDeleteBrunch).not.toHaveBeenCalled();
  });

  it('returns 404 for a malformed brunch id', async () => {
    mockAuth.mockResolvedValue(SESSION);

    expect((await call('not-a-uuid')).status).toBe(404);
    expect(mockDeleteBrunch).not.toHaveBeenCalled();
  });

  it('returns 204 with no body and asks the service as the session user', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockDeleteBrunch.mockResolvedValue(ok({ brunchId: BRUNCH_ID as never }));

    const response = await call();

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(mockDeleteBrunch).toHaveBeenCalledWith(
      { brunchId: BRUNCH_ID, requestedById: 'host-user-uuid' },
      expect.anything(),
    );
  });

  it.each([
    [
      'an outsider, a made-up id or a brunch already deleted',
      { kind: 'brunch_not_found' as const },
      404,
    ],
    ['a member who is not the host', { kind: 'not_host' as const }, 403],
    [
      'a live brunch that must be called off first',
      { kind: 'not_deletable' as const, statusCode: 'confirmed' },
      409,
    ],
    [
      'a called-off brunch whose guests have not been told yet',
      { kind: 'notice_pending' as const },
      409,
    ],
    ['a database failure', { kind: 'db_error' as const, cause: new Error('x') }, 500],
  ])('answers correctly for %s', async (_label, error, status) => {
    mockAuth.mockResolvedValue(SESSION);
    mockDeleteBrunch.mockResolvedValue(err(error));

    expect((await call()).status).toBe(status);
  });
});
