import type { DbClient } from '@brunchsters/database';
import type { BrunchLocationSuggestionId, UserId } from '@brunchsters/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./addLocation', () => ({ addLocationInTransaction: vi.fn() }));
vi.mock('@brunchsters/database', () => ({ isUniqueConstraintError: vi.fn() }));

import { isUniqueConstraintError } from '@brunchsters/database';
import { addLocationInTransaction } from './addLocation';
import { reviewLocationSuggestion } from './reviewLocationSuggestion';

beforeEach(() => {
  vi.mocked(addLocationInTransaction).mockReset();
  vi.mocked(isUniqueConstraintError).mockReturnValue(false);
});

const HOST_ID = 'host-uuid' as UserId;
const SUGGESTION_ID = 'suggestion-uuid' as BrunchLocationSuggestionId;

const PENDING_SUGGESTION = {
  id: SUGGESTION_ID,
  brunchId: 'brunch-uuid',
  placeId: 'place-a',
  placeName: 'Cafe A',
  placeAddress: '1 Main St',
  placeUrl: 'https://maps.google.com/?cid=a',
  timezone: 'America/Chicago',
  brunch: { id: 'brunch-uuid', hostId: HOST_ID, status: { code: 'active' } },
  status: { code: 'pending' },
};

type MockTx = { brunchLocationSuggestion: { update: ReturnType<typeof vi.fn> } };

function makeMockDb(
  overrides: {
    findFirst?: ReturnType<typeof vi.fn>;
    statusFindFirst?: ReturnType<typeof vi.fn>;
    txUpdate?: ReturnType<typeof vi.fn>;
  } = {},
): DbClient {
  const txUpdate = overrides.txUpdate ?? vi.fn().mockResolvedValue({});
  const tx: MockTx = { brunchLocationSuggestion: { update: txUpdate } };

  return {
    brunchLocationSuggestion: {
      findFirst: overrides.findFirst ?? vi.fn().mockResolvedValue(PENDING_SUGGESTION),
    },
    brunchOptionSuggestionStatus: {
      findFirst: overrides.statusFindFirst ?? vi.fn().mockResolvedValue({ id: 'status-approved' }),
    },
    $transaction: vi.fn().mockImplementation((fn: (tx: MockTx) => Promise<unknown>) => fn(tx)),
  } as unknown as DbClient;
}

describe('reviewLocationSuggestion', () => {
  it('approving creates the location and marks the suggestion approved, in one transaction', async () => {
    vi.mocked(addLocationInTransaction).mockResolvedValue({ id: 'new-location-uuid' as never });
    const txUpdate = vi.fn().mockResolvedValue({});
    const db = makeMockDb({ txUpdate });

    const result = await reviewLocationSuggestion(
      { suggestionId: SUGGESTION_ID, reviewedById: HOST_ID, decision: 'approve' },
      { db },
    );

    expect(result.isOk()).toBe(true);
    expect(addLocationInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        brunchId: 'brunch-uuid',
        proposedById: HOST_ID,
        location: expect.objectContaining({ placeId: 'place-a', placeName: 'Cafe A' }),
      }),
    );
    expect(txUpdate).toHaveBeenCalledWith({
      where: { id: SUGGESTION_ID },
      data: { statusId: 'status-approved', reviewedById: HOST_ID, reviewedAt: expect.any(Date) },
    });
  });

  it('declining does not create a location and marks the suggestion declined', async () => {
    const statusFindFirst = vi.fn().mockResolvedValue({ id: 'status-declined' });
    const txUpdate = vi.fn().mockResolvedValue({});
    const db = makeMockDb({ statusFindFirst, txUpdate });

    const result = await reviewLocationSuggestion(
      { suggestionId: SUGGESTION_ID, reviewedById: HOST_ID, decision: 'decline' },
      { db },
    );

    expect(result.isOk()).toBe(true);
    expect(addLocationInTransaction).not.toHaveBeenCalled();
    expect(txUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ statusId: 'status-declined' }) }),
    );
  });

  it('returns suggestion_not_found when the suggestion does not exist', async () => {
    const db = makeMockDb({ findFirst: vi.fn().mockResolvedValue(null) });

    const result = await reviewLocationSuggestion(
      { suggestionId: SUGGESTION_ID, reviewedById: HOST_ID, decision: 'approve' },
      { db },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'suggestion_not_found' });
  });

  it('returns not_host when the reviewer is not the brunch host', async () => {
    const db = makeMockDb();

    const result = await reviewLocationSuggestion(
      {
        suggestionId: SUGGESTION_ID,
        reviewedById: 'someone-else-uuid' as UserId,
        decision: 'approve',
      },
      { db },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'not_host' });
  });

  it('returns brunch_not_active when the brunch is confirmed, even for a still-pending suggestion', async () => {
    const db = makeMockDb({
      findFirst: vi.fn().mockResolvedValue({
        ...PENDING_SUGGESTION,
        brunch: { ...PENDING_SUGGESTION.brunch, status: { code: 'confirmed' } },
      }),
    });

    const result = await reviewLocationSuggestion(
      { suggestionId: SUGGESTION_ID, reviewedById: HOST_ID, decision: 'approve' },
      { db },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_active' });
    expect(addLocationInTransaction).not.toHaveBeenCalled();
  });

  it('returns already_reviewed when the suggestion is not pending', async () => {
    const db = makeMockDb({
      findFirst: vi.fn().mockResolvedValue({ ...PENDING_SUGGESTION, status: { code: 'approved' } }),
    });

    const result = await reviewLocationSuggestion(
      { suggestionId: SUGGESTION_ID, reviewedById: HOST_ID, decision: 'approve' },
      { db },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'already_reviewed' });
  });

  it('returns db_error and leaves the suggestion untouched when location creation fails on approve', async () => {
    vi.mocked(addLocationInTransaction).mockRejectedValue(new Error('boom'));
    const txUpdate = vi.fn().mockResolvedValue({});
    const db = makeMockDb({ txUpdate });

    const result = await reviewLocationSuggestion(
      { suggestionId: SUGGESTION_ID, reviewedById: HOST_ID, decision: 'approve' },
      { db },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'db_error', cause: expect.any(Error) });
    // Same transaction as the failed location creation — must not have committed.
    expect(txUpdate).not.toHaveBeenCalled();
  });

  it('returns already_added when the place was added directly while the suggestion sat pending', async () => {
    vi.mocked(isUniqueConstraintError).mockReturnValue(true);
    vi.mocked(addLocationInTransaction).mockRejectedValue(new Error('P2002'));
    const db = makeMockDb();

    const result = await reviewLocationSuggestion(
      { suggestionId: SUGGESTION_ID, reviewedById: HOST_ID, decision: 'approve' },
      { db },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'already_added' });
  });

  it('returns lookup_not_found when the target status row is missing', async () => {
    const db = makeMockDb({ statusFindFirst: vi.fn().mockResolvedValue(null) });

    const result = await reviewLocationSuggestion(
      { suggestionId: SUGGESTION_ID, reviewedById: HOST_ID, decision: 'approve' },
      { db },
    );

    expect(result._unsafeUnwrapErr()).toEqual({
      kind: 'lookup_not_found',
      code: 'BrunchOptionSuggestionStatus:approved',
    });
  });
});
