import type { DbClient } from '@brunchsters/database';
import type { BrunchId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';

// Records that the called-off notice for THIS cancellation went out, so the back-on email knows
// there is something to correct and a replayed event does not announce it twice. Conditional on
// the cancellation still being the one announced and not yet marked: if the host brought the
// brunch back and called it off again meanwhile, `cancelledAt` has moved on and this marks
// nothing (`marked: false`), because that newer cancellation has its own notice still to come.
export async function markCancelNoticeSent(
  input: {
    readonly brunchId: BrunchId;
    readonly cancelledAt: Date;
    // The moment recorded; the clock by default.
    readonly now?: Date;
  },
  ctx: { readonly db: DbClient },
): Promise<
  Result<{ readonly marked: boolean }, { readonly kind: 'db_error'; readonly cause: unknown }>
> {
  try {
    const result = await ctx.db.brunch.updateMany({
      where: { id: input.brunchId, cancelledAt: input.cancelledAt, cancelNoticeSentAt: null },
      data: { cancelNoticeSentAt: input.now ?? new Date() },
    });
    return ok({ marked: result.count > 0 });
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }
}
