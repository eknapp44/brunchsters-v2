import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@brunchsters/core', () => ({ getInviteByToken: vi.fn() }));

import { getInviteByToken } from '@brunchsters/core';
import { GET } from './route';

const mockGetInviteByToken = vi.mocked(getInviteByToken);

function params(token: string): Promise<{ token: string }> {
  return Promise.resolve({ token });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('GET /api/v1/invites/token/[token]', () => {
  it('returns 200 with the preview for a valid token — no auth required', async () => {
    mockGetInviteByToken.mockResolvedValue({
      brunchTitle: 'Weekend Brunch',
      hostName: 'Alice Host',
      brunchStatusLabel: 'Active',
    });

    const response = await GET(new Request('http://localhost'), { params: params('valid-token') });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      brunchTitle: 'Weekend Brunch',
      hostName: 'Alice Host',
      brunchStatusLabel: 'Active',
    });
  });

  it('returns 404 for an invalid, expired, or revoked token', async () => {
    mockGetInviteByToken.mockResolvedValue(undefined);

    const response = await GET(new Request('http://localhost'), { params: params('bad-token') });

    expect(response.status).toBe(404);
  });
});
