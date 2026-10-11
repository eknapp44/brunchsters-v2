import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as BrunchstersCore from '@brunchsters/core';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@brunchsters/core', async (importOriginal) => {
  const actual = await importOriginal<typeof BrunchstersCore>();
  return {
    ...actual, // keep the real locationInputSchema — validation runs for real
    suggestLocation: vi.fn(),
  };
});

import { suggestLocation } from '@brunchsters/core';
import { auth } from '@/auth';
import { POST } from './route';

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);
const mockSuggestLocation = vi.mocked(suggestLocation);

const SESSION = { user: { id: 'attendee-user-uuid' } };
const VALID_BRUNCH_ID = '11111111-1111-4111-8111-111111111111';

const LOCATION_BODY = {
  placeId: 'place-a',
  placeName: 'Cafe A',
  placeAddress: '1 Main St',
  placeUrl: 'https://maps.google.com/?cid=a',
  timezone: 'America/Chicago',
};

function postRequest(body: unknown): Request {
  return new Request(`http://localhost/api/v1/brunches/${VALID_BRUNCH_ID}/location-suggestions`, {
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

describe('POST /api/v1/brunches/[id]/location-suggestions', () => {
  it('returns 401 when there is no session', async () => {
    mockAuth.mockResolvedValue(null);

    const response = await POST(postRequest(LOCATION_BODY), { params: params(VALID_BRUNCH_ID) });

    expect(response.status).toBe(401);
    expect(mockSuggestLocation).not.toHaveBeenCalled();
  });

  it('returns 404 for a malformed brunch id', async () => {
    mockAuth.mockResolvedValue(SESSION);

    const response = await POST(postRequest(LOCATION_BODY), { params: params('not-a-uuid') });

    expect(response.status).toBe(404);
    expect(mockSuggestLocation).not.toHaveBeenCalled();
  });

  it('returns 422 for an invalid timezone', async () => {
    mockAuth.mockResolvedValue(SESSION);

    const response = await POST(postRequest({ ...LOCATION_BODY, timezone: 'Not/AZone' }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(422);
    expect(mockSuggestLocation).not.toHaveBeenCalled();
  });

  it('returns 201 with the created suggestion on success', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockSuggestLocation.mockResolvedValue(
      ok({ suggestionId: 'suggestion-1' as never, status: 'pending' }),
    );

    const response = await POST(postRequest(LOCATION_BODY), { params: params(VALID_BRUNCH_ID) });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ suggestionId: 'suggestion-1', status: 'pending' });
    expect(mockSuggestLocation).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedById: 'attendee-user-uuid', location: LOCATION_BODY }),
      expect.anything(),
    );
  });

  it('returns 403 when suggestions are disabled', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockSuggestLocation.mockResolvedValue(err({ kind: 'suggestions_disabled' }));

    const response = await POST(postRequest(LOCATION_BODY), { params: params(VALID_BRUNCH_ID) });

    expect(response.status).toBe(403);
  });

  it('returns 404 when the requester is not a member (an outsider cannot tell the brunch exists)', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockSuggestLocation.mockResolvedValue(err({ kind: 'brunch_not_found' }));

    const response = await POST(postRequest(LOCATION_BODY), { params: params(VALID_BRUNCH_ID) });

    expect(response.status).toBe(404);
  });

  it('returns 409 when the brunch is not active', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockSuggestLocation.mockResolvedValue(err({ kind: 'brunch_not_active' }));

    const response = await POST(postRequest(LOCATION_BODY), { params: params(VALID_BRUNCH_ID) });

    expect(response.status).toBe(409);
  });

  it('returns 409 for a duplicate suggestion', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockSuggestLocation.mockResolvedValue(err({ kind: 'already_suggested' }));

    const response = await POST(postRequest(LOCATION_BODY), { params: params(VALID_BRUNCH_ID) });

    expect(response.status).toBe(409);
  });

  it('returns 404 when the brunch does not exist', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockSuggestLocation.mockResolvedValue(err({ kind: 'brunch_not_found' }));

    const response = await POST(postRequest(LOCATION_BODY), { params: params(VALID_BRUNCH_ID) });

    expect(response.status).toBe(404);
  });

  it('returns 500 on an unexpected service error', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockSuggestLocation.mockResolvedValue(err({ kind: 'db_error', cause: new Error('boom') }));

    const response = await POST(postRequest(LOCATION_BODY), { params: params(VALID_BRUNCH_ID) });

    expect(response.status).toBe(500);
  });
});
