import type { DbClient } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import { getPendingSuggestionsForBrunch } from './getPendingSuggestionsForBrunch';

const BRUNCH_ID = 'brunch-uuid' as BrunchId;
const HOST_ID = 'host-uuid' as UserId;
const OTHER_ID = 'other-uuid' as UserId;

function makeMockDb(
  overrides: {
    brunchFindFirst?: ReturnType<typeof vi.fn>;
    suggestionFindMany?: ReturnType<typeof vi.fn>;
  } = {},
): DbClient {
  return {
    brunch: {
      findFirst:
        overrides.brunchFindFirst ?? vi.fn().mockResolvedValue({ id: BRUNCH_ID, hostId: HOST_ID }),
    },
    brunchInviteSuggestion: {
      findMany: overrides.suggestionFindMany ?? vi.fn().mockResolvedValue([]),
    },
  } as unknown as DbClient;
}

describe('getPendingSuggestionsForBrunch', () => {
  it('returns brunch_not_found when the brunch does not exist', async () => {
    const db = makeMockDb({ brunchFindFirst: vi.fn().mockResolvedValue(null) });

    const result = await getPendingSuggestionsForBrunch(
      { brunchId: BRUNCH_ID, requestedById: HOST_ID },
      { db },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
  });

  it('returns not_host when the requester is not the host', async () => {
    const db = makeMockDb();

    const result = await getPendingSuggestionsForBrunch(
      { brunchId: BRUNCH_ID, requestedById: OTHER_ID },
      { db },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'not_host' });
  });

  it('returns an empty list when there are no pending suggestions', async () => {
    const db = makeMockDb();

    const result = await getPendingSuggestionsForBrunch(
      { brunchId: BRUNCH_ID, requestedById: HOST_ID },
      { db },
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([]);
  });

  it('maps pending suggestions with the suggester name', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 'suggestion-uuid',
        suggestedEmail: 'friend@example.com',
        suggestedBy: { name: 'Alex Attendee' },
      },
    ]);
    const db = makeMockDb({ suggestionFindMany: findMany });

    const result = await getPendingSuggestionsForBrunch(
      { brunchId: BRUNCH_ID, requestedById: HOST_ID },
      { db },
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([
      {
        id: 'suggestion-uuid',
        suggestedEmail: 'friend@example.com',
        suggestedByName: 'Alex Attendee',
      },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { brunchId: BRUNCH_ID, status: { code: 'pending' } },
      }),
    );
  });
});
