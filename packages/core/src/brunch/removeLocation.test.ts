import type { DbClient } from '@brunchsters/database';
import type { BrunchId, BrunchLocationId, UserId } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import { removeLocation, type RemoveLocationInput } from './removeLocation';

const BRUNCH_ID = 'brunch-uuid' as BrunchId;
const OTHER_BRUNCH_ID = 'other-brunch-uuid' as BrunchId;
const LOCATION_ID = 'location-uuid' as BrunchLocationId;
const HOST_ID = 'host-uuid' as UserId;
const OTHER_ID = 'other-uuid' as UserId;

const BASE_INPUT: RemoveLocationInput = {
  brunchId: BRUNCH_ID,
  requestedById: HOST_ID,
  locationId: LOCATION_ID,
};

type Overrides = {
  findFirstBrunch?: ReturnType<typeof vi.fn>;
  findFirstLocation?: ReturnType<typeof vi.fn>;
  count?: ReturnType<typeof vi.fn>;
  update?: ReturnType<typeof vi.fn>;
};

function makeMockDb(overrides: Overrides): DbClient {
  return {
    brunch: {
      findFirst:
        overrides.findFirstBrunch ??
        vi.fn().mockResolvedValue({ id: BRUNCH_ID, hostId: HOST_ID, status: { code: 'active' } }),
    },
    brunchLocation: {
      findFirst:
        overrides.findFirstLocation ??
        vi.fn().mockResolvedValue({ id: LOCATION_ID, brunchId: BRUNCH_ID, isConfirmed: false }),
      count: overrides.count ?? vi.fn().mockResolvedValue(2),
      update: overrides.update ?? vi.fn().mockResolvedValue({ id: LOCATION_ID }),
    },
  } as unknown as DbClient;
}

describe('removeLocation', () => {
  it('soft-deletes the location when there are other options left', async () => {
    const db = makeMockDb({});

    const result = await removeLocation(BASE_INPUT, { db });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ id: LOCATION_ID });
    expect(db.brunchLocation.update).toHaveBeenCalledWith({
      where: { id: LOCATION_ID },
      data: { deletedAt: expect.any(Date), deletedBy: HOST_ID },
    });
  });

  it('rejects when the brunch does not exist', async () => {
    const db = makeMockDb({ findFirstBrunch: vi.fn().mockResolvedValue(null) });

    const result = await removeLocation(BASE_INPUT, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
    expect(db.brunchLocation.update).not.toHaveBeenCalled();
  });

  it('rejects a non-host', async () => {
    const db = makeMockDb({});

    const result = await removeLocation({ ...BASE_INPUT, requestedById: OTHER_ID }, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'not_host' });
    expect(db.brunchLocation.update).not.toHaveBeenCalled();
  });

  it('rejects a brunch that is not active', async () => {
    const db = makeMockDb({
      findFirstBrunch: vi
        .fn()
        .mockResolvedValue({ id: BRUNCH_ID, hostId: HOST_ID, status: { code: 'confirmed' } }),
    });

    const result = await removeLocation(BASE_INPUT, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_active' });
    expect(db.brunchLocation.update).not.toHaveBeenCalled();
  });

  it('rejects an unknown location id', async () => {
    const db = makeMockDb({ findFirstLocation: vi.fn().mockResolvedValue(null) });

    const result = await removeLocation(BASE_INPUT, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'unknown_option' });
    expect(db.brunchLocation.update).not.toHaveBeenCalled();
  });

  it('rejects a location id that belongs to another brunch', async () => {
    const findFirstLocation = vi.fn().mockResolvedValue(null);
    const db = makeMockDb({ findFirstLocation });

    await removeLocation({ ...BASE_INPUT, brunchId: OTHER_BRUNCH_ID }, { db });

    expect(findFirstLocation).toHaveBeenCalledWith({
      where: { id: LOCATION_ID, brunchId: OTHER_BRUNCH_ID },
    });
  });

  it('rejects removing a confirmed location', async () => {
    const db = makeMockDb({
      findFirstLocation: vi
        .fn()
        .mockResolvedValue({ id: LOCATION_ID, brunchId: BRUNCH_ID, isConfirmed: true }),
    });

    const result = await removeLocation(BASE_INPUT, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'option_confirmed' });
    expect(db.brunchLocation.update).not.toHaveBeenCalled();
  });

  it('rejects removing the last remaining location', async () => {
    const db = makeMockDb({ count: vi.fn().mockResolvedValue(1) });

    const result = await removeLocation(BASE_INPUT, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'last_option' });
    expect(db.brunchLocation.update).not.toHaveBeenCalled();
  });

  it('always filters deletedAt: null on the sibling count, since count() bypasses the soft-delete extension', async () => {
    const count = vi.fn().mockResolvedValue(2);
    const db = makeMockDb({ count });

    await removeLocation(BASE_INPUT, { db });

    expect(count).toHaveBeenCalledWith({
      where: { brunchId: BRUNCH_ID, deletedAt: null },
    });
  });

  it('maps a db error on update', async () => {
    const cause = new Error('connection refused');
    const db = makeMockDb({ update: vi.fn().mockRejectedValue(cause) });

    const result = await removeLocation(BASE_INPUT, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'db_error', cause });
  });
});
