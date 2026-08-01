import type { DbClient } from '@brunchsters/database';
import { describe, expect, it, vi } from 'vitest';
import { getInviteByToken } from './getInviteByToken';

const VALID_INVITE = {
  token: 'valid-token',
  brunch: {
    title: 'Weekend Brunch',
    host: { name: 'Alice Host' },
    status: { label: 'Active' },
  },
};

function makeMockDb(findFirst: ReturnType<typeof vi.fn>): DbClient {
  return { brunchInvite: { findFirst } } as unknown as DbClient;
}

describe('getInviteByToken', () => {
  it('returns a minimal preview for a valid token', async () => {
    const findFirst = vi.fn().mockResolvedValue(VALID_INVITE);
    const db = makeMockDb(findFirst);

    const result = await getInviteByToken('valid-token', { db });

    expect(result).toEqual({
      brunchTitle: 'Weekend Brunch',
      hostName: 'Alice Host',
      brunchStatusLabel: 'Active',
    });
  });

  it('queries only non-expired tokens', async () => {
    const findFirst = vi.fn().mockResolvedValue(VALID_INVITE);
    const db = makeMockDb(findFirst);

    await getInviteByToken('valid-token', { db });

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { token: 'valid-token', tokenExpiresAt: { gt: expect.any(Date) } },
      }),
    );
  });

  it('returns undefined for an invalid, expired, or revoked token', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const db = makeMockDb(findFirst);

    const result = await getInviteByToken('bad-token', { db });

    expect(result).toBeUndefined();
  });
});
