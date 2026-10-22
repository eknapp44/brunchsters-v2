import type { DbClient } from '@brunchsters/database';
import type { InviteToken } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import { getInviteByToken } from './getInviteByToken';

const VALID_INVITE = {
  token: 'valid-token',
  brunch: {
    title: 'Weekend Brunch',
    description: 'Pancakes and mimosas',
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

    const result = await getInviteByToken('valid-token' as InviteToken, { db });

    expect(result).toEqual({
      brunchTitle: 'Weekend Brunch',
      hostName: 'Alice Host',
      description: 'Pancakes and mimosas',
      brunchStatusLabel: 'Active',
    });
  });

  it('leaves the description undefined when the brunch has none', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      ...VALID_INVITE,
      brunch: { ...VALID_INVITE.brunch, description: null },
    });

    const result = await getInviteByToken('valid-token' as InviteToken, {
      db: makeMockDb(findFirst),
    });

    expect(result?.description).toBeUndefined();
  });

  it('queries only non-expired tokens of brunches that are not deleted', async () => {
    const findFirst = vi.fn().mockResolvedValue(VALID_INVITE);
    const db = makeMockDb(findFirst);

    await getInviteByToken('valid-token' as InviteToken, { db });

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          token: 'valid-token',
          tokenExpiresAt: { gt: expect.any(Date) },
          brunch: { deletedAt: null },
        },
      }),
    );
  });

  it('returns undefined for an invalid, expired, or revoked token', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const db = makeMockDb(findFirst);

    const result = await getInviteByToken('bad-token' as InviteToken, { db });

    expect(result).toBeUndefined();
  });
});
