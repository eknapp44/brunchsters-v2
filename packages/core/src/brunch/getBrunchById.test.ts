import type { DbClient } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import { getBrunchById } from './getBrunchById';

const BRUNCH_ID = 'brunch-uuid' as BrunchId;
const VIEWER_ID = 'viewer-uuid' as UserId;

const HOST_ID = 'host-uuid' as UserId;

const DB_ROW = {
  id: BRUNCH_ID,
  title: 'Weekend Brunch',
  description: 'Pancakes and mimosas',
  hostId: HOST_ID,
  host: { name: 'Sam Liu' },
  status: { code: 'draft', label: 'Draft' },
  attendees: [{ rsvpStatus: { code: 'yes' } }],
  allowInviteSuggestions: true,
  allowLocationSuggestions: true,
  allowTimeSuggestions: true,
  votingDeadline: null,
};

function makeMockDb(findFirst: ReturnType<typeof vi.fn>): DbClient {
  return { brunch: { findFirst } } as unknown as DbClient;
}

describe('getBrunchById', () => {
  it('returns the brunch detail when the viewer has access', async () => {
    const findFirst = vi.fn().mockResolvedValue(DB_ROW);

    const result = await getBrunchById(
      { brunchId: BRUNCH_ID, viewerId: VIEWER_ID },
      { db: makeMockDb(findFirst) },
    );

    expect(result).toEqual({
      id: BRUNCH_ID,
      title: 'Weekend Brunch',
      description: 'Pancakes and mimosas',
      hostName: 'Sam Liu',
      statusCode: 'draft',
      statusLabel: 'Draft',
      isHost: false,
      viewerRsvpStatus: 'yes',
      isHidden: false,
      allowInviteSuggestions: true,
      allowLocationSuggestions: true,
      allowTimeSuggestions: true,
      votingDeadline: undefined,
    });
  });

  it('reports isHost true when the viewer is the host', async () => {
    const findFirst = vi.fn().mockResolvedValue({ ...DB_ROW, hostId: VIEWER_ID });

    const result = await getBrunchById(
      { brunchId: BRUNCH_ID, viewerId: VIEWER_ID },
      { db: makeMockDb(findFirst) },
    );

    expect(result?.isHost).toBe(true);
  });

  it('leaves viewerRsvpStatus undefined when the viewer has no attendee row', async () => {
    const findFirst = vi.fn().mockResolvedValue({ ...DB_ROW, attendees: [] });

    const result = await getBrunchById(
      { brunchId: BRUNCH_ID, viewerId: VIEWER_ID },
      { db: makeMockDb(findFirst) },
    );

    expect(result?.viewerRsvpStatus).toBeUndefined();
  });

  it("folds the eager 'invited' placeholder status into undefined, not a real response", async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValue({ ...DB_ROW, attendees: [{ rsvpStatus: { code: 'invited' } }] });

    const result = await getBrunchById(
      { brunchId: BRUNCH_ID, viewerId: VIEWER_ID },
      { db: makeMockDb(findFirst) },
    );

    expect(result?.viewerRsvpStatus).toBeUndefined();
  });

  it('scopes the query to the viewer as host or live attendee', async () => {
    const findFirst = vi.fn().mockResolvedValue(DB_ROW);

    await getBrunchById(
      { brunchId: BRUNCH_ID, viewerId: VIEWER_ID },
      { db: makeMockDb(findFirst) },
    );

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: BRUNCH_ID,
          OR: [
            { hostId: VIEWER_ID },
            { attendees: { some: { userId: VIEWER_ID, deletedAt: null } } },
          ],
        }),
        include: expect.objectContaining({
          host: { select: { name: true } },
          attendees: expect.objectContaining({
            where: { userId: VIEWER_ID, deletedAt: null },
          }),
        }),
      }),
    );
  });

  it('returns undefined when no accessible brunch matches (missing, deleted, or non-member)', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);

    const result = await getBrunchById(
      { brunchId: BRUNCH_ID, viewerId: VIEWER_ID },
      { db: makeMockDb(findFirst) },
    );

    expect(result).toBeUndefined();
  });

  it('maps a null description to undefined', async () => {
    const findFirst = vi.fn().mockResolvedValue({ ...DB_ROW, description: null });

    const result = await getBrunchById(
      { brunchId: BRUNCH_ID, viewerId: VIEWER_ID },
      { db: makeMockDb(findFirst) },
    );

    expect(result?.description).toBeUndefined();
  });

  it('passes through a set voting deadline', async () => {
    const deadline = new Date('2026-08-01T15:00:00.000Z');
    const findFirst = vi.fn().mockResolvedValue({ ...DB_ROW, votingDeadline: deadline });

    const result = await getBrunchById(
      { brunchId: BRUNCH_ID, viewerId: VIEWER_ID },
      { db: makeMockDb(findFirst) },
    );

    expect(result?.votingDeadline).toBe(deadline);
  });

  it('reports isHidden when the viewer hid the brunch from their own dashboard', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      ...DB_ROW,
      attendees: [{ rsvpStatus: { code: 'yes' }, hiddenAt: new Date('2026-10-01T10:00:00.000Z') }],
    });

    const result = await getBrunchById(
      { brunchId: BRUNCH_ID, viewerId: VIEWER_ID },
      { db: makeMockDb(findFirst) },
    );

    expect(result?.isHidden).toBe(true);
  });
});
