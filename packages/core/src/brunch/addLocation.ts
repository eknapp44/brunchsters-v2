import type { DbClient } from '@brunchsters/database';
import type { BrunchId, BrunchLocationId, UserId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import type { LocationInput } from './createBrunch';
import type { AssertBrunchActiveError } from './guards/assertBrunchActive';
import { assertBrunchActive } from './guards/assertBrunchActive';
import type { AssertHostOfError } from './guards/assertHostOf';
import { assertHostOf } from './guards/assertHostOf';

export type AddLocationInput = {
  readonly brunchId: BrunchId;
  readonly requestedById: UserId;
  readonly location: LocationInput;
};

export type AddLocationError =
  | AssertHostOfError
  | AssertBrunchActiveError
  | { readonly kind: 'db_error'; readonly cause: unknown };

// The interactive-transaction client Prisma passes into db.$transaction's
// callback, derived from DbClient itself so it stays correct for the
// soft-delete extension DbClient applies.
export type AddLocationTxClient = Parameters<Parameters<DbClient['$transaction']>[0]>[0];

export type AddLocationTxInput = {
  readonly brunchId: BrunchId;
  readonly proposedById: UserId;
  readonly location: LocationInput;
};

// Raw create, no guards — callable with either a plain DbClient (addLocation
// itself; a single insert needs no transaction) or a transaction client
// (reviewLocationSuggestion, which needs this write and the suggestion's
// status update to commit atomically together).
export async function addLocationInTransaction(
  db: AddLocationTxClient,
  input: AddLocationTxInput,
): Promise<{ id: BrunchLocationId }> {
  const location = await db.brunchLocation.create({
    data: {
      brunchId: input.brunchId,
      placeId: input.location.placeId,
      placeName: input.location.placeName,
      placeAddress: input.location.placeAddress,
      placeUrl: input.location.placeUrl,
      timezone: input.location.timezone,
      proposedById: input.proposedById,
    },
  });
  return { id: location.id as BrunchLocationId };
}

export async function addLocation(
  input: AddLocationInput,
  ctx: { readonly db: DbClient },
): Promise<Result<{ id: BrunchLocationId }, AddLocationError>> {
  const hostResult = await assertHostOf(
    { brunchId: input.brunchId, userId: input.requestedById },
    ctx,
  );
  if (hostResult.isErr()) return err(hostResult.error);

  const activeResult = assertBrunchActive(hostResult.value);
  if (activeResult.isErr()) return err(activeResult.error);

  try {
    const created = await addLocationInTransaction(ctx.db, {
      brunchId: input.brunchId,
      proposedById: input.requestedById,
      location: input.location,
    });
    return ok(created);
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }
}
