import type { DbClient } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import { addLocation, type AddLocationInput } from './addLocation';
import type { LocationInput } from './createBrunch';

const BRUNCH_ID = 'brunch-uuid' as BrunchId;
const HOST_ID = 'host-uuid' as UserId;
const OTHER_ID = 'other-uuid' as UserId;

const LOCATION: LocationInput = {
  placeId: 'place-a',
  placeName: 'Cafe A',
  placeAddress: '1 Main St',
  placeUrl: 'https://maps.google.com/?cid=a',
  timezone: 'America/Chicago',
};

const BASE_INPUT: AddLocationInput = {
  brunchId: BRUNCH_ID,
  requestedById: HOST_ID,
  location: LOCATION,
};

function makeMockDb(overrides: {
  findFirstBrunch?: ReturnType<typeof vi.fn>;
  create?: ReturnType<typeof vi.fn>;
}): DbClient {
  return {
    brunch: {
      findFirst:
        overrides.findFirstBrunch ??
        vi.fn().mockResolvedValue({ id: BRUNCH_ID, hostId: HOST_ID, status: { code: 'active' } }),
    },
    brunchLocation: {
      create: overrides.create ?? vi.fn().mockResolvedValue({ id: 'new-location-uuid' }),
    },
  } as unknown as DbClient;
}

describe('addLocation', () => {
  it('creates the location when the caller is the host and the brunch is active', async () => {
    const db = makeMockDb({});

    const result = await addLocation(BASE_INPUT, { db });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ id: 'new-location-uuid' });
    expect(db.brunchLocation.create).toHaveBeenCalledWith({
      data: {
        brunchId: BRUNCH_ID,
        placeId: LOCATION.placeId,
        placeName: LOCATION.placeName,
        placeAddress: LOCATION.placeAddress,
        placeUrl: LOCATION.placeUrl,
        timezone: LOCATION.timezone,
        proposedById: HOST_ID,
      },
    });
  });

  it('rejects when the brunch does not exist', async () => {
    const db = makeMockDb({ findFirstBrunch: vi.fn().mockResolvedValue(null) });

    const result = await addLocation(BASE_INPUT, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
    expect(db.brunchLocation.create).not.toHaveBeenCalled();
  });

  it('rejects a non-host', async () => {
    const db = makeMockDb({});

    const result = await addLocation({ ...BASE_INPUT, requestedById: OTHER_ID }, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'not_host' });
    expect(db.brunchLocation.create).not.toHaveBeenCalled();
  });

  it('rejects a brunch that is not active', async () => {
    const db = makeMockDb({
      findFirstBrunch: vi
        .fn()
        .mockResolvedValue({ id: BRUNCH_ID, hostId: HOST_ID, status: { code: 'confirmed' } }),
    });

    const result = await addLocation(BASE_INPUT, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_active' });
    expect(db.brunchLocation.create).not.toHaveBeenCalled();
  });

  it('maps a db error on create', async () => {
    const cause = new Error('connection refused');
    const db = makeMockDb({ create: vi.fn().mockRejectedValue(cause) });

    const result = await addLocation(BASE_INPUT, { db });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'db_error', cause });
  });
});
