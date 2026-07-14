import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as BrunchstersCore from '@brunchsters/core';

// Factory mocks: '@/auth' must never load for real here — the actual module
// throws at import time without Google OAuth env vars.
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@brunchsters/core', async (importOriginal) => {
  const actual = await importOriginal<typeof BrunchstersCore>();
  return {
    ...actual, // keep the real createBrunchRequestSchema — validation runs for real
    createBrunch: vi.fn(),
    getBrunchesForUser: vi.fn(),
  };
});

import { createBrunch, getBrunchesForUser } from '@brunchsters/core';
import { auth } from '@/auth';
import { GET, POST } from './route';

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);
const mockCreateBrunch = vi.mocked(createBrunch);
const mockGetBrunchesForUser = vi.mocked(getBrunchesForUser);

const SESSION = { user: { id: 'host-user-uuid' } };

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/v1/brunches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('POST /api/v1/brunches', () => {
  it('returns 401 when there is no session', async () => {
    mockAuth.mockResolvedValue(null);

    const response = await POST(postRequest({ title: 'Weekend Brunch' }));

    expect(response.status).toBe(401);
    expect(mockCreateBrunch).not.toHaveBeenCalled();
  });

  it('returns 422 when the title is missing', async () => {
    mockAuth.mockResolvedValue(SESSION);

    const response = await POST(postRequest({ description: 'no title' }));

    expect(response.status).toBe(422);
    const json = (await response.json()) as { errors: unknown[] };
    expect(json.errors.length).toBeGreaterThan(0);
    expect(mockCreateBrunch).not.toHaveBeenCalled();
  });

  it('returns 400 for a non-JSON body', async () => {
    mockAuth.mockResolvedValue(SESSION);

    const response = await POST(
      new Request('http://localhost/api/v1/brunches', { method: 'POST', body: 'not json' }),
    );

    expect(response.status).toBe(400);
  });

  it('returns 201 with id, title, and status on success', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockCreateBrunch.mockResolvedValue(ok({ id: 'new-brunch-uuid' as never }));

    const response = await POST(postRequest({ title: 'Weekend Brunch' }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      id: 'new-brunch-uuid',
      title: 'Weekend Brunch',
      status: 'draft',
    });
    expect(mockCreateBrunch).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Weekend Brunch',
        hostId: 'host-user-uuid', // from the session, not the body
        locations: [],
        times: [],
      }),
      expect.objectContaining({ db: expect.anything(), eventBus: expect.anything() }),
    );
  });

  it('ignores a hostId smuggled into the request body', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockCreateBrunch.mockResolvedValue(ok({ id: 'new-brunch-uuid' as never }));

    await POST(postRequest({ title: 'Weekend Brunch', hostId: 'attacker-uuid' }));

    expect(mockCreateBrunch).toHaveBeenCalledWith(
      expect.objectContaining({ hostId: 'host-user-uuid' }),
      expect.anything(),
    );
  });

  it('returns 500 when the service fails', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockCreateBrunch.mockResolvedValue(err({ kind: 'db_error', cause: new Error('boom') }));

    const response = await POST(postRequest({ title: 'Weekend Brunch' }));

    expect(response.status).toBe(500);
  });
});

describe('GET /api/v1/brunches', () => {
  it('returns 401 when there is no session', async () => {
    mockAuth.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mockGetBrunchesForUser).not.toHaveBeenCalled();
  });

  it('returns 200 with the brunch list for the session user', async () => {
    mockAuth.mockResolvedValue(SESSION);
    const summaries = [
      {
        id: 'brunch-uuid',
        title: 'Weekend Brunch',
        statusCode: 'draft',
        statusLabel: 'Draft',
        isHost: true,
        goingCount: 1,
        createdAt: new Date('2026-07-01T10:00:00.000Z'),
      },
    ];
    mockGetBrunchesForUser.mockResolvedValue(summaries as never);

    const response = await GET();

    expect(response.status).toBe(200);
    const json = (await response.json()) as { brunches: { id: string }[] };
    expect(json.brunches).toHaveLength(1);
    expect(json.brunches[0]?.id).toBe('brunch-uuid');
    expect(mockGetBrunchesForUser).toHaveBeenCalledWith(
      { userId: 'host-user-uuid' },
      expect.objectContaining({ db: expect.anything() }),
    );
  });
});
