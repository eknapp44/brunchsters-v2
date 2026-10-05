import type { DbClient } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { assertHostOf, type AssertHostOfError } from './guards/assertHostOf';
import { isVotingClosed } from './guards/assertVotingOpen';

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
};

export type UpdateVotingDeadlineError =
  | AssertHostOfError
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

  if (isVotingClosed(hostResult.value)) return err({ kind: 'already_closed' });

  const votingDeadline = input.votingDeadline !== undefined ? new Date(input.votingDeadline) : null;
  try {
    await ctx.db.brunch.update({
      where: { id: input.brunchId },
      data: { votingDeadline },
    });
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }

  return ok({ votingDeadline: votingDeadline ?? undefined });
}
