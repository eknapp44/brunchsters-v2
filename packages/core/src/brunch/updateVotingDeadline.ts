import type { DbClient } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { assertBrunchOpen, type AssertBrunchOpenError } from './guards/assertBrunchOpen';
import { assertHostOf, type AssertHostOfError } from './guards/assertHostOf';

export const updateVotingDeadlineRequestSchema = z.object({
  votingDeadline: z.iso
    .datetime()
    .refine((iso) => new Date(iso) > new Date(), {
      message: 'votingDeadline must be in the future',
    })
    .nullable(),
});

export type UpdateVotingDeadlineRequest = z.infer<typeof updateVotingDeadlineRequestSchema>;

export type UpdateVotingDeadlineInput = {
  readonly brunchId: BrunchId;
  readonly requestedById: UserId;
  // undefined clears the deadline — null is for the JSON boundary only
  // (the route maps its nullable body field to this before calling in).
  readonly votingDeadline: string | undefined;
  // The moment recorded as "when the deadline was set"; the clock by default.
  readonly now?: Date;
};

export type UpdateVotingDeadlineError =
  | AssertHostOfError
  | AssertBrunchOpenError
  | { readonly kind: 'already_closed' }
  | { readonly kind: 'db_error'; readonly cause: unknown };

export async function updateVotingDeadline(
  input: UpdateVotingDeadlineInput,
  ctx: { readonly db: DbClient },
): Promise<Result<{ votingDeadline: Date | undefined }, UpdateVotingDeadlineError>> {
  const hostResult = await assertHostOf(
    { brunchId: input.brunchId, userId: input.requestedById },
    ctx,
  );
  if (hostResult.isErr()) return err(hostResult.error);

  const openResult = assertBrunchOpen(hostResult.value);
  if (openResult.isErr()) return err(openResult.error);

  // Deliberately narrower than isVotingClosed: that also factors in the
  // current votingDeadline, which is exactly the field being changed here.
  // A host extending a deadline that merely lapsed must be allowed — it's
  // an accident nobody acted on, not a decision — so only a genuine, standing
  // lock (an early manual close, or the brunch already confirmed) blocks
  // this (architect review, F6).
  const manuallyClosedOrConfirmed =
    hostResult.value.votingClosedAt !== null || hostResult.value.status.code === 'confirmed';
  if (manuallyClosedOrConfirmed) return err({ kind: 'already_closed' });

  const votingDeadline = input.votingDeadline !== undefined ? new Date(input.votingDeadline) : null;
  try {
    await ctx.db.brunch.update({
      where: { id: input.brunchId },
      // votingDeadlineSetAt lets the reminder job tell a deadline set inside its 24-hour window
      // (no reminder) from one set long before (spec 0015).
      data: {
        votingDeadline,
        votingDeadlineSetAt: votingDeadline === null ? null : (input.now ?? new Date()),
      },
    });
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }

  return ok({ votingDeadline: votingDeadline ?? undefined });
}
