import type { DbClient } from '@brunchsters/database';
import type { InviteSuggestionId, UserId } from '@brunchsters/shared';
import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./sendInvites', () => ({ sendInvites: vi.fn() }));

import { sendInvites } from './sendInvites';
import { reviewInviteSuggestion } from './reviewInviteSuggestion';

beforeEach(() => {
  vi.mocked(sendInvites).mockReset();
});

const HOST_ID = 'host-uuid' as UserId;
const SUGGESTION_ID = 'suggestion-uuid' as InviteSuggestionId;

const PENDING_SUGGESTION = {
  id: SUGGESTION_ID,
  brunchId: 'brunch-uuid',
  suggestedEmail: 'carol@example.com',
  brunch: { id: 'brunch-uuid', hostId: HOST_ID },
  status: { code: 'pending' },
};

function makeMockDb(
  overrides: {
    findFirst?: ReturnType<typeof vi.fn>;
    statusFindFirst?: ReturnType<typeof vi.fn>;
    update?: ReturnType<typeof vi.fn>;
  } = {},
): DbClient {
  return {
    brunchInviteSuggestion: {
      findFirst: overrides.findFirst ?? vi.fn().mockResolvedValue(PENDING_SUGGESTION),
      update: overrides.update ?? vi.fn().mockResolvedValue({}),
    },
    brunchInviteSuggestionStatus: {
      findFirst: overrides.statusFindFirst ?? vi.fn().mockResolvedValue({ id: 'status-approved' }),
    },
  } as unknown as DbClient;
}

describe('reviewInviteSuggestion', () => {
  it('approving sends the invite and marks the suggestion approved', async () => {
    vi.mocked(sendInvites).mockResolvedValue(
      ok([{ id: 'new-invite' as never, invitedEmail: 'carol@example.com' }]),
    );
    const update = vi.fn().mockResolvedValue({});
    const db = makeMockDb({ update });

    const result = await reviewInviteSuggestion(
      { suggestionId: SUGGESTION_ID, reviewedById: HOST_ID, decision: 'approve' },
      { db, eventBus: { emit: vi.fn() } },
    );

    expect(result.isOk()).toBe(true);
    expect(sendInvites).toHaveBeenCalledWith(
      expect.objectContaining({ emails: ['carol@example.com'], invitedById: HOST_ID }),
      expect.anything(),
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          statusId: 'status-approved',
          reviewedById: HOST_ID,
          reviewedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('declining does not send an invite and marks the suggestion declined', async () => {
    const statusFindFirst = vi.fn().mockResolvedValue({ id: 'status-declined' });
    const update = vi.fn().mockResolvedValue({});
    const db = makeMockDb({ statusFindFirst, update });

    const result = await reviewInviteSuggestion(
      { suggestionId: SUGGESTION_ID, reviewedById: HOST_ID, decision: 'decline' },
      { db, eventBus: { emit: vi.fn() } },
    );

    expect(result.isOk()).toBe(true);
    expect(sendInvites).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ statusId: 'status-declined' }) }),
    );
  });

  it('returns suggestion_not_found when the suggestion does not exist', async () => {
    const db = makeMockDb({ findFirst: vi.fn().mockResolvedValue(null) });

    const result = await reviewInviteSuggestion(
      { suggestionId: SUGGESTION_ID, reviewedById: HOST_ID, decision: 'approve' },
      { db, eventBus: { emit: vi.fn() } },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'suggestion_not_found' });
  });

  it('returns not_host when the reviewer is not the brunch host', async () => {
    const db = makeMockDb();

    const result = await reviewInviteSuggestion(
      {
        suggestionId: SUGGESTION_ID,
        reviewedById: 'someone-else-uuid' as UserId,
        decision: 'approve',
      },
      { db, eventBus: { emit: vi.fn() } },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'not_host' });
  });

  it('returns already_reviewed when the suggestion is not pending', async () => {
    const db = makeMockDb({
      findFirst: vi.fn().mockResolvedValue({ ...PENDING_SUGGESTION, status: { code: 'approved' } }),
    });

    const result = await reviewInviteSuggestion(
      { suggestionId: SUGGESTION_ID, reviewedById: HOST_ID, decision: 'approve' },
      { db, eventBus: { emit: vi.fn() } },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'already_reviewed' });
  });

  it('returns db_error when sendInvites fails on approve', async () => {
    vi.mocked(sendInvites).mockResolvedValue(err({ kind: 'db_error', cause: new Error('boom') }));
    const db = makeMockDb();

    const result = await reviewInviteSuggestion(
      { suggestionId: SUGGESTION_ID, reviewedById: HOST_ID, decision: 'approve' },
      { db, eventBus: { emit: vi.fn() } },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().kind).toBe('db_error');
  });
});
