import type { DbClient } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./reviewLocationSuggestion', () => ({ reviewLocationSuggestion: vi.fn() }));

import { reviewLocationSuggestion } from './reviewLocationSuggestion';
import { suggestLocation } from './suggestLocation';

const BRUNCH_ID = 'brunch-uuid' as BrunchId;
const HOST_ID = 'host-uuid' as UserId;
const ATTENDEE_ID = 'attendee-user-uuid' as UserId;

const LOCATION = {
  placeId: 'place-a',
  placeName: 'Cafe A',
  placeAddress: '1 Main St',
  placeUrl: 'https://maps.google.com/?cid=a',
  timezone: 'America/Chicago',
};

const OPEN_BRUNCH = {
  id: BRUNCH_ID,
  hostId: HOST_ID,
  status: { code: 'active' },
  allowLocationSuggestions: true,
  requireHostApprovalForOptions: true,
};

function makeMockDb(
  overrides: {
    brunchFindFirst?: ReturnType<typeof vi.fn>;
    attendeeFindFirst?: ReturnType<typeof vi.fn>;
    suggestionFindUnique?: ReturnType<typeof vi.fn>;
    locationFindFirst?: ReturnType<typeof vi.fn>;
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
    brunchLocationSuggestion: {
      findUnique: overrides.suggestionFindUnique ?? vi.fn().mockResolvedValue(null),
      create:
        overrides.suggestionCreate ?? vi.fn().mockResolvedValue({ id: 'new-suggestion-uuid' }),
    },
    brunchLocation: {
      findFirst: overrides.locationFindFirst ?? vi.fn().mockResolvedValue(null),
    },
    brunchOptionSuggestionStatus: {
      findFirst: overrides.statusFindFirst ?? vi.fn().mockResolvedValue({ id: 'status-pending' }),
    },
  } as unknown as DbClient;
}

const emit = vi.fn().mockResolvedValue(undefined);
const eventBus = { emit };

beforeEach(() => {
  emit.mockClear();
  vi.mocked(reviewLocationSuggestion).mockReset();
});

const BASE_INPUT = { brunchId: BRUNCH_ID, suggestedById: ATTENDEE_ID, location: LOCATION };

describe('suggestLocation', () => {
  it('creates a pending suggestion when host approval is required', async () => {
    const db = makeMockDb();

    const result = await suggestLocation(BASE_INPUT, { db, eventBus });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      suggestionId: 'new-suggestion-uuid',
      status: 'pending',
    });
    expect(reviewLocationSuggestion).not.toHaveBeenCalled();
  });

  it('auto-approves and creates the location when host approval is not required', async () => {
    vi.mocked(reviewLocationSuggestion).mockResolvedValue(
      ok({ suggestionId: 'new-suggestion-uuid' as never }),
    );
    const db = makeMockDb({
      brunchFindFirst: vi
        .fn()
        .mockResolvedValue({ ...OPEN_BRUNCH, requireHostApprovalForOptions: false }),
    });

    const result = await suggestLocation(BASE_INPUT, { db, eventBus });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      suggestionId: 'new-suggestion-uuid',
      status: 'approved',
    });
    expect(reviewLocationSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestionId: 'new-suggestion-uuid',
        reviewedById: HOST_ID,
        decision: 'approve',
      }),
      expect.anything(),
    );
  });

  it('falls back to pending status when auto-approve fails', async () => {
    vi.mocked(reviewLocationSuggestion).mockResolvedValue(
      err({ kind: 'db_error', cause: new Error('boom') }),
    );
    const db = makeMockDb({
      brunchFindFirst: vi
        .fn()
        .mockResolvedValue({ ...OPEN_BRUNCH, requireHostApprovalForOptions: false }),
    });

    const result = await suggestLocation(BASE_INPUT, { db, eventBus });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().status).toBe('pending');
  });

  it('allows the host to suggest without an attendee row', async () => {
    const attendeeFindFirst = vi.fn();
    const db = makeMockDb({ attendeeFindFirst });

    const result = await suggestLocation(
      { ...BASE_INPUT, suggestedById: HOST_ID },
      { db, eventBus },
    );

    expect(result.isOk()).toBe(true);
    expect(attendeeFindFirst).not.toHaveBeenCalled();
  });

  it('returns brunch_not_found when the brunch does not exist', async () => {
    const db = makeMockDb({ brunchFindFirst: vi.fn().mockResolvedValue(null) });

    const result = await suggestLocation(BASE_INPUT, { db, eventBus });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
  });

  it('returns suggestions_disabled when allowLocationSuggestions is false', async () => {
    const db = makeMockDb({
      brunchFindFirst: vi
        .fn()
        .mockResolvedValue({ ...OPEN_BRUNCH, allowLocationSuggestions: false }),
    });

    const result = await suggestLocation(BASE_INPUT, { db, eventBus });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'suggestions_disabled' });
  });

  it('returns brunch_not_active when the brunch is confirmed', async () => {
    const db = makeMockDb({
      brunchFindFirst: vi.fn().mockResolvedValue({ ...OPEN_BRUNCH, status: { code: 'confirmed' } }),
    });

    const result = await suggestLocation(BASE_INPUT, { db, eventBus });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_active' });
  });

  it('treats someone who is not a member as if the brunch does not exist', async () => {
    const db = makeMockDb({ attendeeFindFirst: vi.fn().mockResolvedValue(null) });

    const result = await suggestLocation(BASE_INPUT, { db, eventBus });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
  });

  it('tells an outsider nothing about the brunch: not that suggestions are off, not that it is closed', async () => {
    const outsider = vi.fn().mockResolvedValue(null);
    const off = makeMockDb({
      attendeeFindFirst: outsider,
      brunchFindFirst: vi
        .fn()
        .mockResolvedValue({ ...OPEN_BRUNCH, allowLocationSuggestions: false }),
    });
    const confirmed = makeMockDb({
      attendeeFindFirst: outsider,
      brunchFindFirst: vi.fn().mockResolvedValue({ ...OPEN_BRUNCH, status: { code: 'confirmed' } }),
    });

    expect((await suggestLocation(BASE_INPUT, { db: off, eventBus }))._unsafeUnwrapErr()).toEqual({
      kind: 'brunch_not_found',
    });
    expect(
      (await suggestLocation(BASE_INPUT, { db: confirmed, eventBus }))._unsafeUnwrapErr(),
    ).toEqual({
      kind: 'brunch_not_found',
    });
  });

  it('returns already_suggested when the place was already suggested for this brunch', async () => {
    const db = makeMockDb({
      suggestionFindUnique: vi.fn().mockResolvedValue({ id: 'existing-suggestion' }),
    });

    const result = await suggestLocation(BASE_INPUT, { db, eventBus });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'already_suggested' });
  });

  it('returns already_suggested when the place is already a live option', async () => {
    const db = makeMockDb({
      locationFindFirst: vi.fn().mockResolvedValue({ id: 'existing-location' }),
    });

    const result = await suggestLocation(BASE_INPUT, { db, eventBus });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'already_suggested' });
  });

  it('returns lookup_not_found when the pending status row is missing', async () => {
    const db = makeMockDb({ statusFindFirst: vi.fn().mockResolvedValue(null) });

    const result = await suggestLocation(BASE_INPUT, { db, eventBus });

    expect(result._unsafeUnwrapErr()).toEqual({
      kind: 'lookup_not_found',
      code: 'BrunchOptionSuggestionStatus:pending',
    });
  });

  it('returns db_error when suggestion creation fails', async () => {
    const db = makeMockDb({ suggestionCreate: vi.fn().mockRejectedValue(new Error('boom')) });

    const result = await suggestLocation(BASE_INPUT, { db, eventBus });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'db_error', cause: expect.any(Error) });
  });

  it('tells the host about a suggestion that is still waiting for them', async () => {
    const db = makeMockDb({});

    const result = await suggestLocation(BASE_INPUT, { db, eventBus });

    expect(result._unsafeUnwrap().status).toBe('pending');
    expect(emit).toHaveBeenCalledWith('suggestion/location', {
      brunchId: BRUNCH_ID,
      suggestionId: expect.anything(),
      suggestedById: ATTENDEE_ID,
    });
  });

  it('says nothing when the suggestion was approved on the spot', async () => {
    vi.mocked(reviewLocationSuggestion).mockResolvedValue(ok({} as never));
    const db = makeMockDb({
      brunchFindFirst: vi
        .fn()
        .mockResolvedValue({ ...OPEN_BRUNCH, requireHostApprovalForOptions: false }),
    });

    const result = await suggestLocation(BASE_INPUT, { db, eventBus });

    expect(result._unsafeUnwrap().status).toBe('approved');
    expect(emit).not.toHaveBeenCalled();
  });

  it('still succeeds when the queue is down', async () => {
    emit.mockRejectedValueOnce(new Error('queue down'));
    const db = makeMockDb({});

    const result = await suggestLocation(BASE_INPUT, { db, eventBus });

    expect(result.isOk()).toBe(true);
  });
});
