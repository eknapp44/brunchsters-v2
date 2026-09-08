import type { DbClient } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import { getInvitesForBrunch } from './getInvitesForBrunch';

const BRUNCH_ID = 'brunch-uuid' as BrunchId;
const HOST_ID = 'host-uuid' as UserId;

const BASE_BRUNCH = { id: BRUNCH_ID, hostId: HOST_ID, host: { email: 'host@example.com' } };

function makeMockDb(
  overrides: {
    brunchFindFirst?: ReturnType<typeof vi.fn>;
    inviteFindMany?: ReturnType<typeof vi.fn>;
  } = {},
): DbClient {
  return {
    brunch: { findFirst: overrides.brunchFindFirst ?? vi.fn().mockResolvedValue(BASE_BRUNCH) },
    brunchInvite: { findMany: overrides.inviteFindMany ?? vi.fn().mockResolvedValue([]) },
  } as unknown as DbClient;
}

describe('getInvitesForBrunch', () => {
  it('returns an empty list when there are no invites besides the synthetic host one', async () => {
    const db = makeMockDb();

    const result = await getInvitesForBrunch(
      { brunchId: BRUNCH_ID, requestedById: HOST_ID },
      { db },
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([]);
  });

  it('excludes the synthetic self-invite by filtering on the host email', async () => {
    const inviteFindMany = vi.fn().mockResolvedValue([]);
    const db = makeMockDb({ inviteFindMany });

    await getInvitesForBrunch({ brunchId: BRUNCH_ID, requestedById: HOST_ID }, { db });

    expect(inviteFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          brunchId: BRUNCH_ID,
          NOT: { invitedEmail: { equals: 'host@example.com', mode: 'insensitive' } },
        },
      }),
    );
  });

  it('maps a responded invite to its rsvp status code, including the token', async () => {
    const inviteFindMany = vi.fn().mockResolvedValue([
      {
        id: 'invite-1',
        invitedEmail: 'alice@example.com',
        lastResentAt: null,
        token: 'token-1',
        attendee: { rsvpStatus: { code: 'yes' } },
      },
    ]);
    const db = makeMockDb({ inviteFindMany });

    const result = await getInvitesForBrunch(
      { brunchId: BRUNCH_ID, requestedById: HOST_ID },
      { db },
    );

    expect(result._unsafeUnwrap()).toEqual([
      {
        id: 'invite-1',
        invitedEmail: 'alice@example.com',
        status: 'yes',
        lastResentAt: undefined,
        token: 'token-1',
      },
    ]);
  });

  it('maps a not-yet-responded invite (no attendee, or attendee with "invited") to pending', async () => {
    const inviteFindMany = vi.fn().mockResolvedValue([
      {
        id: 'invite-1',
        invitedEmail: 'alice@example.com',
        lastResentAt: null,
        token: 'token-1',
        attendee: null,
      },
      {
        id: 'invite-2',
        invitedEmail: 'bob@example.com',
        lastResentAt: null,
        token: 'token-2',
        attendee: { rsvpStatus: { code: 'invited' } },
      },
    ]);
    const db = makeMockDb({ inviteFindMany });

    const result = await getInvitesForBrunch(
      { brunchId: BRUNCH_ID, requestedById: HOST_ID },
      { db },
    );

    expect(result._unsafeUnwrap()).toEqual([
      {
        id: 'invite-1',
        invitedEmail: 'alice@example.com',
        status: 'pending',
        lastResentAt: undefined,
        token: 'token-1',
      },
      {
        id: 'invite-2',
        invitedEmail: 'bob@example.com',
        status: 'pending',
        lastResentAt: undefined,
        token: 'token-2',
      },
    ]);
  });

  it('returns brunch_not_found when the brunch does not exist', async () => {
    const db = makeMockDb({ brunchFindFirst: vi.fn().mockResolvedValue(null) });

    const result = await getInvitesForBrunch(
      { brunchId: BRUNCH_ID, requestedById: HOST_ID },
      { db },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
  });

  it('returns not_host when the requester is not the host', async () => {
    const db = makeMockDb();

    const result = await getInvitesForBrunch(
      { brunchId: BRUNCH_ID, requestedById: 'someone-else-uuid' as UserId },
      { db },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'not_host' });
  });
});
