import type { DbClient } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import { getBrunchVoting } from './getBrunchVoting';

const BRUNCH_ID = 'brunch-uuid' as BrunchId;
const HOST_ID = 'host-uuid' as UserId;
const VIEWER_ID = 'viewer-uuid' as UserId;

type Overrides = {
  findFirstBrunch?: ReturnType<typeof vi.fn>;
  findFirstAttendee?: ReturnType<typeof vi.fn>;
  findManyAttendees?: ReturnType<typeof vi.fn>;
  locationCount?: ReturnType<typeof vi.fn>;
  timeCount?: ReturnType<typeof vi.fn>;
  findManyLocations?: ReturnType<typeof vi.fn>;
  findManyTimes?: ReturnType<typeof vi.fn>;
};

function makeMockDb(overrides: Overrides): DbClient {
  return {
    brunch: {
      findFirst:
        overrides.findFirstBrunch ??
        vi.fn().mockResolvedValue({
          id: BRUNCH_ID,
          hostId: HOST_ID,
          status: { code: 'active' },
          votingDeadline: null,
        }),
    },
    brunchAttendee: {
      findFirst:
        overrides.findFirstAttendee ??
        vi
          .fn()
          .mockResolvedValue({ id: 'attendee-uuid', rsvpStatus: { code: 'yes', canVote: true } }),
      findMany: overrides.findManyAttendees ?? vi.fn().mockResolvedValue([]),
    },
    brunchLocation: {
      count: overrides.locationCount ?? vi.fn().mockResolvedValue(2),
      findMany: overrides.findManyLocations ?? vi.fn().mockResolvedValue([]),
    },
    brunchTime: {
      count: overrides.timeCount ?? vi.fn().mockResolvedValue(2),
      findMany: overrides.findManyTimes ?? vi.fn().mockResolvedValue([]),
    },
  } as unknown as DbClient;
}

describe('getBrunchVoting', () => {
  it('returns undefined when the brunch is not found or the viewer is not a member', async () => {
    const db = makeMockDb({ findFirstBrunch: vi.fn().mockResolvedValue(null) });

    const result = await getBrunchVoting({ brunchId: BRUNCH_ID, viewerId: VIEWER_ID }, { db });

    expect(result).toBeUndefined();
  });

  it('scopes the brunch lookup to the host or a live attendee', async () => {
    const findFirstBrunch = vi.fn().mockResolvedValue({
      id: BRUNCH_ID,
      hostId: HOST_ID,
      status: { code: 'active' },
      votingDeadline: null,
    });
    const db = makeMockDb({ findFirstBrunch });

    await getBrunchVoting({ brunchId: BRUNCH_ID, viewerId: VIEWER_ID }, { db });

    expect(findFirstBrunch).toHaveBeenCalledWith({
      where: {
        id: BRUNCH_ID,
        OR: [
          { hostId: VIEWER_ID },
          { attendees: { some: { userId: VIEWER_ID, deletedAt: null } } },
        ],
      },
      include: { status: true },
    });
  });

  it('reports canVote true for a yes/maybe viewer and false otherwise', async () => {
    const dbCanVote = makeMockDb({
      findFirstAttendee: vi
        .fn()
        .mockResolvedValue({ rsvpStatus: { code: 'maybe', canVote: true } }),
    });
    const resultCanVote = await getBrunchVoting(
      { brunchId: BRUNCH_ID, viewerId: VIEWER_ID },
      { db: dbCanVote },
    );
    expect(resultCanVote?.canVote).toBe(true);

    const dbCannotVote = makeMockDb({
      findFirstAttendee: vi.fn().mockResolvedValue({ rsvpStatus: { code: 'no', canVote: false } }),
    });
    const resultCannotVote = await getBrunchVoting(
      { brunchId: BRUNCH_ID, viewerId: VIEWER_ID },
      { db: dbCannotVote },
    );
    expect(resultCannotVote?.canVote).toBe(false);
  });

  it('reports canVote false when the viewer has no attendee row at all', async () => {
    const db = makeMockDb({ findFirstAttendee: vi.fn().mockResolvedValue(null) });

    const result = await getBrunchVoting({ brunchId: BRUNCH_ID, viewerId: VIEWER_ID }, { db });

    expect(result?.canVote).toBe(false);
  });

  it('computes voteCount and viewerVoted per option', async () => {
    const db = makeMockDb({
      findManyLocations: vi.fn().mockResolvedValue([
        {
          id: 'option-a',
          votes: [
            { userId: VIEWER_ID, user: { name: 'Viewer' } },
            { userId: 'other-uuid', user: { name: 'Other' } },
          ],
        },
        { id: 'option-b', votes: [] },
      ]),
    });

    const result = await getBrunchVoting({ brunchId: BRUNCH_ID, viewerId: VIEWER_ID }, { db });

    expect(result?.locations.options).toEqual([
      { id: 'option-a', voteCount: 2, viewerVoted: true, voters: undefined },
      { id: 'option-b', voteCount: 0, viewerVoted: false, voters: undefined },
    ]);
  });

  it('includes voter names only when the viewer is the host', async () => {
    const findManyLocations = vi
      .fn()
      .mockResolvedValue([
        { id: 'option-a', votes: [{ userId: 'other-uuid', user: { name: 'Other' } }] },
      ]);

    const dbAsHost = makeMockDb({ findManyLocations });
    const asHost = await getBrunchVoting(
      { brunchId: BRUNCH_ID, viewerId: HOST_ID },
      { db: dbAsHost },
    );
    expect(asHost?.locations.options[0]?.voters).toEqual(['Other']);

    const dbAsGuest = makeMockDb({ findManyLocations });
    const asGuest = await getBrunchVoting(
      { brunchId: BRUNCH_ID, viewerId: VIEWER_ID },
      { db: dbAsGuest },
    );
    expect(asGuest?.locations.options[0]?.voters).toBeUndefined();
  });

  it('reflects the derived mode from option count', async () => {
    const db = makeMockDb({ locationCount: vi.fn().mockResolvedValue(1) });

    const result = await getBrunchVoting({ brunchId: BRUNCH_ID, viewerId: VIEWER_ID }, { db });

    expect(result?.locations.mode).toBe('host_decides');
  });

  it('is closed when the brunch is confirmed', async () => {
    const db = makeMockDb({
      findFirstBrunch: vi.fn().mockResolvedValue({
        id: BRUNCH_ID,
        hostId: HOST_ID,
        status: { code: 'confirmed' },
        votingDeadline: null,
      }),
    });

    const result = await getBrunchVoting({ brunchId: BRUNCH_ID, viewerId: VIEWER_ID }, { db });

    expect(result?.locations.closed).toBe(true);
    expect(result?.times.closed).toBe(true);
  });

  it('is closed once the voting deadline has passed', async () => {
    const db = makeMockDb({
      findFirstBrunch: vi.fn().mockResolvedValue({
        id: BRUNCH_ID,
        hostId: HOST_ID,
        status: { code: 'active' },
        votingDeadline: new Date('2000-01-01T00:00:00.000Z'),
      }),
    });

    const result = await getBrunchVoting({ brunchId: BRUNCH_ID, viewerId: VIEWER_ID }, { db });

    expect(result?.locations.closed).toBe(true);
  });

  it('computes participationRatio from eligible attendees who voted', async () => {
    const db = makeMockDb({
      findManyAttendees: vi
        .fn()
        .mockResolvedValue([{ userId: 'voter-1' }, { userId: 'voter-2' }, { userId: 'voter-3' }]),
      findManyLocations: vi.fn().mockResolvedValue([
        {
          id: 'option-a',
          votes: [
            { userId: 'voter-1', user: { name: 'One' } },
            { userId: 'voter-2', user: { name: 'Two' } },
          ],
        },
      ]),
    });

    const result = await getBrunchVoting({ brunchId: BRUNCH_ID, viewerId: VIEWER_ID }, { db });

    expect(result?.locations.eligibleCount).toBe(3);
    expect(result?.locations.participationRatio).toBeCloseTo(2 / 3);
  });

  it('does not count a vote from an ineligible user toward participation', async () => {
    const db = makeMockDb({
      findManyAttendees: vi.fn().mockResolvedValue([{ userId: 'voter-1' }]),
      findManyLocations: vi.fn().mockResolvedValue([
        {
          id: 'option-a',
          // voter-2 is not in the eligible set (e.g. their RSVP changed to no
          // after voting) — their vote still counts toward voteCount, but
          // not toward participation.
          votes: [
            { userId: 'voter-1', user: { name: 'One' } },
            { userId: 'voter-2', user: { name: 'Two' } },
          ],
        },
      ]),
    });

    const result = await getBrunchVoting({ brunchId: BRUNCH_ID, viewerId: VIEWER_ID }, { db });

    expect(result?.locations.options[0]?.voteCount).toBe(2);
    expect(result?.locations.participationRatio).toBe(1);
  });

  it('returns a participationRatio of 0 when there are no eligible attendees', async () => {
    const db = makeMockDb({ findManyAttendees: vi.fn().mockResolvedValue([]) });

    const result = await getBrunchVoting({ brunchId: BRUNCH_ID, viewerId: VIEWER_ID }, { db });

    expect(result?.locations.eligibleCount).toBe(0);
    expect(result?.locations.participationRatio).toBe(0);
  });
});
