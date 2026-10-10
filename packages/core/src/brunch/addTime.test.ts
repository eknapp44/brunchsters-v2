import type { DbClient } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@brunchsters/database', () => ({ isUniqueConstraintError: vi.fn() }));

import { isUniqueConstraintError } from '@brunchsters/database';
import { addTime, addTimeRequestSchema, type AddTimeInput } from './addTime';

beforeEach(() => {
  vi.mocked(isUniqueConstraintError).mockReturnValue(false);
});

const BRUNCH_ID = 'brunch-uuid' as BrunchId;
const HOST_ID = 'host-uuid' as UserId;
const OTHER_ID = 'other-uuid' as UserId;
const FUTURE_ISO = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

const BASE_INPUT: AddTimeInput = {
  brunchId: BRUNCH_ID,
  requestedById: HOST_ID,
  scheduledAt: FUTURE_ISO,
};

function makeMockDb(overrides: {
  findFirstBrunch?: ReturnType<typeof vi.fn>;
  create?: ReturnType<typeof vi.fn>;
}): DbClient {
  return {
    brunch: {
      findFirst:
        overrides.findFirstBrunch ??
        vi.fn().mockResolvedValue({ id: BRUNCH_ID, hostId: HOST_ID, status: { code: 'active' } }),
    },
    brunchTime: {
      create: overrides.create ?? vi.fn().mockResolvedValue({ id: 'new-time-uuid' }),
    },
  } as unknown as DbClient;
}

describe('addTime', () => {
  it('creates the time when the caller is the host and the brunch is active', async () => {
    const db = makeMockDb({});

    const result = await addTime(BASE_INPUT, { db });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ id: 'new-time-uuid' });
    expect(db.brunchTime.create).toHaveBeenCalledWith({
      data: {
        brunchId: BRUNCH_ID,
        scheduledAt: new Date(FUTURE_ISO),
        proposedById: HOST_ID,
      },
    });
  });

  it('rejects when the brunch does not exist', async () => {
    const db = makeMockDb({ findFirstBrunch: vi.fn().mockResolvedValue(null) });

    const result = await addTime(BASE_INPUT, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
    expect(db.brunchTime.create).not.toHaveBeenCalled();
  });

  it('rejects a non-host', async () => {
    const db = makeMockDb({});

    const result = await addTime({ ...BASE_INPUT, requestedById: OTHER_ID }, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'not_host' });
    expect(db.brunchTime.create).not.toHaveBeenCalled();
  });

  it('rejects a brunch that is not active', async () => {
    const db = makeMockDb({
      findFirstBrunch: vi
        .fn()
        .mockResolvedValue({ id: BRUNCH_ID, hostId: HOST_ID, status: { code: 'draft' } }),
    });

    const result = await addTime(BASE_INPUT, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_active' });
    expect(db.brunchTime.create).not.toHaveBeenCalled();
  });

  it('maps a db error on create', async () => {
    const cause = new Error('connection refused');
    const db = makeMockDb({ create: vi.fn().mockRejectedValue(cause) });

    const result = await addTime(BASE_INPUT, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'db_error', cause });
  });

  it('maps a unique-constraint violation on create to already_added', async () => {
    vi.mocked(isUniqueConstraintError).mockReturnValue(true);
    const db = makeMockDb({ create: vi.fn().mockRejectedValue(new Error('P2002')) });

    const result = await addTime(BASE_INPUT, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'already_added' });
  });
});

describe('addTimeRequestSchema', () => {
  it('accepts a future ISO datetime', () => {
    const result = addTimeRequestSchema.safeParse({ scheduledAt: FUTURE_ISO });

    expect(result.success).toBe(true);
  });

  it('rejects a past datetime', () => {
    const result = addTimeRequestSchema.safeParse({ scheduledAt: '2020-01-01T12:00:00.000Z' });

    expect(result.success).toBe(false);
  });

  it('rejects a missing scheduledAt', () => {
    const result = addTimeRequestSchema.safeParse({});

    expect(result.success).toBe(false);
  });
});
