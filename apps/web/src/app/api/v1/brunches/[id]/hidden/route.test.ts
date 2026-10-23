import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as BrunchstersCore from '@brunchsters/core';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@brunchsters/core', async (importOriginal) => {
  const actual = await importOriginal<typeof BrunchstersCore>();
  return { ...actual, setBrunchHidden: vi.fn() };
});

import { setBrunchHidden } from '@brunchsters/core';
import { auth } from '@/auth';
import { enforceWriteLimit } from '@/lib/rateLimit';
import { rateLimitedResponse } from '@/lib/rateLimitHttp';
import { PUT } from './route';

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);
const mockSetBrunchHidden = vi.mocked(setBrunchHidden);
const mockEnforceWriteLimit = vi.mocked(enforceWriteLimit);

const SESSION = { user: { id: 'member-user-uuid' } };
const BRUNCH_ID = '11111111-1111-4111-8111-111111111111';

function putRequest(body: unknown, id: string = BRUNCH_ID): Promise<Response> {
  return PUT(
    new Request(`http://localhost/api/v1/brunches/${id}/hidden`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('PUT /api/v1/brunches/[id]/hidden', () => {
  it('returns 401 when there is no session, and spends nothing', async () => {
    mockAuth.mockResolvedValue(null);

    expect((await putRequest({ hidden: true })).status).toBe(401);
    expect(mockEnforceWriteLimit).not.toHaveBeenCalled();
    expect(mockSetBrunchHidden).not.toHaveBeenCalled();
  });

  it('spends the signed-in person write budget first, and stops when it is spent', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockEnforceWriteLimit.mockResolvedValue(
      rateLimitedResponse({ policy: 'writes', retryAfterSeconds: 12 }),
    );

    const response = await putRequest({ hidden: true });

    expect(mockEnforceWriteLimit).toHaveBeenCalledWith('member-user-uuid');
    expect(response.status).toBe(429);
    expect(mockSetBrunchHidden).not.toHaveBeenCalled();
  });

  it('returns 404 for a malformed brunch id', async () => {
    mockAuth.mockResolvedValue(SESSION);

    expect((await putRequest({ hidden: true }, 'not-a-uuid')).status).toBe(404);
    expect(mockSetBrunchHidden).not.toHaveBeenCalled();
  });

  it('returns 400 for a body that is not JSON, and 422 for one that is not a yes or no', async () => {
    mockAuth.mockResolvedValue(SESSION);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect((await putRequest('{not json')).status).toBe(400);
    expect((await putRequest({ hidden: 'yes' })).status).toBe(422);
    expect((await putRequest({})).status).toBe(422);
    expect(mockSetBrunchHidden).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    'returns 200 with hidden %s, for the session user alone',
    async (hidden) => {
      mockAuth.mockResolvedValue(SESSION);
      mockSetBrunchHidden.mockResolvedValue(ok({ hidden }));

      const response = await putRequest({ hidden });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ hidden });
      expect(mockSetBrunchHidden).toHaveBeenCalledWith(
        { brunchId: BRUNCH_ID, viewerId: 'member-user-uuid', hidden },
        expect.anything(),
      );
    },
  );

  it('returns 404 for someone who is not in the brunch, and has no 403 to give', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockSetBrunchHidden.mockResolvedValue(err({ kind: 'brunch_not_found' }));

    expect((await putRequest({ hidden: true })).status).toBe(404);
  });

  it('returns 500 on a database failure', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockSetBrunchHidden.mockResolvedValue(err({ kind: 'db_error', cause: new Error('x') }));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect((await putRequest({ hidden: true })).status).toBe(500);
  });
});
