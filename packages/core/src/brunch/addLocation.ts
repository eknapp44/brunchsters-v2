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
    const location = await ctx.db.brunchLocation.create({
      data: {
        brunchId: input.brunchId,
        placeId: input.location.placeId,
        placeName: input.location.placeName,
        placeAddress: input.location.placeAddress,
        placeUrl: input.location.placeUrl,
        timezone: input.location.timezone,
        proposedById: input.requestedById,
      },
    });
    return ok({ id: location.id as BrunchLocationId });
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }
}
