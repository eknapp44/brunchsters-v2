import type { DbClient } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./reviewTimeSuggestion', () => ({ reviewTimeSuggestion: vi.fn() }));

import { reviewTimeSuggestion } from './reviewTimeSuggestion';
import { suggestTime, suggestTimeRequestSchema } from './suggestTime';

const BRUNCH_ID = 'brunch-uuid' as BrunchId;
const HOST_ID = 'host-uuid' as UserId;
const ATTENDEE_ID = 'attendee-user-uuid' as UserId;
const FUTURE_ISO = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

const OPEN_BRUNCH = {
  id: BRUNCH_ID,
  hostId: HOST_ID,
  status: { code: 'active' },
  allowTimeSuggestions: true,
  requireHostApprovalForOptions: true,
};

function makeMockDb(
  overrides: {
    brunchFindFirst?: ReturnType<typeof vi.fn>;
    attendeeFindFirst?: ReturnType<typeof vi.fn>;
    suggestionFindUnique?: ReturnType<typeof vi.fn>;
    statusFindFirst?: ReturnType<typeof vi.fn>;
    suggestionCreate?: ReturnType<typeof vi.fn>;
  } = {},
): DbClient {
  return {
    brunch: { findFirst: overrides.brunchFindFirst ?? vi.fn().mockResolvedValue(OPEN_BRUNCH) },
    brunchAttendee: {
      findFirst:
        overrides.attendeeFindFirst ?? vi.fn().mockResolvedValue({ id: 'attendee-row-uuid' }),
    },
    brunchTimeSuggestion: {
      findUnique: overrides.suggestionFindUnique ?? vi.fn().mockResolvedValue(null),
      create:
        overrides.suggestionCreate ?? vi.fn().mockResolvedValue({ id: 'new-suggestion-uuid' }),
    },
    brunchOptionSuggestionStatus: {
      findFirst: overrides.statusFindFirst ?? vi.fn().mockResolvedValue({ id: 'status-pending' }),
    },
  } as unknown as DbClient;
}

beforeEach(() => {
  vi.mocked(reviewTimeSuggestion).mockReset();
});

const BASE_INPUT = { brunchId: BRUNCH_ID, suggestedById: ATTENDEE_ID, scheduledAt: FUTURE_ISO };

describe('suggestTime', () => {
  it('creates a pending suggestion when host approval is required', async () => {
    const db = makeMockDb();

    const result = await suggestTime(BASE_INPUT, { db });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      suggestionId: 'new-suggestion-uuid',
      status: 'pending',
    });
    expect(reviewTimeSuggestion).not.toHaveBeenCalled();
  });

  it('auto-approves and creates the time when host approval is not required', async () => {
    vi.mocked(reviewTimeSuggestion).mockResolvedValue(
      ok({ suggestionId: 'new-suggestion-uuid' as never }),
    );
    const db = makeMockDb({
      brunchFindFirst: vi
        .fn()
        .mockResolvedValue({ ...OPEN_BRUNCH, requireHostApprovalForOptions: false }),
    });

    const result = await suggestTime(BASE_INPUT, { db });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      suggestionId: 'new-suggestion-uuid',
      status: 'approved',
    });
    expect(reviewTimeSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestionId: 'new-suggestion-uuid',
        reviewedById: HOST_ID,
        decision: 'approve',
      }),
      expect.anything(),
    );
  });

  it('falls back to pending status when auto-approve fails', async () => {
    vi.mocked(reviewTimeSuggestion).mockResolvedValue(
      err({ kind: 'db_error', cause: new Error('boom') }),
    );
    const db = makeMockDb({
      brunchFindFirst: vi
        .fn()
        .mockResolvedValue({ ...OPEN_BRUNCH, requireHostApprovalForOptions: false }),
    });

    const result = await suggestTime(BASE_INPUT, { db });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().status).toBe('pending');
  });

  it('allows the host to suggest without an attendee row', async () => {
    const attendeeFindFirst = vi.fn();
    const db = makeMockDb({ attendeeFindFirst });

    const result = await suggestTime({ ...BASE_INPUT, suggestedById: HOST_ID }, { db });

    expect(result.isOk()).toBe(true);
    expect(attendeeFindFirst).not.toHaveBeenCalled();
  });

  it('returns brunch_not_found when the brunch does not exist', async () => {
    const db = makeMockDb({ brunchFindFirst: vi.fn().mockResolvedValue(null) });

    const result = await suggestTime(BASE_INPUT, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
  });

  it('returns suggestions_disabled when allowTimeSuggestions is false', async () => {
    const db = makeMockDb({
      brunchFindFirst: vi.fn().mockResolvedValue({ ...OPEN_BRUNCH, allowTimeSuggestions: false }),
    });

    const result = await suggestTime(BASE_INPUT, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'suggestions_disabled' });
  });

  it('returns brunch_not_active when the brunch is confirmed', async () => {
    const db = makeMockDb({
      brunchFindFirst: vi.fn().mockResolvedValue({ ...OPEN_BRUNCH, status: { code: 'confirmed' } }),
    });

    const result = await suggestTime(BASE_INPUT, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_active' });
  });

  it('returns not_attendee when the suggester is neither host nor attendee', async () => {
    const db = makeMockDb({ attendeeFindFirst: vi.fn().mockResolvedValue(null) });

    const result = await suggestTime(BASE_INPUT, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'not_attendee' });
  });

  it('returns already_suggested when the time was already suggested for this brunch', async () => {
    const db = makeMockDb({
      suggestionFindUnique: vi.fn().mockResolvedValue({ id: 'existing-suggestion' }),
    });

    const result = await suggestTime(BASE_INPUT, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'already_suggested' });
  });

  it('returns lookup_not_found when the pending status row is missing', async () => {
    const db = makeMockDb({ statusFindFirst: vi.fn().mockResolvedValue(null) });

    const result = await suggestTime(BASE_INPUT, { db });

    expect(result._unsafeUnwrapErr()).toEqual({
      kind: 'lookup_not_found',
      code: 'BrunchOptionSuggestionStatus:pending',
    });
  });

  it('returns db_error when suggestion creation fails', async () => {
    const db = makeMockDb({ suggestionCreate: vi.fn().mockRejectedValue(new Error('boom')) });

    const result = await suggestTime(BASE_INPUT, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'db_error', cause: expect.any(Error) });
  });
});

describe('suggestTimeRequestSchema', () => {
  it('accepts a future ISO datetime', () => {
    expect(suggestTimeRequestSchema.safeParse({ scheduledAt: FUTURE_ISO }).success).toBe(true);
  });

  it('rejects a past datetime', () => {
    expect(
      suggestTimeRequestSchema.safeParse({ scheduledAt: '2000-01-01T00:00:00.000Z' }).success,
    ).toBe(false);
  });
});
