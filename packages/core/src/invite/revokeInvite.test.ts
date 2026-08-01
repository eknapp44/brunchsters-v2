import type { DbClient } from '@brunchsters/database';
import type { InviteId, UserId } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import { revokeInvite } from './revokeInvite';

const HOST_ID = 'host-uuid' as UserId;
const INVITE_ID = 'invite-uuid' as InviteId;

const BASE_INVITE = {
  id: INVITE_ID,
  brunchId: 'brunch-uuid',
  brunch: { id: 'brunch-uuid', hostId: HOST_ID },
};

function makeMockDb(
  overrides: {
    findFirst?: ReturnType<typeof vi.fn>;
    update?: ReturnType<typeof vi.fn>;
  } = {},
): DbClient {
  return {
    brunchInvite: {
      findFirst: overrides.findFirst ?? vi.fn().mockResolvedValue(BASE_INVITE),
      update: overrides.update ?? vi.fn().mockResolvedValue({ id: INVITE_ID }),
    },
  } as unknown as DbClient;
}

describe('revokeInvite', () => {
  it('soft-deletes the invite', async () => {
    const update = vi.fn().mockResolvedValue({ id: INVITE_ID });
    const db = makeMockDb({ update });

    const result = await revokeInvite({ inviteId: INVITE_ID, requestedById: HOST_ID }, { db });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ id: INVITE_ID });
    expect(update).toHaveBeenCalledWith({
      where: { id: INVITE_ID },
      data: { deletedAt: expect.any(Date), deletedBy: HOST_ID },
    });
  });

  it('returns invite_not_found when the invite does not exist', async () => {
    const db = makeMockDb({ findFirst: vi.fn().mockResolvedValue(null) });

    const result = await revokeInvite({ inviteId: INVITE_ID, requestedById: HOST_ID }, { db });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'invite_not_found' });
  });

  it('returns not_host when the requester is not the brunch host', async () => {
    const db = makeMockDb();

    const result = await revokeInvite(
      { inviteId: INVITE_ID, requestedById: 'someone-else-uuid' as UserId },
      { db },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'not_host' });
  });

  it('returns db_error when the update fails', async () => {
    const db = makeMockDb({ update: vi.fn().mockRejectedValue(new Error('boom')) });

    const result = await revokeInvite({ inviteId: INVITE_ID, requestedById: HOST_ID }, { db });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'db_error', cause: expect.any(Error) });
  });
});
