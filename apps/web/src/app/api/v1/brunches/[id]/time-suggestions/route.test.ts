import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as BrunchstersCore from '@brunchsters/core';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@brunchsters/core', async (importOriginal) => {
  const actual = await importOriginal<typeof BrunchstersCore>();
  return {
    ...actual, // keep the real suggestTimeRequestSchema — validation runs for real
    suggestTime: vi.fn(),
  };
});

import { suggestTime } from '@brunchsters/core';
import { auth } from '@/auth';
import { POST } from './route';
import { errorCodeOf } from '@/test-support/errorCodeOf';

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);
const mockSuggestTime = vi.mocked(suggestTime);

const SESSION = { user: { id: 'attendee-user-uuid' } };
const VALID_BRUNCH_ID = '11111111-1111-4111-8111-111111111111';
const FUTURE_ISO = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

function postRequest(body: unknown): Request {
  return new Request(`http://localhost/api/v1/brunches/${VALID_BRUNCH_ID}/time-suggestions`, {
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

describe('POST /api/v1/brunches/[id]/time-suggestions', () => {
  it('returns 401 when there is no session', async () => {
    mockAuth.mockResolvedValue(null);

    const response = await POST(postRequest({ scheduledAt: FUTURE_ISO }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(401);
    expect(await errorCodeOf(response)).toBe('signed_out');
    expect(mockSuggestTime).not.toHaveBeenCalled();
  });

  it('returns 404 for a malformed brunch id', async () => {
    mockAuth.mockResolvedValue(SESSION);

    const response = await POST(postRequest({ scheduledAt: FUTURE_ISO }), {
      params: params('not-a-uuid'),
    });

    expect(response.status).toBe(404);
    expect(await errorCodeOf(response)).toBe('not_found');
    expect(mockSuggestTime).not.toHaveBeenCalled();
  });

  it('returns 422 for a past scheduledAt', async () => {
    mockAuth.mockResolvedValue(SESSION);

    const response = await POST(postRequest({ scheduledAt: '2000-01-01T00:00:00.000Z' }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(422);
    expect(await errorCodeOf(response)).toBe('invalid');
    expect(mockSuggestTime).not.toHaveBeenCalled();
  });

  it('returns 201 with the created suggestion on success', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockSuggestTime.mockResolvedValue(
      ok({ suggestionId: 'suggestion-1' as never, status: 'pending' }),
    );

    const response = await POST(postRequest({ scheduledAt: FUTURE_ISO }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ suggestionId: 'suggestion-1', status: 'pending' });
    expect(mockSuggestTime).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedById: 'attendee-user-uuid', scheduledAt: FUTURE_ISO }),
      expect.anything(),
    );
  });

  it('returns 403 when suggestions are disabled', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockSuggestTime.mockResolvedValue(err({ kind: 'suggestions_disabled' }));

    const response = await POST(postRequest({ scheduledAt: FUTURE_ISO }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(403);
    expect(await errorCodeOf(response)).toBe('suggestions_off');
  });

  it('returns 404 when the requester is not a member (an outsider cannot tell the brunch exists)', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockSuggestTime.mockResolvedValue(err({ kind: 'brunch_not_found' }));

    const response = await POST(postRequest({ scheduledAt: FUTURE_ISO }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(404);
    expect(await errorCodeOf(response)).toBe('not_found');
  });

  it('returns 409 when the brunch is not active', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockSuggestTime.mockResolvedValue(err({ kind: 'brunch_not_active' }));

    const response = await POST(postRequest({ scheduledAt: FUTURE_ISO }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(409);
    expect(await errorCodeOf(response)).toBe('brunch_not_active');
  });

  it('returns 409 for a duplicate suggestion', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockSuggestTime.mockResolvedValue(err({ kind: 'already_suggested' }));

    const response = await POST(postRequest({ scheduledAt: FUTURE_ISO }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(409);
    expect(await errorCodeOf(response)).toBe('already_there');
  });

  it('returns 404 when the brunch does not exist', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockSuggestTime.mockResolvedValue(err({ kind: 'brunch_not_found' }));

    const response = await POST(postRequest({ scheduledAt: FUTURE_ISO }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(404);
    expect(await errorCodeOf(response)).toBe('not_found');
  });

  it('returns 500 on an unexpected service error', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockSuggestTime.mockResolvedValue(err({ kind: 'db_error', cause: new Error('boom') }));

    const response = await POST(postRequest({ scheduledAt: FUTURE_ISO }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(500);
    expect(await errorCodeOf(response)).toBe('internal');
  });
});
