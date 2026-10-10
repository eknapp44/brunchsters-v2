import type { DbClient } from '@brunchsters/database';
import type { BrunchId, BrunchTimeId, UserId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import { LastOptionError } from '../errors/LastOptionError';
import type { AssertBrunchActiveError } from './guards/assertBrunchActive';
import { assertBrunchActive } from './guards/assertBrunchActive';
import type { AssertHostOfError } from './guards/assertHostOf';
import { assertHostOf } from './guards/assertHostOf';

export type RemoveTimeInput = {
  readonly brunchId: BrunchId;
  readonly requestedById: UserId;
  readonly timeId: BrunchTimeId;
};

export type RemoveTimeError =
  | AssertHostOfError
  | AssertBrunchActiveError
  | { readonly kind: 'unknown_option' }
  | { readonly kind: 'option_confirmed' }
  | { readonly kind: 'last_option' }
  | { readonly kind: 'db_error'; readonly cause: unknown };

export async function removeTime(
  input: RemoveTimeInput,
  ctx: { readonly db: DbClient },
): Promise<Result<{ id: BrunchTimeId }, RemoveTimeError>> {
  const hostResult = await assertHostOf(
    { brunchId: input.brunchId, userId: input.requestedById },
    ctx,
  );
  if (hostResult.isErr()) return err(hostResult.error);

  const activeResult = assertBrunchActive(hostResult.value);
  if (activeResult.isErr()) return err(activeResult.error);

  // Scoping by brunchId too means an id from another brunch resolves to
  // null here, same as a genuinely unknown id — both are unknown_option.
  const time = await ctx.db.brunchTime.findFirst({
    where: { id: input.timeId, brunchId: input.brunchId },
  });
  if (time === null) return err({ kind: 'unknown_option' });
  if (time.isConfirmed) return err({ kind: 'option_confirmed' });

  try {
    await ctx.db.$transaction(async (tx) => {
      // Lock the Brunch row before the remaining-count check — see
      // removeLocation.ts's identical lock (architect review, F7).
      await tx.$executeRaw`SELECT 1 FROM "Brunch" WHERE id = ${input.brunchId}::uuid FOR UPDATE`;

      // count() bypasses the soft-delete extension (only findMany/findFirst
      // are intercepted), so deletedAt: null must be spelled out here (ADR 0006).
      const remaining = await tx.brunchTime.count({
        where: { brunchId: input.brunchId, deletedAt: null },
      });
      if (remaining <= 1) throw new LastOptionError();

      await tx.brunchTime.update({
        where: { id: input.timeId },
        data: { deletedAt: new Date(), deletedBy: input.requestedById },
      });
    });
  } catch (cause) {
    if (cause instanceof LastOptionError) return err({ kind: 'last_option' });
    return err({ kind: 'db_error', cause });
  }

  return ok({ id: input.timeId });
}
