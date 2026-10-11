import type { DbClient } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import { assertCanVote } from './assertCanVote';

const BRUNCH_ID = 'brunch-uuid' as BrunchId;
const USER_ID = 'user-uuid' as UserId;

function makeMockDb(findFirst: ReturnType<typeof vi.fn>): DbClient {
  return { brunchAttendee: { findFirst } } as unknown as DbClient;
}

function makeAttendee(rsvpStatusCode: string, canVote: boolean) {
  return {
    id: 'attendee-uuid',
    brunchId: BRUNCH_ID,
    userId: USER_ID,
    rsvpStatus: { code: rsvpStatusCode, canVote },
  };
}

describe('assertCanVote', () => {
  it('returns Ok for a yes attendee', async () => {
    const db = makeMockDb(vi.fn().mockResolvedValue(makeAttendee('yes', true)));

    const result = await assertCanVote({ brunchId: BRUNCH_ID, userId: USER_ID }, { db });

    expect(result.isOk()).toBe(true);
  });

  it('returns Ok for a maybe attendee', async () => {
    const db = makeMockDb(vi.fn().mockResolvedValue(makeAttendee('maybe', true)));

    const result = await assertCanVote({ brunchId: BRUNCH_ID, userId: USER_ID }, { db });

    expect(result.isOk()).toBe(true);
  });

  it('rejects an invited attendee with cannot_vote', async () => {
    const db = makeMockDb(vi.fn().mockResolvedValue(makeAttendee('invited', false)));

    const result = await assertCanVote({ brunchId: BRUNCH_ID, userId: USER_ID }, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'cannot_vote' });
  });

  it('rejects a no attendee with cannot_vote', async () => {
    const db = makeMockDb(vi.fn().mockResolvedValue(makeAttendee('no', false)));

    const result = await assertCanVote({ brunchId: BRUNCH_ID, userId: USER_ID }, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'cannot_vote' });
  });

  it('treats someone who is not a member as if the brunch does not exist', async () => {
    const db = makeMockDb(vi.fn().mockResolvedValue(null));

    const result = await assertCanVote({ brunchId: BRUNCH_ID, userId: USER_ID }, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
  });
});
