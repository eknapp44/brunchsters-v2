import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as BrunchstersCore from '@brunchsters/core';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@brunchsters/core', async (importOriginal) => {
  const actual = await importOriginal<typeof BrunchstersCore>();
  return {
    ...actual, // keep the real addTimeRequestSchema — validation runs for real
    addTime: vi.fn(),
  };
});

import { addTime } from '@brunchsters/core';
import { auth } from '@/auth';
import { POST } from './route';

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);
const mockAddTime = vi.mocked(addTime);

const SESSION = { user: { id: 'host-user-uuid' } };
const VALID_BRUNCH_ID = '11111111-1111-4111-8111-111111111111';
const FUTURE_ISO = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

function postRequest(body: unknown): Request {
  return new Request(`http://localhost/api/v1/brunches/${VALID_BRUNCH_ID}/times`, {
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

describe('POST /api/v1/brunches/[id]/times', () => {
  it('returns 401 when there is no session', async () => {
    mockAuth.mockResolvedValue(null);

    const response = await POST(postRequest({ scheduledAt: FUTURE_ISO }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(401);
    expect(mockAddTime).not.toHaveBeenCalled();
  });

  it('returns 404 for a malformed brunch id', async () => {
    mockAuth.mockResolvedValue(SESSION);

    const response = await POST(postRequest({ scheduledAt: FUTURE_ISO }), {
      params: params('not-a-uuid'),
    });

    expect(response.status).toBe(404);
    expect(mockAddTime).not.toHaveBeenCalled();
  });

  it('returns 422 for a past scheduledAt', async () => {
    mockAuth.mockResolvedValue(SESSION);

    const response = await POST(postRequest({ scheduledAt: '2020-01-01T12:00:00.000Z' }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(422);
    expect(mockAddTime).not.toHaveBeenCalled();
  });

  it('returns 201 with the created time id on success', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockAddTime.mockResolvedValue(ok({ id: 'time-1' as never }));

    const response = await POST(postRequest({ scheduledAt: FUTURE_ISO }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: 'time-1' });
    expect(mockAddTime).toHaveBeenCalledWith(
      expect.objectContaining({ requestedById: 'host-user-uuid', scheduledAt: FUTURE_ISO }),
      expect.anything(),
    );
  });

  it('returns 403 when the requester is not the host', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockAddTime.mockResolvedValue(err({ kind: 'not_host' }));

    const response = await POST(postRequest({ scheduledAt: FUTURE_ISO }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(403);
  });

  it('returns 409 when the brunch is not active', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockAddTime.mockResolvedValue(err({ kind: 'brunch_not_active' }));

    const response = await POST(postRequest({ scheduledAt: FUTURE_ISO }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(409);
  });

  it('returns 409 when voting is closed', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockAddTime.mockResolvedValue(err({ kind: 'voting_closed' }));

    const response = await POST(postRequest({ scheduledAt: FUTURE_ISO }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(409);
  });

  it('returns 404 when the brunch does not exist', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockAddTime.mockResolvedValue(err({ kind: 'brunch_not_found' }));

    const response = await POST(postRequest({ scheduledAt: FUTURE_ISO }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(404);
  });

  it('returns 409 when the time is already an option', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockAddTime.mockResolvedValue(err({ kind: 'already_added' }));

    const response = await POST(postRequest({ scheduledAt: FUTURE_ISO }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(409);
  });

  it('returns 500 on an unexpected service error', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockAddTime.mockResolvedValue(err({ kind: 'db_error', cause: new Error('boom') }));

    const response = await POST(postRequest({ scheduledAt: FUTURE_ISO }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(500);
  });
});
