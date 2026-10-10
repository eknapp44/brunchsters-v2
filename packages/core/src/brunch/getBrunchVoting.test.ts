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
  findManyLocationSuggestions?: ReturnType<typeof vi.fn>;
  findManyTimeSuggestions?: ReturnType<typeof vi.fn>;
};

const OPEN_BRUNCH = {
  id: BRUNCH_ID,
  hostId: HOST_ID,
  status: { code: 'active' },
  votingDeadline: null,
  votingClosedAt: null,
};

function makeMockDb(overrides: Overrides): DbClient {
  return {
    brunch: {
      findFirst: overrides.findFirstBrunch ?? vi.fn().mockResolvedValue(OPEN_BRUNCH),
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
    brunchLocationSuggestion: {
      findMany: overrides.findManyLocationSuggestions ?? vi.fn().mockResolvedValue([]),
    },
    brunchTimeSuggestion: {
      findMany: overrides.findManyTimeSuggestions ?? vi.fn().mockResolvedValue([]),
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

  it('selects only the intended fields on locations/times — never include, which would leak internal columns', async () => {
    const findManyLocations = vi.fn().mockResolvedValue([]);
    const findManyTimes = vi.fn().mockResolvedValue([]);
    const db = makeMockDb({ findManyLocations, findManyTimes });

    await getBrunchVoting({ brunchId: BRUNCH_ID, viewerId: VIEWER_ID }, { db });

    const voteSelect = { userId: true, user: { select: { name: true } } };
    expect(findManyLocations).toHaveBeenCalledWith({
      where: { brunchId: BRUNCH_ID },
      select: {
        id: true,
        placeId: true,
        placeName: true,
        placeAddress: true,
        placeUrl: true,
        timezone: true,
        isConfirmed: true,
        votes: { select: voteSelect },
      },
    });
    expect(findManyTimes).toHaveBeenCalledWith({
      where: { brunchId: BRUNCH_ID },
      select: { id: true, scheduledAt: true, isConfirmed: true, votes: { select: voteSelect } },
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

  it('computes voteCount and viewerVoted per option, carrying the location payload through', async () => {
    const db = makeMockDb({
      findManyLocations: vi.fn().mockResolvedValue([
        {
          id: 'option-a',
          placeId: 'place-a',
          placeName: 'Cafe A',
          placeAddress: '1 Main St',
          placeUrl: 'https://maps.google.com/?cid=a',
          timezone: 'America/Chicago',
          isConfirmed: true,
          votes: [
            { userId: VIEWER_ID, user: { name: 'Viewer' } },
            { userId: 'other-uuid', user: { name: 'Other' } },
          ],
        },
        {
          id: 'option-b',
          placeId: 'place-b',
          placeName: 'Cafe B',
          placeAddress: '2 Main St',
          placeUrl: 'https://maps.google.com/?cid=b',
          timezone: 'America/Chicago',
          isConfirmed: false,
          votes: [],
        },
      ]),
    });

    const result = await getBrunchVoting({ brunchId: BRUNCH_ID, viewerId: VIEWER_ID }, { db });

    expect(result?.locations.options).toEqual([
      {
        id: 'option-a',
        placeId: 'place-a',
        placeName: 'Cafe A',
        placeAddress: '1 Main St',
        placeUrl: 'https://maps.google.com/?cid=a',
        timezone: 'America/Chicago',
        isConfirmed: true,
        voteCount: 2,
        viewerVoted: true,
        voters: undefined,
      },
      {
        id: 'option-b',
        placeId: 'place-b',
        placeName: 'Cafe B',
        placeAddress: '2 Main St',
        placeUrl: 'https://maps.google.com/?cid=b',
        timezone: 'America/Chicago',
        isConfirmed: false,
        voteCount: 0,
        viewerVoted: false,
        voters: undefined,
      },
    ]);
  });

  it('computes voteCount and viewerVoted per time option, carrying scheduledAt through', async () => {
    const scheduledAt = new Date('2026-08-01T15:00:00.000Z');
    const db = makeMockDb({
      findManyTimes: vi.fn().mockResolvedValue([
        {
          id: 'time-a',
          scheduledAt,
          isConfirmed: true,
          votes: [{ userId: VIEWER_ID, user: { name: 'Viewer' } }],
        },
      ]),
    });

    const result = await getBrunchVoting({ brunchId: BRUNCH_ID, viewerId: VIEWER_ID }, { db });

    expect(result?.times.options).toEqual([
      {
        id: 'time-a',
        scheduledAt,
        isConfirmed: true,
        voteCount: 1,
        viewerVoted: true,
        voters: undefined,
      },
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

  it('is open by default when nothing has closed it', async () => {
    const db = makeMockDb({});

    const result = await getBrunchVoting({ brunchId: BRUNCH_ID, viewerId: VIEWER_ID }, { db });

    expect(result?.locations.closed).toBe(false);
    expect(result?.times.closed).toBe(false);
  });

  it('is closed when the brunch is confirmed', async () => {
    const db = makeMockDb({
      findFirstBrunch: vi.fn().mockResolvedValue({ ...OPEN_BRUNCH, status: { code: 'confirmed' } }),
    });

    const result = await getBrunchVoting({ brunchId: BRUNCH_ID, viewerId: VIEWER_ID }, { db });

    expect(result?.locations.closed).toBe(true);
    expect(result?.times.closed).toBe(true);
  });

  it('is closed once the voting deadline has passed', async () => {
    const db = makeMockDb({
      findFirstBrunch: vi.fn().mockResolvedValue({
        ...OPEN_BRUNCH,
        votingDeadline: new Date('2000-01-01T00:00:00.000Z'),
      }),
    });

    const result = await getBrunchVoting({ brunchId: BRUNCH_ID, viewerId: VIEWER_ID }, { db });

    expect(result?.locations.closed).toBe(true);
  });

  it('is closed by an early manual close (votingClosedAt)', async () => {
    const db = makeMockDb({
      findFirstBrunch: vi.fn().mockResolvedValue({ ...OPEN_BRUNCH, votingClosedAt: new Date() }),
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

  it('suggests closing at exactly 2/3 participation with 3+ eligible attendees', async () => {
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

    expect(result?.locations.shouldSuggestClosing).toBe(true);
  });

  it('does not suggest closing below 3 eligible attendees, even at 100% participation', async () => {
    const db = makeMockDb({
      findManyAttendees: vi.fn().mockResolvedValue([{ userId: 'voter-1' }, { userId: 'voter-2' }]),
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

    expect(result?.locations.eligibleCount).toBe(2);
    expect(result?.locations.participationRatio).toBe(1);
    expect(result?.locations.shouldSuggestClosing).toBe(false);
  });

  it('does not suggest closing below the 66% threshold', async () => {
    const db = makeMockDb({
      findManyAttendees: vi
        .fn()
        .mockResolvedValue([{ userId: 'voter-1' }, { userId: 'voter-2' }, { userId: 'voter-3' }]),
      findManyLocations: vi
        .fn()
        .mockResolvedValue([
          { id: 'option-a', votes: [{ userId: 'voter-1', user: { name: 'One' } }] },
        ]),
    });

    const result = await getBrunchVoting({ brunchId: BRUNCH_ID, viewerId: VIEWER_ID }, { db });

    expect(result?.locations.shouldSuggestClosing).toBe(false);
  });

  it('does not suggest closing once voting is already closed', async () => {
    const db = makeMockDb({
      findFirstBrunch: vi.fn().mockResolvedValue({ ...OPEN_BRUNCH, status: { code: 'confirmed' } }),
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

    expect(result?.locations.closed).toBe(true);
    expect(result?.locations.shouldSuggestClosing).toBe(false);
  });

  it('shows the host every pending location suggestion', async () => {
    const findManyLocationSuggestions = vi.fn().mockResolvedValue([
      {
        id: 'sugg-1',
        placeId: 'place-1',
        placeName: 'Cafe Suggested',
        placeAddress: '9 Side St',
        placeUrl: 'https://maps.google.com/?cid=z',
        timezone: 'America/Chicago',
        suggestedById: 'other-uuid',
        suggestedBy: { name: 'Other' },
      },
    ]);
    const db = makeMockDb({ findManyLocationSuggestions });

    const result = await getBrunchVoting({ brunchId: BRUNCH_ID, viewerId: HOST_ID }, { db });

    expect(findManyLocationSuggestions).toHaveBeenCalledWith(
      expect.objectContaining({ where: { brunchId: BRUNCH_ID, status: { code: 'pending' } } }),
    );
    expect(result?.locations.pendingSuggestions).toEqual([
      {
        id: 'sugg-1',
        placeId: 'place-1',
        placeName: 'Cafe Suggested',
        placeAddress: '9 Side St',
        placeUrl: 'https://maps.google.com/?cid=z',
        timezone: 'America/Chicago',
        suggestedByName: 'Other',
        suggestedByViewer: false,
      },
    ]);
  });

  it('scopes a non-host viewer to only their own pending suggestions', async () => {
    const findManyLocationSuggestions = vi.fn().mockResolvedValue([]);
    const db = makeMockDb({ findManyLocationSuggestions });

    await getBrunchVoting({ brunchId: BRUNCH_ID, viewerId: VIEWER_ID }, { db });

    expect(findManyLocationSuggestions).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { brunchId: BRUNCH_ID, status: { code: 'pending' }, suggestedById: VIEWER_ID },
      }),
    );
  });

  it('marks suggestedByViewer true when the viewer made the suggestion', async () => {
    const db = makeMockDb({
      findManyTimeSuggestions: vi.fn().mockResolvedValue([
        {
          id: 'sugg-time-1',
          scheduledAt: new Date('2026-08-01T15:00:00.000Z'),
          suggestedById: VIEWER_ID,
          suggestedBy: { name: 'Viewer' },
        },
      ]),
    });

    const result = await getBrunchVoting({ brunchId: BRUNCH_ID, viewerId: VIEWER_ID }, { db });

    expect(result?.times.pendingSuggestions).toEqual([
      {
        id: 'sugg-time-1',
        scheduledAt: new Date('2026-08-01T15:00:00.000Z'),
        suggestedByName: 'Viewer',
        suggestedByViewer: true,
      },
    ]);
  });
});
