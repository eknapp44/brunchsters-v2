import type { DbClient } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import type { EventBus } from '../events/EventBus';
import { updateRsvp, updateRsvpRequestSchema } from './updateRsvp';

const BRUNCH_ID = 'brunch-uuid' as BrunchId;
const VIEWER_ID = 'viewer-uuid' as UserId;

function makeMockDb(
  overrides: {
    attendeeFindFirst?: ReturnType<typeof vi.fn>;
    rsvpStatusFindFirst?: ReturnType<typeof vi.fn>;
    attendeeUpdate?: ReturnType<typeof vi.fn>;
  } = {},
): DbClient {
  return {
    brunchAttendee: {
      findFirst: overrides.attendeeFindFirst ?? vi.fn().mockResolvedValue({ id: 'attendee-uuid' }),
      update: overrides.attendeeUpdate ?? vi.fn().mockResolvedValue({}),
    },
    rsvpStatus: {
      findFirst: overrides.rsvpStatusFindFirst ?? vi.fn().mockResolvedValue({ id: 'rsvp-maybe' }),
    },
  } as unknown as DbClient;
}

function makeMockEventBus(emit = vi.fn().mockResolvedValue(undefined)): EventBus {
  return { emit };
}

describe('updateRsvp', () => {
  it('updates the existing attendee row', async () => {
    const update = vi.fn().mockResolvedValue({});
    const db = makeMockDb({ attendeeUpdate: update });

    const result = await updateRsvp(
      { brunchId: BRUNCH_ID, viewerId: VIEWER_ID, response: 'maybe' },
      { db, eventBus: makeMockEventBus() },
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ brunchId: BRUNCH_ID });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'attendee-uuid' },
        data: expect.objectContaining({ rsvpStatusId: 'rsvp-maybe' }),
      }),
    );
  });

  it('returns not_attendee when the viewer has no attendee row for this brunch', async () => {
    const db = makeMockDb({ attendeeFindFirst: vi.fn().mockResolvedValue(null) });

    const result = await updateRsvp(
      { brunchId: BRUNCH_ID, viewerId: VIEWER_ID, response: 'yes' },
      { db, eventBus: makeMockEventBus() },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'not_attendee' });
  });

  it('returns lookup_not_found when the RsvpStatus row is missing', async () => {
    const db = makeMockDb({ rsvpStatusFindFirst: vi.fn().mockResolvedValue(null) });

    const result = await updateRsvp(
      { brunchId: BRUNCH_ID, viewerId: VIEWER_ID, response: 'no' },
      { db, eventBus: makeMockEventBus() },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'lookup_not_found', code: 'RsvpStatus:no' });
  });

  it('returns db_error when the update fails', async () => {
    const db = makeMockDb({ attendeeUpdate: vi.fn().mockRejectedValue(new Error('boom')) });

    const result = await updateRsvp(
      { brunchId: BRUNCH_ID, viewerId: VIEWER_ID, response: 'yes' },
      { db, eventBus: makeMockEventBus() },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'db_error', cause: expect.any(Error) });
  });

  it('still returns Ok when event emission fails', async () => {
    const db = makeMockDb();
    const eventBus = makeMockEventBus(vi.fn().mockRejectedValue(new Error('emit failed')));

    const result = await updateRsvp(
      { brunchId: BRUNCH_ID, viewerId: VIEWER_ID, response: 'yes' },
      { db, eventBus },
    );

    expect(result.isOk()).toBe(true);
  });

  it('emits attendee/rsvp.changed', async () => {
    const db = makeMockDb();
    const emit = vi.fn().mockResolvedValue(undefined);

    await updateRsvp(
      { brunchId: BRUNCH_ID, viewerId: VIEWER_ID, response: 'maybe' },
      { db, eventBus: makeMockEventBus(emit) },
    );

    expect(emit).toHaveBeenCalledWith(
      'attendee/rsvp.changed',
      expect.objectContaining({ brunchId: BRUNCH_ID, viewerId: VIEWER_ID, response: 'maybe' }),
    );
  });
});

describe('updateRsvpRequestSchema', () => {
  it('accepts yes, no, and maybe', () => {
    for (const response of ['yes', 'no', 'maybe']) {
      expect(updateRsvpRequestSchema.safeParse({ response }).success).toBe(true);
    }
  });

  it('rejects anything else', () => {
    expect(updateRsvpRequestSchema.safeParse({ response: 'sure' }).success).toBe(false);
  });
});
