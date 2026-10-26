import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as BrunchstersCore from '@brunchsters/core';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@brunchsters/core', async (importOriginal) => {
  const actual = await importOriginal<typeof BrunchstersCore>();
  return { ...actual, setNotificationPreferences: vi.fn() };
});

import { setNotificationPreferences } from '@brunchsters/core';
import { auth } from '@/auth';
import { enforceWriteLimit } from '@/lib/rateLimit';
import { rateLimitedResponse } from '@/lib/rateLimitHttp';
import { PUT } from './route';

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);
const mockSet = vi.mocked(setNotificationPreferences);
const mockEnforceWriteLimit = vi.mocked(enforceWriteLimit);

const SESSION = { user: { id: 'signed-in-user-uuid' } };
const GOOD = { types: ['brunch.confirmed'], channel: 'email', enabled: false };

function put(body: unknown): Promise<Response> {
  return PUT(
    new Request('http://localhost/api/v1/notification-preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('PUT /api/v1/notification-preferences', () => {
  it('answers 401 with a code when signed out, and spends and saves nothing', async () => {
    mockAuth.mockResolvedValue(null);

    const response = await put(GOOD);

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('signed_out');
    expect(mockEnforceWriteLimit).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("spends the signed-in person's write budget first, and stops when it is spent", async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockEnforceWriteLimit.mockResolvedValue(
      rateLimitedResponse({ policy: 'writes', retryAfterSeconds: 5 }),
    );

    const response = await put(GOOD);

    expect(mockEnforceWriteLimit).toHaveBeenCalledWith('signed-in-user-uuid');
    expect(response.status).toBe(429);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('saves the switch for the person in the session, and says what it saved', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockSet.mockResolvedValue(ok(undefined));

    const response = await put({ ...GOOD, enabled: true, userId: 'someone-else' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ...GOOD, enabled: true });
    // Whatever the body says about a person, the user is the session's.
    expect(mockSet).toHaveBeenCalledWith(
      {
        userId: 'signed-in-user-uuid',
        types: ['brunch.confirmed'],
        channel: 'email',
        enabled: true,
      },
      expect.anything(),
    );
  });

  it('answers 400 for a body that is not JSON and 422 for one it cannot read', async () => {
    mockAuth.mockResolvedValue(SESSION);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect((await put('{not json')).status).toBe(400);
    for (const body of [
      {},
      { ...GOOD, types: [] },
      { ...GOOD, types: ['not.a.type'] },
      { ...GOOD, channel: 'push' },
      { ...GOOD, enabled: 'yes' },
    ]) {
      const response = await put(body);
      expect(response.status).toBe(422);
      expect((await response.json()).error.code).toBe('invalid');
    }
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('answers 422 when the service refuses the switch (a type nothing produces, an email that does not exist)', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockSet.mockResolvedValue(err({ kind: 'invalid_selection' }));

    const response = await put({ types: ['rsvp.received'], channel: 'email', enabled: true });

    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe('invalid');
  });

  it('answers 500 with a code when the database fails', async () => {
    mockAuth.mockResolvedValue(SESSION);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockSet.mockResolvedValue(err({ kind: 'db_error', cause: new Error('down') }));

    const response = await put(GOOD);

    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe('internal');
  });
});
