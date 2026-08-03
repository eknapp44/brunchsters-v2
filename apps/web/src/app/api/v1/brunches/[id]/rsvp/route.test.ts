import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as BrunchstersCore from '@brunchsters/core';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@brunchsters/core', async (importOriginal) => {
  const actual = await importOriginal<typeof BrunchstersCore>();
  return {
    ...actual,
    updateRsvp: vi.fn(),
  };
});

import { updateRsvp } from '@brunchsters/core';
import { auth } from '@/auth';
import { POST } from './route';

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);
const mockUpdateRsvp = vi.mocked(updateRsvp);

const SESSION = { user: { id: 'attendee-user-uuid' } };
const VALID_BRUNCH_ID = '11111111-1111-4111-8111-111111111111';

function postRequest(body: unknown): Request {
  return new Request(`http://localhost/api/v1/brunches/${VALID_BRUNCH_ID}/rsvp`, {
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

describe('POST /api/v1/brunches/[id]/rsvp', () => {
  it('returns 401 when there is no session', async () => {
    mockAuth.mockResolvedValue(null);

    const response = await POST(postRequest({ response: 'yes' }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(401);
    expect(mockUpdateRsvp).not.toHaveBeenCalled();
  });

  it('returns 404 for a malformed brunch id', async () => {
    mockAuth.mockResolvedValue(SESSION);

    const response = await POST(postRequest({ response: 'yes' }), {
      params: params('not-a-uuid'),
    });

    expect(response.status).toBe(404);
    expect(mockUpdateRsvp).not.toHaveBeenCalled();
  });

  it('returns 422 for an invalid response value', async () => {
    mockAuth.mockResolvedValue(SESSION);

    const response = await POST(postRequest({ response: 'sure' }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(422);
    expect(mockUpdateRsvp).not.toHaveBeenCalled();
  });

  it('returns 200 with the brunchId on success', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockUpdateRsvp.mockResolvedValue(ok({ brunchId: VALID_BRUNCH_ID as never }));

    const response = await POST(postRequest({ response: 'maybe' }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ brunchId: VALID_BRUNCH_ID });
    expect(mockUpdateRsvp).toHaveBeenCalledWith(
      expect.objectContaining({
        brunchId: VALID_BRUNCH_ID,
        viewerId: SESSION.user.id,
        response: 'maybe',
      }),
      expect.anything(),
    );
  });

  it('returns 403 when the viewer is not an attendee', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockUpdateRsvp.mockResolvedValue(err({ kind: 'not_attendee' }));

    const response = await POST(postRequest({ response: 'yes' }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(403);
  });

  it('returns 500 on a db_error', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockUpdateRsvp.mockResolvedValue(err({ kind: 'db_error', cause: new Error('boom') }));

    const response = await POST(postRequest({ response: 'yes' }), {
      params: params(VALID_BRUNCH_ID),
    });

    expect(response.status).toBe(500);
  });
});
