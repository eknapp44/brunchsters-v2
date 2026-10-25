import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as BrunchstersCore from '@brunchsters/core';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@brunchsters/core', async (importOriginal) => {
  const actual = await importOriginal<typeof BrunchstersCore>();
  return {
    ...actual,
    reviewLocationSuggestion: vi.fn(),
  };
});

import { reviewLocationSuggestion } from '@brunchsters/core';
import { auth } from '@/auth';
import { POST } from './route';
import { errorCodeOf } from '@/test-support/errorCodeOf';

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);
const mockReview = vi.mocked(reviewLocationSuggestion);

const SESSION = { user: { id: 'host-user-uuid' } };
const VALID_SUGGESTION_ID = '22222222-2222-4222-8222-222222222222';

function postRequest(body: unknown): Request {
  return new Request(`http://localhost/api/v1/location-suggestions/${VALID_SUGGESTION_ID}/review`, {
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

describe('POST /api/v1/location-suggestions/[id]/review', () => {
  it('returns 401 when there is no session', async () => {
    mockAuth.mockResolvedValue(null);

    const response = await POST(postRequest({ decision: 'approve' }), {
      params: params(VALID_SUGGESTION_ID),
    });

    expect(response.status).toBe(401);
    expect(await errorCodeOf(response)).toBe('signed_out');
    expect(mockReview).not.toHaveBeenCalled();
  });

  it('returns 404 for a malformed suggestion id', async () => {
    mockAuth.mockResolvedValue(SESSION);

    const response = await POST(postRequest({ decision: 'approve' }), {
      params: params('not-a-uuid'),
    });

    expect(response.status).toBe(404);
    expect(await errorCodeOf(response)).toBe('not_found');
  });

  it('returns 422 for an invalid decision', async () => {
    mockAuth.mockResolvedValue(SESSION);

    const response = await POST(postRequest({ decision: 'maybe' }), {
      params: params(VALID_SUGGESTION_ID),
    });

    expect(response.status).toBe(422);
    expect(await errorCodeOf(response)).toBe('invalid');
    expect(mockReview).not.toHaveBeenCalled();
  });

  it('returns 200 on a successful review', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockReview.mockResolvedValue(ok({ suggestionId: VALID_SUGGESTION_ID as never }));

    const response = await POST(postRequest({ decision: 'approve' }), {
      params: params(VALID_SUGGESTION_ID),
    });

    expect(response.status).toBe(200);
    expect(mockReview).toHaveBeenCalledWith(
      expect.objectContaining({ reviewedById: 'host-user-uuid', decision: 'approve' }),
      expect.anything(),
    );
  });

  it('returns 403 when the reviewer is not the host', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockReview.mockResolvedValue(err({ kind: 'not_host' }));

    const response = await POST(postRequest({ decision: 'approve' }), {
      params: params(VALID_SUGGESTION_ID),
    });

    expect(response.status).toBe(403);
    expect(await errorCodeOf(response)).toBe('forbidden');
  });

  it('returns 404 when the suggestion does not exist', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockReview.mockResolvedValue(err({ kind: 'suggestion_not_found' }));

    const response = await POST(postRequest({ decision: 'approve' }), {
      params: params(VALID_SUGGESTION_ID),
    });

    expect(response.status).toBe(404);
    expect(await errorCodeOf(response)).toBe('not_found');
  });

  it('returns 409 when the brunch is no longer active', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockReview.mockResolvedValue(err({ kind: 'brunch_not_active' }));

    const response = await POST(postRequest({ decision: 'approve' }), {
      params: params(VALID_SUGGESTION_ID),
    });

    expect(response.status).toBe(409);
    expect(await errorCodeOf(response)).toBe('brunch_not_active');
  });

  it('returns 409 when voting is closed', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockReview.mockResolvedValue(err({ kind: 'voting_closed' }));

    const response = await POST(postRequest({ decision: 'approve' }), {
      params: params(VALID_SUGGESTION_ID),
    });

    expect(response.status).toBe(409);
    expect(await errorCodeOf(response)).toBe('voting_closed');
  });

  it('returns 409 when the place is already an option', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockReview.mockResolvedValue(err({ kind: 'already_added' }));

    const response = await POST(postRequest({ decision: 'approve' }), {
      params: params(VALID_SUGGESTION_ID),
    });

    expect(response.status).toBe(409);
    expect(await errorCodeOf(response)).toBe('already_there');
  });

  it('returns 409 when the suggestion was already reviewed', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockReview.mockResolvedValue(err({ kind: 'already_reviewed' }));

    const response = await POST(postRequest({ decision: 'decline' }), {
      params: params(VALID_SUGGESTION_ID),
    });

    expect(response.status).toBe(409);
    expect(await errorCodeOf(response)).toBe('already_reviewed');
  });

  it('returns 500 on an unexpected service error', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockReview.mockResolvedValue(err({ kind: 'db_error', cause: new Error('boom') }));

    const response = await POST(postRequest({ decision: 'approve' }), {
      params: params(VALID_SUGGESTION_ID),
    });

    expect(response.status).toBe(500);
    expect(await errorCodeOf(response)).toBe('internal');
  });
});
