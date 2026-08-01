import type { DbClient } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import { getBrunchById } from './getBrunchById';

const BRUNCH_ID = 'brunch-uuid' as BrunchId;
const VIEWER_ID = 'viewer-uuid' as UserId;

const DB_ROW = {
  id: BRUNCH_ID,
  title: 'Weekend Brunch',
  description: 'Pancakes and mimosas',
  status: { code: 'draft', label: 'Draft' },
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
      statusCode: 'draft',
      statusLabel: 'Draft',
    });
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
});
