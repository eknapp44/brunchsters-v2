import type { DbClient } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import { assertHostOf, type AssertHostOfError } from './guards/assertHostOf';

// Only a brunch nobody has been told about (a draft) or one that was called off, so people always
// get the "called off" state before a brunch disappears from their dashboard (ADR 0015).
const DELETABLE_STATUS_CODES: ReadonlySet<string> = new Set(['draft', 'cancelled']);

export type DeleteBrunchInput = {
  readonly brunchId: BrunchId;
  readonly requestedById: UserId;
  // The moment recorded as the deletion; the clock by default.
  readonly now?: Date;
};

export type DeleteBrunchError =
  | AssertHostOfError
  // A live brunch (active or confirmed), or the status changed under the request.
  | { readonly kind: 'not_deletable'; readonly statusCode: string }
  | { readonly kind: 'db_error'; readonly cause: unknown };

// The host removes a draft or a called-off brunch (spec 0013, ADR 0015). A soft delete
// (`deletedAt`/`deletedBy`, the app's default): from then on the brunch is a 404 for everyone, its
// invite links go cold, and it leaves every dashboard, because every read already excludes a row
// with `deletedAt`. Nothing is purged. A second delete finds nothing, so it is a 404 too.
//
// Not guarded by `assertBrunchOpen`: a called-off brunch is exactly what this is for.
export async function deleteBrunch(
  input: DeleteBrunchInput,
  ctx: { readonly db: DbClient },
): Promise<Result<{ brunchId: BrunchId }, DeleteBrunchError>> {
  const hostResult = await assertHostOf(
    { brunchId: input.brunchId, userId: input.requestedById },
    ctx,
  );
  if (hostResult.isErr()) return err(hostResult.error);
  const brunch = hostResult.value;

  if (!DELETABLE_STATUS_CODES.has(brunch.status.code)) {
    return err({ kind: 'not_deletable', statusCode: brunch.status.code });
  }

  try {
    // Conditional on the status read above (a confirm or a bring-back that got there first matches
    // no row), and on not being deleted already.
    const deleted = await ctx.db.brunch.updateMany({
      where: { id: input.brunchId, statusId: brunch.statusId, deletedAt: null },
      data: { deletedAt: input.now ?? new Date(), deletedBy: input.requestedById },
    });
    if (deleted.count === 0) return err({ kind: 'not_deletable', statusCode: brunch.status.code });
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }

  return ok({ brunchId: input.brunchId });
}
