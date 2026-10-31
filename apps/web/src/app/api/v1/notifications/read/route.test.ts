import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as BrunchstersCore from '@brunchsters/core';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@brunchsters/core', async (importOriginal) => {
  const actual = await importOriginal<typeof BrunchstersCore>();
  return { ...actual, markRead: vi.fn(), markAllRead: vi.fn() };
});

import { markAllRead, markRead } from '@brunchsters/core';
import { auth } from '@/auth';
import { enforceWriteLimit } from '@/lib/rateLimit';
import { rateLimitedResponse } from '@/lib/rateLimitHttp';
import { POST } from './route';

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);
const mockMarkRead = vi.mocked(markRead);
const mockMarkAllRead = vi.mocked(markAllRead);
const mockEnforceWriteLimit = vi.mocked(enforceWriteLimit);

const SESSION = { user: { id: 'signed-in-user-uuid' } };

function post(body: unknown): Promise<Response> {
  return POST(
    new Request('http://localhost/api/v1/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('POST /api/v1/notifications/read', () => {
  it('answers 401 with a code when signed out, and spends nothing', async () => {
    mockAuth.mockResolvedValue(null);

    const response = await post({ all: true });

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('signed_out');
    expect(mockEnforceWriteLimit).not.toHaveBeenCalled();
    expect(mockMarkAllRead).not.toHaveBeenCalled();
  });

  it("spends the signed-in person's write budget first, and stops when it is spent", async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockEnforceWriteLimit.mockResolvedValue(
      rateLimitedResponse({ policy: 'writes', retryAfterSeconds: 9 }),
    );

    const response = await post({ ids: ['a'] });

    expect(mockEnforceWriteLimit).toHaveBeenCalledWith('signed-in-user-uuid');
    expect(response.status).toBe(429);
    expect(mockMarkRead).not.toHaveBeenCalled();
  });

  it("marks the named ids read for the caller only, whoever's ids they are", async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockMarkRead.mockResolvedValue(ok({ marked: 1 }));

    const response = await post({ ids: ['11111111-1111-4111-8111-111111111111', 'not-a-uuid'] });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ marked: 1 });
    // The user id comes from the session; the ids are passed on untouched for the service to match.
    expect(mockMarkRead).toHaveBeenCalledWith(
      {
        userId: 'signed-in-user-uuid',
        ids: ['11111111-1111-4111-8111-111111111111', 'not-a-uuid'],
      },
      expect.anything(),
    );
  });

  it('answers a made-up id exactly as it answers someone else’s: 200 and nothing marked', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockMarkRead.mockResolvedValue(ok({ marked: 0 }));

    const response = await post({ ids: ['0b7e1c9e-0000-4000-8000-000000000000'] });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ marked: 0 });
  });

  it('marks everything read for the caller on { all: true }', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockMarkAllRead.mockResolvedValue(ok({ marked: 4 }));

    const response = await post({ all: true });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ marked: 4 });
    expect(mockMarkAllRead).toHaveBeenCalledWith(
      { userId: 'signed-in-user-uuid' },
      expect.anything(),
    );
    expect(mockMarkRead).not.toHaveBeenCalled();
  });

  it('answers 400 for a body that is not JSON and 422 for anything else it cannot read', async () => {
    mockAuth.mockResolvedValue(SESSION);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect((await post('{not json')).status).toBe(400);
    for (const body of [{}, { ids: [] }, { ids: [1] }, { all: false }]) {
      const response = await post(body);
      expect(response.status).toBe(422);
      expect((await response.json()).error.code).toBe('invalid');
    }
    expect(await post({ ids: Array.from({ length: 101 }, () => 'a') })).toHaveProperty(
      'status',
      422,
    );
    expect(mockMarkRead).not.toHaveBeenCalled();
    expect(mockMarkAllRead).not.toHaveBeenCalled();
  });

  it('answers 500 with a code when the database fails', async () => {
    mockAuth.mockResolvedValue(SESSION);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockMarkAllRead.mockResolvedValue(err({ kind: 'db_error', cause: new Error('down') }));

    const response = await post({ all: true });

    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe('internal');
  });
});
