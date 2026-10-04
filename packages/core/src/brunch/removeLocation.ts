import type { DbClient } from '@brunchsters/database';
import type { BrunchId, BrunchLocationId, UserId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import type { AssertBrunchActiveError } from './guards/assertBrunchActive';
import { assertBrunchActive } from './guards/assertBrunchActive';
import type { AssertHostOfError } from './guards/assertHostOf';
import { assertHostOf } from './guards/assertHostOf';

export type RemoveLocationInput = {
  readonly brunchId: BrunchId;
  readonly requestedById: UserId;
  readonly locationId: BrunchLocationId;
};

export type RemoveLocationError =
  | AssertHostOfError
  | AssertBrunchActiveError
  | { readonly kind: 'unknown_option' }
  | { readonly kind: 'option_confirmed' }
  | { readonly kind: 'last_option' }
  | { readonly kind: 'db_error'; readonly cause: unknown };

export async function removeLocation(
  input: RemoveLocationInput,
  ctx: { readonly db: DbClient },
): Promise<Result<{ id: BrunchLocationId }, RemoveLocationError>> {
  const hostResult = await assertHostOf(
    { brunchId: input.brunchId, userId: input.requestedById },
    ctx,
  );
  if (hostResult.isErr()) return err(hostResult.error);

  const activeResult = assertBrunchActive(hostResult.value);
  if (activeResult.isErr()) return err(activeResult.error);

  // Scoping by brunchId too means an id from another brunch resolves to
  // null here, same as a genuinely unknown id — both are unknown_option.
  const location = await ctx.db.brunchLocation.findFirst({
    where: { id: input.locationId, brunchId: input.brunchId },
  });
  if (location === null) return err({ kind: 'unknown_option' });
  if (location.isConfirmed) return err({ kind: 'option_confirmed' });

  // count() bypasses the soft-delete extension (only findMany/findFirst are
  // intercepted), so deletedAt: null must be spelled out here (ADR 0006).
  const remaining = await ctx.db.brunchLocation.count({
    where: { brunchId: input.brunchId, deletedAt: null },
  });
  if (remaining <= 1) return err({ kind: 'last_option' });

  try {
    await ctx.db.brunchLocation.update({
      where: { id: input.locationId },
      data: { deletedAt: new Date(), deletedBy: input.requestedById },
    });
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }

  return ok({ id: input.locationId });
}
