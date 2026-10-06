import type { DbClient } from '@brunchsters/database';
import type { BrunchTimeSuggestionId, UserId } from '@brunchsters/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./addTime', () => ({ addTimeInTransaction: vi.fn() }));

import { addTimeInTransaction } from './addTime';
import { reviewTimeSuggestion } from './reviewTimeSuggestion';

beforeEach(() => {
  vi.mocked(addTimeInTransaction).mockReset();
});

const HOST_ID = 'host-uuid' as UserId;
const SUGGESTION_ID = 'suggestion-uuid' as BrunchTimeSuggestionId;
const SCHEDULED_AT = new Date('2026-08-01T15:00:00.000Z');

const PENDING_SUGGESTION = {
  id: SUGGESTION_ID,
  brunchId: 'brunch-uuid',
  scheduledAt: SCHEDULED_AT,
  brunch: { id: 'brunch-uuid', hostId: HOST_ID, status: { code: 'active' } },
  status: { code: 'pending' },
};

type MockTx = { brunchTimeSuggestion: { update: ReturnType<typeof vi.fn> } };

function makeMockDb(
  overrides: {
    findFirst?: ReturnType<typeof vi.fn>;
    statusFindFirst?: ReturnType<typeof vi.fn>;
    txUpdate?: ReturnType<typeof vi.fn>;
  } = {},
): DbClient {
  const txUpdate = overrides.txUpdate ?? vi.fn().mockResolvedValue({});
  const tx: MockTx = { brunchTimeSuggestion: { update: txUpdate } };

  return {
    brunchTimeSuggestion: {
      findFirst: overrides.findFirst ?? vi.fn().mockResolvedValue(PENDING_SUGGESTION),
    },
    brunchOptionSuggestionStatus: {
      findFirst: overrides.statusFindFirst ?? vi.fn().mockResolvedValue({ id: 'status-approved' }),
    },
    $transaction: vi.fn().mockImplementation((fn: (tx: MockTx) => Promise<unknown>) => fn(tx)),
  } as unknown as DbClient;
}

describe('reviewTimeSuggestion', () => {
  it('approving creates the time and marks the suggestion approved, in one transaction', async () => {
    vi.mocked(addTimeInTransaction).mockResolvedValue({ id: 'new-time-uuid' as never });
    const txUpdate = vi.fn().mockResolvedValue({});
    const db = makeMockDb({ txUpdate });

    const result = await reviewTimeSuggestion(
      { suggestionId: SUGGESTION_ID, reviewedById: HOST_ID, decision: 'approve' },
      { db },
    );

    expect(result.isOk()).toBe(true);
    expect(addTimeInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        brunchId: 'brunch-uuid',
        proposedById: HOST_ID,
        scheduledAt: SCHEDULED_AT.toISOString(),
      }),
    );
    expect(txUpdate).toHaveBeenCalledWith({
      where: { id: SUGGESTION_ID },
      data: { statusId: 'status-approved', reviewedById: HOST_ID, reviewedAt: expect.any(Date) },
    });
  });

  it('declining does not create a time and marks the suggestion declined', async () => {
    const statusFindFirst = vi.fn().mockResolvedValue({ id: 'status-declined' });
    const txUpdate = vi.fn().mockResolvedValue({});
    const db = makeMockDb({ statusFindFirst, txUpdate });

    const result = await reviewTimeSuggestion(
      { suggestionId: SUGGESTION_ID, reviewedById: HOST_ID, decision: 'decline' },
      { db },
    );

    expect(result.isOk()).toBe(true);
    expect(addTimeInTransaction).not.toHaveBeenCalled();
    expect(txUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ statusId: 'status-declined' }) }),
    );
  });

  it('returns suggestion_not_found when the suggestion does not exist', async () => {
    const db = makeMockDb({ findFirst: vi.fn().mockResolvedValue(null) });

    const result = await reviewTimeSuggestion(
      { suggestionId: SUGGESTION_ID, reviewedById: HOST_ID, decision: 'approve' },
      { db },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'suggestion_not_found' });
  });

  it('returns not_host when the reviewer is not the brunch host', async () => {
    const db = makeMockDb();

    const result = await reviewTimeSuggestion(
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

    const result = await reviewTimeSuggestion(
      { suggestionId: SUGGESTION_ID, reviewedById: HOST_ID, decision: 'approve' },
      { db },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_active' });
    expect(addTimeInTransaction).not.toHaveBeenCalled();
  });

  it('returns already_reviewed when the suggestion is not pending', async () => {
    const db = makeMockDb({
      findFirst: vi.fn().mockResolvedValue({ ...PENDING_SUGGESTION, status: { code: 'declined' } }),
    });

    const result = await reviewTimeSuggestion(
      { suggestionId: SUGGESTION_ID, reviewedById: HOST_ID, decision: 'approve' },
      { db },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'already_reviewed' });
  });

  it('returns db_error and leaves the suggestion untouched when time creation fails on approve', async () => {
    vi.mocked(addTimeInTransaction).mockRejectedValue(new Error('boom'));
    const txUpdate = vi.fn().mockResolvedValue({});
    const db = makeMockDb({ txUpdate });

    const result = await reviewTimeSuggestion(
      { suggestionId: SUGGESTION_ID, reviewedById: HOST_ID, decision: 'approve' },
      { db },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'db_error', cause: expect.any(Error) });
    expect(txUpdate).not.toHaveBeenCalled();
  });

  it('returns lookup_not_found when the target status row is missing', async () => {
    const db = makeMockDb({ statusFindFirst: vi.fn().mockResolvedValue(null) });

    const result = await reviewTimeSuggestion(
      { suggestionId: SUGGESTION_ID, reviewedById: HOST_ID, decision: 'approve' },
      { db },
    );

    expect(result._unsafeUnwrapErr()).toEqual({
      kind: 'lookup_not_found',
      code: 'BrunchOptionSuggestionStatus:approved',
    });
  });
});
