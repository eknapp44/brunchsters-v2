import type { DbClient } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';

export type SetBrunchHiddenInput = {
  readonly brunchId: BrunchId;
  readonly viewerId: UserId;
  readonly hidden: boolean;
  // The moment recorded when hiding; the clock by default.
  readonly now?: Date;
};

export type SetBrunchHiddenError =
  | { readonly kind: 'brunch_not_found' }
  | { readonly kind: 'db_error'; readonly cause: unknown };

// "Hide from my dashboard" (spec 0013, ADR 0015): a fact about one person's dashboard, stored on
// their own attendee row (the host has one). It never touches the brunch, so nobody else sees a
// change and nobody is told. Allowed in every status, including a called-off brunch, so it skips
// `assertBrunchOpen` on purpose. A person who is not in the brunch, or a deleted brunch, gets the
// same answer as for a made-up id. Idempotent: hiding twice keeps the first time.
export async function setBrunchHidden(
  input: SetBrunchHiddenInput,
  ctx: { readonly db: DbClient },
): Promise<Result<{ hidden: boolean }, SetBrunchHiddenError>> {
  try {
    const attendee = await ctx.db.brunchAttendee.findFirst({
      // The soft-delete extension filters only this model; the brunch needs its own check.
      where: { brunchId: input.brunchId, userId: input.viewerId, brunch: { deletedAt: null } },
    });
    if (attendee === null) return err({ kind: 'brunch_not_found' });

    const alreadyHidden = attendee.hiddenAt !== null;
    if (alreadyHidden !== input.hidden) {
      await ctx.db.brunchAttendee.update({
        where: { id: attendee.id },
        data: { hiddenAt: input.hidden ? (input.now ?? new Date()) : null },
      });
    }
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }

  return ok({ hidden: input.hidden });
}
