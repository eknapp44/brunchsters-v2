import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as BrunchstersCore from '@brunchsters/core';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@brunchsters/core', async (importOriginal) => {
  const actual = await importOriginal<typeof BrunchstersCore>();
  return {
    ...actual,
    reviewInviteSuggestion: vi.fn(),
  };
});

import { reviewInviteSuggestion } from '@brunchsters/core';
import { auth } from '@/auth';
import { POST } from './route';

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);
const mockReview = vi.mocked(reviewInviteSuggestion);

const SESSION = { user: { id: 'host-user-uuid' } };
const VALID_SUGGESTION_ID = '22222222-2222-4222-8222-222222222222';

function postRequest(body: unknown): Request {
  return new Request(`http://localhost/api/v1/suggestions/${VALID_SUGGESTION_ID}/review`, {
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

describe('POST /api/v1/suggestions/[id]/review', () => {
  it('returns 401 when there is no session', async () => {
    mockAuth.mockResolvedValue(null);

    const response = await POST(postRequest({ decision: 'approve' }), {
      params: params(VALID_SUGGESTION_ID),
    });

    expect(response.status).toBe(401);
    expect(mockReview).not.toHaveBeenCalled();
  });

  it('returns 404 for a malformed suggestion id', async () => {
    mockAuth.mockResolvedValue(SESSION);

    const response = await POST(postRequest({ decision: 'approve' }), {
      params: params('not-a-uuid'),
    });

    expect(response.status).toBe(404);
  });

  it('returns 422 for an invalid decision', async () => {
    mockAuth.mockResolvedValue(SESSION);

    const response = await POST(postRequest({ decision: 'maybe' }), {
      params: params(VALID_SUGGESTION_ID),
    });

    expect(response.status).toBe(422);
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
  });

  it('returns 404 when the suggestion does not exist', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockReview.mockResolvedValue(err({ kind: 'suggestion_not_found' }));

    const response = await POST(postRequest({ decision: 'approve' }), {
      params: params(VALID_SUGGESTION_ID),
    });

    expect(response.status).toBe(404);
  });

  it('returns 409 when the suggestion was already reviewed', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockReview.mockResolvedValue(err({ kind: 'already_reviewed' }));

    const response = await POST(postRequest({ decision: 'decline' }), {
      params: params(VALID_SUGGESTION_ID),
    });

    expect(response.status).toBe(409);
  });
});
