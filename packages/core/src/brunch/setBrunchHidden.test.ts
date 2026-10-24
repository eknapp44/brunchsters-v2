import type { DbClient } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import { setBrunchHidden } from './setBrunchHidden';

const BRUNCH_ID = 'brunch-uuid' as BrunchId;
const VIEWER_ID = 'viewer-uuid' as UserId;
const NOW = new Date('2026-10-23T12:00:00.000Z');
const EARLIER = new Date('2026-10-01T09:00:00.000Z');

function makeMockDb(attendee: unknown) {
  const update = vi.fn().mockResolvedValue({});
  const findFirst = vi.fn().mockResolvedValue(attendee);
  const db = { brunchAttendee: { findFirst, update } } as unknown as DbClient;
  return { db, update, findFirst };
}

describe('setBrunchHidden', () => {
  it('hides the brunch for the viewer by marking their own attendee row', async () => {
    const { db, update } = makeMockDb({ id: 'attendee-1', hiddenAt: null });

    const result = await setBrunchHidden(
      { brunchId: BRUNCH_ID, viewerId: VIEWER_ID, hidden: true, now: NOW },
      { db },
    );

    expect(result._unsafeUnwrap()).toEqual({ hidden: true });
    expect(update).toHaveBeenCalledWith({ where: { id: 'attendee-1' }, data: { hiddenAt: NOW } });
  });

  it('shows it again by clearing the mark', async () => {
    const { db, update } = makeMockDb({ id: 'attendee-1', hiddenAt: EARLIER });

    const result = await setBrunchHidden(
      { brunchId: BRUNCH_ID, viewerId: VIEWER_ID, hidden: false },
      { db },
    );

    expect(result._unsafeUnwrap()).toEqual({ hidden: false });
    expect(update).toHaveBeenCalledWith({ where: { id: 'attendee-1' }, data: { hiddenAt: null } });
  });

  it('is idempotent: hiding twice keeps the first time, showing twice writes nothing', async () => {
    const hidden = makeMockDb({ id: 'attendee-1', hiddenAt: EARLIER });
    const visible = makeMockDb({ id: 'attendee-1', hiddenAt: null });

    await setBrunchHidden({ brunchId: BRUNCH_ID, viewerId: VIEWER_ID, hidden: true }, hidden);
    await setBrunchHidden({ brunchId: BRUNCH_ID, viewerId: VIEWER_ID, hidden: false }, visible);

    expect(hidden.update).not.toHaveBeenCalled();
    expect(visible.update).not.toHaveBeenCalled();
  });

  it('looks only at the viewer own row of a brunch that is not deleted', async () => {
    const { db, findFirst } = makeMockDb({ id: 'attendee-1', hiddenAt: null });

    await setBrunchHidden({ brunchId: BRUNCH_ID, viewerId: VIEWER_ID, hidden: true }, { db });

    expect(findFirst).toHaveBeenCalledWith({
      where: { brunchId: BRUNCH_ID, userId: VIEWER_ID, brunch: { deletedAt: null } },
    });
  });

  it('gives a person who is not in the brunch (or a deleted brunch) the answer for a made-up id', async () => {
    const { db, update } = makeMockDb(null);

    const result = await setBrunchHidden(
      { brunchId: BRUNCH_ID, viewerId: VIEWER_ID, hidden: true },
      { db },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
    expect(update).not.toHaveBeenCalled();
  });

  it('reports db_error when the write fails', async () => {
    const { db, update } = makeMockDb({ id: 'attendee-1', hiddenAt: null });
    update.mockRejectedValue(new Error('boom'));

    const result = await setBrunchHidden(
      { brunchId: BRUNCH_ID, viewerId: VIEWER_ID, hidden: true },
      { db },
    );

    expect(result._unsafeUnwrapErr().kind).toBe('db_error');
  });
});
