import type { DbClient } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import { assertHostOf, type AssertHostOfError } from './guards/assertHostOf';
import { isVotingClosed } from './guards/assertVotingOpen';

export type CloseVotingInput = {
  readonly brunchId: BrunchId;
  readonly requestedById: UserId;
};

export type CloseVotingError =
  | AssertHostOfError
  | { readonly kind: 'already_closed' }
  | { readonly kind: 'db_error'; readonly cause: unknown };

export async function closeVoting(
  input: CloseVotingInput,
  ctx: { readonly db: DbClient },
): Promise<Result<{ votingClosedAt: Date }, CloseVotingError>> {
  const hostResult = await assertHostOf(
    { brunchId: input.brunchId, userId: input.requestedById },
    ctx,
  );
  if (hostResult.isErr()) return err(hostResult.error);

  // Reuses the full derived predicate, not just votingClosedAt directly —
  // a brunch already closed by a past deadline (nobody clicked close) is
  // still already_closed, not a fresh close.
  if (isVotingClosed(hostResult.value)) return err({ kind: 'already_closed' });

  const votingClosedAt = new Date();
  try {
    await ctx.db.brunch.update({
      where: { id: input.brunchId },
      data: { votingClosedAt },
    });
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }

  return ok({ votingClosedAt });
}
