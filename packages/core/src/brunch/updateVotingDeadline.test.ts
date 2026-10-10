import type { DbClient } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import { updateVotingDeadline, updateVotingDeadlineRequestSchema } from './updateVotingDeadline';

const BRUNCH_ID = 'brunch-uuid' as BrunchId;
const HOST_ID = 'host-uuid' as UserId;
const OTHER_ID = 'other-uuid' as UserId;
const FUTURE_ISO = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

const OPEN_BRUNCH = {
  id: BRUNCH_ID,
  hostId: HOST_ID,
  status: { code: 'active' },
  votingDeadline: null,
  votingClosedAt: null,
};

function makeMockDb(overrides: {
  findFirstBrunch?: ReturnType<typeof vi.fn>;
  update?: ReturnType<typeof vi.fn>;
}): DbClient {
  return {
    brunch: {
      findFirst: overrides.findFirstBrunch ?? vi.fn().mockResolvedValue(OPEN_BRUNCH),
      update: overrides.update ?? vi.fn().mockResolvedValue({}),
    },
  } as unknown as DbClient;
}

describe('updateVotingDeadline', () => {
  it('sets a future deadline', async () => {
    const db = makeMockDb({});

    const result = await updateVotingDeadline(
      { brunchId: BRUNCH_ID, requestedById: HOST_ID, votingDeadline: FUTURE_ISO },
      { db },
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ votingDeadline: new Date(FUTURE_ISO) });
    expect(db.brunch.update).toHaveBeenCalledWith({
      where: { id: BRUNCH_ID },
      data: { votingDeadline: new Date(FUTURE_ISO) },
    });
  });

  it('clears the deadline when votingDeadline is undefined', async () => {
    const db = makeMockDb({});

    const result = await updateVotingDeadline(
      { brunchId: BRUNCH_ID, requestedById: HOST_ID, votingDeadline: undefined },
      { db },
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ votingDeadline: undefined });
    expect(db.brunch.update).toHaveBeenCalledWith({
      where: { id: BRUNCH_ID },
      data: { votingDeadline: null },
    });
  });

  it('rejects a non-host', async () => {
    const db = makeMockDb({});

    const result = await updateVotingDeadline(
      { brunchId: BRUNCH_ID, requestedById: OTHER_ID, votingDeadline: FUTURE_ISO },
      { db },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'not_host' });
    expect(db.brunch.update).not.toHaveBeenCalled();
  });

  it('rejects when the brunch does not exist', async () => {
    const db = makeMockDb({ findFirstBrunch: vi.fn().mockResolvedValue(null) });

    const result = await updateVotingDeadline(
      { brunchId: BRUNCH_ID, requestedById: HOST_ID, votingDeadline: FUTURE_ISO },
      { db },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
  });

  it('rejects once voting is manually closed', async () => {
    const db = makeMockDb({
      findFirstBrunch: vi.fn().mockResolvedValue({ ...OPEN_BRUNCH, votingClosedAt: new Date() }),
    });

    const result = await updateVotingDeadline(
      { brunchId: BRUNCH_ID, requestedById: HOST_ID, votingDeadline: FUTURE_ISO },
      { db },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'already_closed' });
    expect(db.brunch.update).not.toHaveBeenCalled();
  });

  it('rejects once the brunch is confirmed', async () => {
    const db = makeMockDb({
      findFirstBrunch: vi.fn().mockResolvedValue({ ...OPEN_BRUNCH, status: { code: 'confirmed' } }),
    });

    const result = await updateVotingDeadline(
      { brunchId: BRUNCH_ID, requestedById: HOST_ID, votingDeadline: FUTURE_ISO },
      { db },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'already_closed' });
    expect(db.brunch.update).not.toHaveBeenCalled();
  });

  it('allows extending a deadline that merely lapsed — it was never manually closed or confirmed', async () => {
    const db = makeMockDb({
      findFirstBrunch: vi
        .fn()
        .mockResolvedValue({
          ...OPEN_BRUNCH,
          votingDeadline: new Date('2000-01-01T00:00:00.000Z'),
        }),
    });

    const result = await updateVotingDeadline(
      { brunchId: BRUNCH_ID, requestedById: HOST_ID, votingDeadline: FUTURE_ISO },
      { db },
    );

    expect(result.isOk()).toBe(true);
    expect(db.brunch.update).toHaveBeenCalledWith({
      where: { id: BRUNCH_ID },
      data: { votingDeadline: new Date(FUTURE_ISO) },
    });
  });

  it('maps a db error on update', async () => {
    const cause = new Error('connection refused');
    const db = makeMockDb({ update: vi.fn().mockRejectedValue(cause) });

    const result = await updateVotingDeadline(
      { brunchId: BRUNCH_ID, requestedById: HOST_ID, votingDeadline: FUTURE_ISO },
      { db },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'db_error', cause });
  });
});

describe('updateVotingDeadlineRequestSchema', () => {
  it('accepts a future ISO datetime', () => {
    const result = updateVotingDeadlineRequestSchema.safeParse({ votingDeadline: FUTURE_ISO });

    expect(result.success).toBe(true);
  });

  it('accepts null to clear the deadline', () => {
    const result = updateVotingDeadlineRequestSchema.safeParse({ votingDeadline: null });

    expect(result.success).toBe(true);
  });

  it('rejects a past datetime', () => {
    const result = updateVotingDeadlineRequestSchema.safeParse({
      votingDeadline: '2000-01-01T00:00:00.000Z',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a missing votingDeadline field', () => {
    const result = updateVotingDeadlineRequestSchema.safeParse({});

    expect(result.success).toBe(false);
  });
});
