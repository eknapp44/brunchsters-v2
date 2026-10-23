import type { DbClient } from '@brunchsters/database';
import type { InviteSuggestionId, UserId } from '@brunchsters/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./sendInvites', () => ({ sendInvitesInTransaction: vi.fn() }));

import { sendInvitesInTransaction } from './sendInvites';
import { reviewInviteSuggestion } from './reviewInviteSuggestion';
import { InMemoryRateLimiter } from '../rateLimit/InMemoryRateLimiter';
import { RecordingRateLimiter } from '../rateLimit/RecordingRateLimiter';

beforeEach(() => {
  vi.mocked(sendInvitesInTransaction).mockReset();
});

const HOST_ID = 'host-uuid' as UserId;
const SUGGESTION_ID = 'suggestion-uuid' as InviteSuggestionId;

const PENDING_SUGGESTION = {
  id: SUGGESTION_ID,
  brunchId: 'brunch-uuid',
  suggestedEmail: 'carol@example.com',
  brunch: { id: 'brunch-uuid', hostId: HOST_ID, status: { code: 'active' } },
  status: { code: 'pending' },
};

type MockTx = { brunchInviteSuggestion: { update: ReturnType<typeof vi.fn> } };

function makeMockDb(
  overrides: {
    findFirst?: ReturnType<typeof vi.fn>;
    statusFindFirst?: ReturnType<typeof vi.fn>;
    txUpdate?: ReturnType<typeof vi.fn>;
  } = {},
): DbClient {
  const txUpdate = overrides.txUpdate ?? vi.fn().mockResolvedValue({});
  const tx: MockTx = { brunchInviteSuggestion: { update: txUpdate } };

  return {
    brunchInviteSuggestion: {
      findFirst: overrides.findFirst ?? vi.fn().mockResolvedValue(PENDING_SUGGESTION),
    },
    brunchInviteSuggestionStatus: {
      findFirst: overrides.statusFindFirst ?? vi.fn().mockResolvedValue({ id: 'status-approved' }),
    },
    $transaction: vi.fn().mockImplementation((fn: (tx: MockTx) => Promise<unknown>) => fn(tx)),
  } as unknown as DbClient;
}

describe('reviewInviteSuggestion', () => {
  it('approving sends the invite and marks the suggestion approved, in one transaction', async () => {
    vi.mocked(sendInvitesInTransaction).mockResolvedValue([
      { id: 'new-invite' as never, invitedEmail: 'carol@example.com' as never },
    ]);
    const txUpdate = vi.fn().mockResolvedValue({});
    const db = makeMockDb({ txUpdate });

    const result = await reviewInviteSuggestion(
      { suggestionId: SUGGESTION_ID, reviewedById: HOST_ID, decision: 'approve' },
      { rateLimiter: new InMemoryRateLimiter(), db, eventBus: { emit: vi.fn() } },
    );

    expect(result.isOk()).toBe(true);
    expect(sendInvitesInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ emails: ['carol@example.com'], invitedById: HOST_ID }),
    );
    expect(txUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          statusId: 'status-approved',
          reviewedById: HOST_ID,
          reviewedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('emits invite/sent for the invite created on approve', async () => {
    vi.mocked(sendInvitesInTransaction).mockResolvedValue([
      { id: 'new-invite' as never, invitedEmail: 'carol@example.com' as never },
    ]);
    const emit = vi.fn();
    const db = makeMockDb();

    await reviewInviteSuggestion(
      { suggestionId: SUGGESTION_ID, reviewedById: HOST_ID, decision: 'approve' },
      { rateLimiter: new InMemoryRateLimiter(), db, eventBus: { emit } },
    );

    expect(emit).toHaveBeenCalledWith(
      'invite/sent',
      expect.objectContaining({ invitedEmail: 'carol@example.com' }),
    );
  });

  it('declining does not send an invite and marks the suggestion declined', async () => {
    const statusFindFirst = vi.fn().mockResolvedValue({ id: 'status-declined' });
    const txUpdate = vi.fn().mockResolvedValue({});
    const db = makeMockDb({ statusFindFirst, txUpdate });

    const result = await reviewInviteSuggestion(
      { suggestionId: SUGGESTION_ID, reviewedById: HOST_ID, decision: 'decline' },
      { rateLimiter: new InMemoryRateLimiter(), db, eventBus: { emit: vi.fn() } },
    );

    expect(result.isOk()).toBe(true);
    expect(sendInvitesInTransaction).not.toHaveBeenCalled();
    expect(txUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ statusId: 'status-declined' }) }),
    );
  });

  it('returns suggestion_not_found when the suggestion does not exist', async () => {
    const db = makeMockDb({ findFirst: vi.fn().mockResolvedValue(null) });

    const result = await reviewInviteSuggestion(
      { suggestionId: SUGGESTION_ID, reviewedById: HOST_ID, decision: 'approve' },
      { rateLimiter: new InMemoryRateLimiter(), db, eventBus: { emit: vi.fn() } },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'suggestion_not_found' });
  });

  it('refuses a member who is not the host (they may know the brunch exists)', async () => {
    const db = makeMockDb();

    // Membership is looked up only on this path.
    Object.assign(db, {
      brunchAttendee: { findFirst: vi.fn().mockResolvedValue({ id: 'attendee-id' }) },
    });

    const result = await reviewInviteSuggestion(
      {
        suggestionId: SUGGESTION_ID,
        reviewedById: 'someone-else-uuid' as UserId,
        decision: 'approve',
      },
      { rateLimiter: new InMemoryRateLimiter(), db, eventBus: { emit: vi.fn() } },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'not_host' });
  });

  it('treats an outsider as if it does not exist (no 403 that confirms it is real)', async () => {
    const db = makeMockDb();

    // Membership is looked up only on this path.
    Object.assign(db, {
      brunchAttendee: { findFirst: vi.fn().mockResolvedValue(null) },
    });

    const result = await reviewInviteSuggestion(
      {
        suggestionId: SUGGESTION_ID,
        reviewedById: 'someone-else-uuid' as UserId,
        decision: 'approve',
      },
      { rateLimiter: new InMemoryRateLimiter(), db, eventBus: { emit: vi.fn() } },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'suggestion_not_found' });
  });

  it('returns already_reviewed when the suggestion is not pending', async () => {
    const db = makeMockDb({
      findFirst: vi.fn().mockResolvedValue({ ...PENDING_SUGGESTION, status: { code: 'approved' } }),
    });

    const result = await reviewInviteSuggestion(
      { suggestionId: SUGGESTION_ID, reviewedById: HOST_ID, decision: 'approve' },
      { rateLimiter: new InMemoryRateLimiter(), db, eventBus: { emit: vi.fn() } },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'already_reviewed' });
  });

  it('returns db_error and leaves the suggestion untouched when invite creation fails on approve', async () => {
    vi.mocked(sendInvitesInTransaction).mockRejectedValue(new Error('boom'));
    const txUpdate = vi.fn().mockResolvedValue({});
    const db = makeMockDb({ txUpdate });

    const result = await reviewInviteSuggestion(
      { suggestionId: SUGGESTION_ID, reviewedById: HOST_ID, decision: 'approve' },
      { rateLimiter: new InMemoryRateLimiter(), db, eventBus: { emit: vi.fn() } },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'db_error', cause: expect.any(Error) });
    // Same transaction as the failed invite creation — must not have committed.
    expect(txUpdate).not.toHaveBeenCalled();
  });
});

describe('reviewInviteSuggestion — rate limits', () => {
  const APPROVE = {
    suggestionId: SUGGESTION_ID,
    reviewedById: HOST_ID,
    decision: 'approve' as const,
  };

  it('approving spends the brunch and host invite budgets, one email each (no way round the cap)', async () => {
    vi.mocked(sendInvitesInTransaction).mockResolvedValue([]);
    const rateLimiter = new RecordingRateLimiter();

    const result = await reviewInviteSuggestion(APPROVE, {
      rateLimiter,
      db: makeMockDb(),
      eventBus: { emit: vi.fn() },
    });

    expect(result.isOk()).toBe(true);
    expect(rateLimiter.spends).toEqual([
      { policy: 'invite-emails-brunch', subject: 'brunch-uuid', cost: 1 },
      { policy: 'invite-emails-host', subject: HOST_ID, cost: 1 },
    ]);
  });

  it('declining sends nothing, so it spends nothing', async () => {
    const rateLimiter = new RecordingRateLimiter();

    const result = await reviewInviteSuggestion(
      { ...APPROVE, decision: 'decline' },
      { rateLimiter, db: makeMockDb(), eventBus: { emit: vi.fn() } },
    );

    expect(result.isOk()).toBe(true);
    expect(rateLimiter.spends).toEqual([]);
  });

  it.each(['invite-emails-brunch', 'invite-emails-host'])(
    'refuses an approval when the %s budget is spent: the suggestion stays pending and nothing is sent',
    async (policy) => {
      const txUpdate = vi.fn().mockResolvedValue({});
      const emit = vi.fn();

      const result = await reviewInviteSuggestion(APPROVE, {
        rateLimiter: new RecordingRateLimiter({ refusePolicy: policy }),
        db: makeMockDb({ txUpdate }),
        eventBus: { emit },
      });

      expect(result._unsafeUnwrapErr()).toEqual({
        kind: 'rate_limited',
        policy,
        retryAfterSeconds: 321,
      });
      expect(sendInvitesInTransaction).not.toHaveBeenCalled();
      expect(txUpdate).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    },
  );

  it('fails closed when the limiter cannot count', async () => {
    const cause = new Error('database is down');

    const result = await reviewInviteSuggestion(APPROVE, {
      rateLimiter: new RecordingRateLimiter({ failWith: cause }),
      db: makeMockDb(),
      eventBus: { emit: vi.fn() },
    });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'rate_limiter_unavailable', cause });
    expect(sendInvitesInTransaction).not.toHaveBeenCalled();
  });

  it('spends nothing for someone who is not the host or for a suggestion already reviewed', async () => {
    const rateLimiter = new RecordingRateLimiter();
    const notHost = makeMockDb();
    Object.assign(notHost, {
      brunchAttendee: { findFirst: vi.fn().mockResolvedValue(null) },
    });

    const outsider = await reviewInviteSuggestion(
      { ...APPROVE, reviewedById: 'someone-else-uuid' as UserId },
      { rateLimiter, db: notHost, eventBus: { emit: vi.fn() } },
    );
    const reviewed = await reviewInviteSuggestion(APPROVE, {
      rateLimiter,
      db: makeMockDb({
        findFirst: vi
          .fn()
          .mockResolvedValue({ ...PENDING_SUGGESTION, status: { code: 'approved' } }),
      }),
      eventBus: { emit: vi.fn() },
    });

    expect(outsider._unsafeUnwrapErr()).toEqual({ kind: 'suggestion_not_found' });
    expect(reviewed._unsafeUnwrapErr()).toEqual({ kind: 'already_reviewed' });
    expect(rateLimiter.spends).toEqual([]);
  });
});
