import type { Brunch, DbClient } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';

// Includes status so callers (assertBrunchActive, assertVotingOpen in M4)
// don't have to re-query it.
export type HostBrunch = Brunch & { readonly status: { readonly code: string } };

export type AssertHostOfError =
  | { readonly kind: 'brunch_not_found' }
  | { readonly kind: 'not_host' };

type AssertHostOfInput = {
  readonly brunchId: BrunchId;
  readonly userId: UserId;
};

// Shared precondition for every host-only brunch operation in spec 0005:
// the brunch must exist and the caller must be its host.
export async function assertHostOf(
  input: AssertHostOfInput,
  ctx: { readonly db: DbClient },
): Promise<Result<HostBrunch, AssertHostOfError>> {
  const brunch = await ctx.db.brunch.findFirst({
    where: { id: input.brunchId },
    include: { status: true },
  });
  if (brunch === null) return err({ kind: 'brunch_not_found' });
  if (brunch.hostId !== input.userId) return err({ kind: 'not_host' });

  return ok(brunch);
}
