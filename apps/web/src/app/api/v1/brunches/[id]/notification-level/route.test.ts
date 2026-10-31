import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as BrunchstersCore from '@brunchsters/core';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@brunchsters/core', async (importOriginal) => {
  const actual = await importOriginal<typeof BrunchstersCore>();
  return { ...actual, setNotificationLevel: vi.fn() };
});

import { setNotificationLevel } from '@brunchsters/core';
import { auth } from '@/auth';
import { enforceWriteLimit } from '@/lib/rateLimit';
import { rateLimitedResponse } from '@/lib/rateLimitHttp';
import { PUT } from './route';

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);
const mockSet = vi.mocked(setNotificationLevel);
const mockEnforceWriteLimit = vi.mocked(enforceWriteLimit);

const SESSION = { user: { id: 'member-user-uuid' } };
const BRUNCH_ID = '11111111-1111-4111-8111-111111111111';

function put(body: unknown, id: string = BRUNCH_ID): Promise<Response> {
  return PUT(
    new Request(`http://localhost/api/v1/brunches/${id}/notification-level`, {
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

describe('PUT /api/v1/brunches/[id]/notification-level', () => {
  it('answers 401 with a code when signed out, and spends nothing', async () => {
    mockAuth.mockResolvedValue(null);

    const response = await put({ level: 'muted' });

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('signed_out');
    expect(mockEnforceWriteLimit).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('spends the write budget before reading the request, keyed by the caller', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockEnforceWriteLimit.mockResolvedValue(
      rateLimitedResponse({ policy: 'writes', retryAfterSeconds: 5 }),
    );

    const response = await put({ level: 'muted' }, 'not-a-uuid');

    expect(mockEnforceWriteLimit).toHaveBeenCalledWith('member-user-uuid');
    expect(response.status).toBe(429);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('answers 404 for a malformed brunch id, the same as for an outsider', async () => {
    mockAuth.mockResolvedValue(SESSION);

    const malformed = await put({ level: 'muted' }, 'not-a-uuid');
    expect(malformed.status).toBe(404);
    expect(mockSet).not.toHaveBeenCalled();

    mockSet.mockResolvedValue(err({ kind: 'brunch_not_found' }));
    const outsider = await put({ level: 'muted' });
    expect(outsider.status).toBe(404);
    expect(await outsider.json()).toEqual(await malformed.json());
  });

  it("sets the person's own level, from the session, and says what it is now", async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockSet.mockResolvedValue(ok({ level: 'big_stuff' }));

    const response = await put({ level: 'big_stuff', userId: 'someone-else' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ level: 'big_stuff' });
    expect(mockSet).toHaveBeenCalledWith(
      { brunchId: BRUNCH_ID, userId: 'member-user-uuid', level: 'big_stuff' },
      expect.anything(),
    );
  });

  it('answers 400 for a body that is not JSON and 422 for a level that does not exist', async () => {
    mockAuth.mockResolvedValue(SESSION);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect((await put('{not json')).status).toBe(400);
    for (const body of [{}, { level: 'loud' }, { level: 3 }]) {
      const response = await put(body);
      expect(response.status).toBe(422);
      expect((await response.json()).error.code).toBe('invalid');
    }
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('answers 500 with a code when the database fails', async () => {
    mockAuth.mockResolvedValue(SESSION);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockSet.mockResolvedValue(err({ kind: 'db_error', cause: new Error('down') }));

    const response = await put({ level: 'muted' });

    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe('internal');
  });
});
