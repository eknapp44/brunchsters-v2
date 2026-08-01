import type { DbClient } from '@brunchsters/database';
import type { UserId } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import { getBrunchesForUser } from './getBrunchesForUser';

const USER_ID = 'user-uuid' as UserId;
const OTHER_HOST_ID = 'other-host-uuid';

function makeDbRow(brunchOverrides: Record<string, unknown> = {}) {
  return {
    brunch: {
      id: 'brunch-uuid',
      title: 'Weekend Brunch',
      hostId: USER_ID,
      createdAt: new Date('2026-07-01T10:00:00.000Z'),
      status: { code: 'draft', label: 'Draft' },
      _count: { attendees: 1 },
      ...brunchOverrides,
    },
  };
}

function makeMockDb(findMany: ReturnType<typeof vi.fn>): DbClient {
  return { brunchAttendee: { findMany } } as unknown as DbClient;
}

describe('getBrunchesForUser', () => {
  it('returns an empty array when the user has no attendee records', async () => {
    const findMany = vi.fn().mockResolvedValue([]);

    const result = await getBrunchesForUser({ userId: USER_ID }, { db: makeMockDb(findMany) });

    expect(result).toEqual([]);
  });

  it('maps a hosted brunch with isHost true', async () => {
    const findMany = vi.fn().mockResolvedValue([makeDbRow()]);

    const result = await getBrunchesForUser({ userId: USER_ID }, { db: makeMockDb(findMany) });

    expect(result).toEqual([
      {
        id: 'brunch-uuid',
        title: 'Weekend Brunch',
        statusCode: 'draft',
        statusLabel: 'Draft',
        isHost: true,
        goingCount: 1,
        createdAt: new Date('2026-07-01T10:00:00.000Z'),
      },
    ]);
  });

  it('maps an attended brunch with isHost false', async () => {
    const findMany = vi.fn().mockResolvedValue([makeDbRow({ hostId: OTHER_HOST_ID })]);

    const result = await getBrunchesForUser({ userId: USER_ID }, { db: makeMockDb(findMany) });

    expect(result[0]?.isHost).toBe(false);
  });

  it('takes goingCount from the filtered attendee count', async () => {
    const findMany = vi.fn().mockResolvedValue([makeDbRow({ _count: { attendees: 4 } })]);

    const result = await getBrunchesForUser({ userId: USER_ID }, { db: makeMockDb(findMany) });

    expect(result[0]?.goingCount).toBe(4);
  });

  it('queries only live rows: soft-deleted brunches excluded, going count restricted to countsAsAttendee RSVPs', async () => {
    const findMany = vi.fn().mockResolvedValue([]);

    await getBrunchesForUser({ userId: USER_ID }, { db: makeMockDb(findMany) });

    // Top-level BrunchAttendee deletedAt filtering comes from the soft-delete
    // extension; the joined brunch and the count filter must be explicit.
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER_ID, brunch: { deletedAt: null } },
        include: expect.objectContaining({
          brunch: expect.objectContaining({
            include: expect.objectContaining({
              _count: {
                select: {
                  attendees: {
                    where: { deletedAt: null, rsvpStatus: { countsAsAttendee: true } },
                  },
                },
              },
            }),
          }),
        }),
        orderBy: { brunch: { createdAt: 'desc' } },
      }),
    );
  });
});
