import type { DbClient } from '@brunchsters/database';
import type { UserId } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import { getBrunchesForUser } from './getBrunchesForUser';

const USER_ID = 'user-uuid' as UserId;
const OTHER_HOST_ID = 'other-host-uuid';
const NOW = new Date('2026-10-21T12:00:00.000Z');

type Option = Record<string, unknown>;

const unvotedLocations: Option[] = [
  { isConfirmed: false, placeName: 'Tartine', timezone: 'America/Los_Angeles', votes: [] },
  { isConfirmed: false, placeName: 'Zazie', timezone: 'America/Los_Angeles', votes: [] },
];
const unvotedTimes: Option[] = [
  { isConfirmed: false, scheduledAt: new Date('2026-11-01T18:00:00.000Z'), votes: [] },
  { isConfirmed: false, scheduledAt: new Date('2026-11-02T18:00:00.000Z'), votes: [] },
];

function makeDbRow(
  brunchOverrides: Record<string, unknown> = {},
  recordOverrides: Record<string, unknown> = {},
) {
  return {
    rsvpStatus: { canVote: true },
    brunch: {
      id: 'brunch-uuid',
      title: 'Weekend Brunch',
      description: null,
      hostId: USER_ID,
      createdAt: new Date('2026-07-01T10:00:00.000Z'),
      votingDeadline: null,
      votingClosedAt: null,
      status: { code: 'draft', label: 'Draft' },
      _count: { attendees: 1 },
      locations: [],
      times: [],
      ...brunchOverrides,
    },
    ...recordOverrides,
  };
}

function makeMockDb(findMany: ReturnType<typeof vi.fn>): DbClient {
  return { brunchAttendee: { findMany } } as unknown as DbClient;
}

async function summaries(rows: readonly unknown[]) {
  const findMany = vi.fn().mockResolvedValue(rows);
  return getBrunchesForUser({ userId: USER_ID, now: NOW }, { db: makeMockDb(findMany) });
}

describe('getBrunchesForUser', () => {
  it('returns an empty array when the user has no attendee records', async () => {
    expect(await summaries([])).toEqual([]);
  });

  it('maps a hosted draft with isHost true and nothing confirmed', async () => {
    expect(await summaries([makeDbRow()])).toEqual([
      {
        id: 'brunch-uuid',
        title: 'Weekend Brunch',
        description: undefined,
        statusCode: 'draft',
        statusLabel: 'Draft',
        isHost: true,
        goingCount: 1,
        createdAt: new Date('2026-07-01T10:00:00.000Z'),
        scheduledAt: undefined,
        placeName: undefined,
        timezone: undefined,
        votingDeadline: undefined,
        votingClosed: false,
        votesWaiting: false,
      },
    ]);
  });

  it('maps an attended brunch with isHost false', async () => {
    const [summary] = await summaries([makeDbRow({ hostId: OTHER_HOST_ID })]);
    expect(summary?.isHost).toBe(false);
  });

  it('takes goingCount from the filtered attendee count', async () => {
    const [summary] = await summaries([makeDbRow({ _count: { attendees: 4 } })]);
    expect(summary?.goingCount).toBe(4);
  });

  it('carries the description and the voting deadline, and turns null into undefined', async () => {
    const deadline = new Date('2026-10-30T22:00:00.000Z');
    const [summary] = await summaries([
      makeDbRow({ description: 'Sunday vibes', votingDeadline: deadline }),
    ]);
    expect(summary?.description).toBe('Sunday vibes');
    expect(summary?.votingDeadline).toEqual(deadline);
  });

  it('reads the confirmed place and time from the options that are confirmed', async () => {
    const confirmedTime = new Date('2026-11-01T18:00:00.000Z');
    const [summary] = await summaries([
      makeDbRow({
        status: { code: 'confirmed', label: 'Confirmed' },
        locations: [
          { isConfirmed: false, placeName: 'Zazie', timezone: 'America/New_York', votes: [] },
          { isConfirmed: true, placeName: 'Tartine', timezone: 'America/Los_Angeles', votes: [] },
        ],
        times: [{ isConfirmed: true, scheduledAt: confirmedTime, votes: [] }],
      }),
    ]);
    expect(summary?.placeName).toBe('Tartine');
    expect(summary?.timezone).toBe('America/Los_Angeles');
    expect(summary?.scheduledAt).toEqual(confirmedTime);
  });

  it('shows nothing confirmed while the options are only candidates', async () => {
    const [summary] = await summaries([
      makeDbRow({
        status: { code: 'active', label: 'Active' },
        locations: unvotedLocations,
        times: unvotedTimes,
      }),
    ]);
    expect(summary?.placeName).toBeUndefined();
    expect(summary?.scheduledAt).toBeUndefined();
  });

  describe('votesWaiting', () => {
    const active = { status: { code: 'active', label: 'Active' } };

    it('is true for an active brunch whose lists are votes the person has not voted on', async () => {
      const [summary] = await summaries([
        makeDbRow({ ...active, locations: unvotedLocations, times: unvotedTimes }),
      ]);
      expect(summary?.votesWaiting).toBe(true);
    });

    it('is false once the person has a vote on every list that is a vote', async () => {
      const voted = (options: Option[]): Option[] =>
        options.map((option, index) => ({ ...option, votes: index === 0 ? [{ id: 'v' }] : [] }));
      const [summary] = await summaries([
        makeDbRow({
          ...active,
          locations: voted(unvotedLocations),
          times: voted(unvotedTimes),
        }),
      ]);
      expect(summary?.votesWaiting).toBe(false);
    });

    it('is false for a person with no say in the vote', async () => {
      const [summary] = await summaries([
        makeDbRow(
          { ...active, locations: unvotedLocations, times: unvotedTimes },
          { rsvpStatus: { canVote: false } },
        ),
      ]);
      expect(summary?.votesWaiting).toBe(false);
    });

    it('is false and marked closed once the host closed voting', async () => {
      const [summary] = await summaries([
        makeDbRow({
          ...active,
          locations: unvotedLocations,
          times: unvotedTimes,
          votingClosedAt: new Date('2026-10-20T12:00:00.000Z'),
        }),
      ]);
      expect(summary?.votesWaiting).toBe(false);
      expect(summary?.votingClosed).toBe(true);
    });

    it('is judged at the moment given: open before the deadline, closed after it', async () => {
      const row = makeDbRow({
        ...active,
        locations: unvotedLocations,
        times: unvotedTimes,
        votingDeadline: new Date('2026-10-21T18:00:00.000Z'),
      });
      const findMany = vi.fn().mockResolvedValue([row]);
      const db = makeMockDb(findMany);

      const before = await getBrunchesForUser(
        { userId: USER_ID, now: new Date('2026-10-21T17:00:00.000Z') },
        { db },
      );
      const after = await getBrunchesForUser(
        { userId: USER_ID, now: new Date('2026-10-21T19:00:00.000Z') },
        { db },
      );
      expect(before[0]?.votesWaiting).toBe(true);
      expect(after[0]?.votesWaiting).toBe(false);
    });
  });

  it('makes one query however many brunches there are', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([makeDbRow({ id: 'a' }), makeDbRow({ id: 'b' }), makeDbRow({ id: 'c' })]);

    const result = await getBrunchesForUser(
      { userId: USER_ID, now: NOW },
      { db: makeMockDb(findMany) },
    );

    expect(result).toHaveLength(3);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('queries only live rows: soft-deleted brunches and options excluded, going count restricted to countsAsAttendee RSVPs, only the viewer own votes loaded', async () => {
    const findMany = vi.fn().mockResolvedValue([]);

    await getBrunchesForUser({ userId: USER_ID }, { db: makeMockDb(findMany) });

    // Top-level BrunchAttendee deletedAt filtering comes from the soft-delete
    // extension; the joined brunch, the options and the count filter must be explicit.
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER_ID, brunch: { deletedAt: null } },
        include: expect.objectContaining({
          rsvpStatus: { select: { canVote: true } },
          brunch: expect.objectContaining({
            include: expect.objectContaining({
              _count: {
                select: {
                  attendees: {
                    where: { deletedAt: null, rsvpStatus: { countsAsAttendee: true } },
                  },
                },
              },
              locations: expect.objectContaining({
                where: { deletedAt: null },
                select: expect.objectContaining({
                  votes: { where: { userId: USER_ID }, select: { id: true } },
                }),
              }),
              times: expect.objectContaining({
                where: { deletedAt: null },
                select: expect.objectContaining({
                  votes: { where: { userId: USER_ID }, select: { id: true } },
                }),
              }),
            }),
          }),
        }),
        orderBy: { brunch: { createdAt: 'desc' } },
      }),
    );
  });
});
