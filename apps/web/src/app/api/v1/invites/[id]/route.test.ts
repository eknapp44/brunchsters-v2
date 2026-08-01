import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@brunchsters/core', () => ({ revokeInvite: vi.fn() }));

import { revokeInvite } from '@brunchsters/core';
import { auth } from '@/auth';
import { DELETE } from './route';

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);
const mockRevokeInvite = vi.mocked(revokeInvite);

const SESSION = { user: { id: 'host-user-uuid' } };
const VALID_INVITE_ID = '33333333-3333-4333-8333-333333333333';

function params(id: string): Promise<{ id: string }> {
  return Promise.resolve({ id });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('DELETE /api/v1/invites/[id]', () => {
  it('returns 401 when there is no session', async () => {
    mockAuth.mockResolvedValue(null);

    const response = await DELETE(new Request('http://localhost'), {
      params: params(VALID_INVITE_ID),
    });

    expect(response.status).toBe(401);
    expect(mockRevokeInvite).not.toHaveBeenCalled();
  });

  it('returns 404 for a malformed invite id', async () => {
    mockAuth.mockResolvedValue(SESSION);

    const response = await DELETE(new Request('http://localhost'), {
      params: params('not-a-uuid'),
    });

    expect(response.status).toBe(404);
    expect(mockRevokeInvite).not.toHaveBeenCalled();
  });

  it('returns 204 on success', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockRevokeInvite.mockResolvedValue(ok({ id: VALID_INVITE_ID as never }));

    const response = await DELETE(new Request('http://localhost'), {
      params: params(VALID_INVITE_ID),
    });

    expect(response.status).toBe(204);
    expect(mockRevokeInvite).toHaveBeenCalledWith(
      expect.objectContaining({ inviteId: VALID_INVITE_ID, requestedById: 'host-user-uuid' }),
      expect.anything(),
    );
  });

  it('returns 403 when the requester is not the host', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockRevokeInvite.mockResolvedValue(err({ kind: 'not_host' }));

    const response = await DELETE(new Request('http://localhost'), {
      params: params(VALID_INVITE_ID),
    });

    expect(response.status).toBe(403);
  });

  it('returns 404 when the invite does not exist', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockRevokeInvite.mockResolvedValue(err({ kind: 'invite_not_found' }));

    const response = await DELETE(new Request('http://localhost'), {
      params: params(VALID_INVITE_ID),
    });

    expect(response.status).toBe(404);
  });
});
