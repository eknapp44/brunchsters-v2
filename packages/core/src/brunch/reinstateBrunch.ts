import type { DbClient } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import { StaleStatusError } from '../errors/StaleStatusError';
import type { EventBus } from '../events/EventBus';
import { assertHostOf, type AssertHostOfError } from './guards/assertHostOf';
import { assertCanTransition, type InvalidTransitionError } from './guards/brunchTransitions';

export type ReinstateBrunchInput = {
  readonly brunchId: BrunchId;
  readonly requestedById: UserId;
};

export type ReinstateBrunchError =
  | AssertHostOfError
  // The brunch is not called off.
  | { readonly kind: 'not_called_off' }
  // Called off by something other than cancelBrunch, so there is no status to go back to.
  | { readonly kind: 'nothing_to_restore' }
  | InvalidTransitionError
  | { readonly kind: 'db_error'; readonly cause: unknown };

// "Bring it back" (spec 0013, ADR 0015): the status returns to what it was before the brunch was
// called off. Nothing else was touched by the cancel, so nothing else needs restoring. The cancel
// bookkeeping (`cancelledAt`, `cancelNoticeSentAt`) is left as it is on purpose: the "back on" email
// reads it to know whether anyone was told, and the next cancel overwrites it.
//
// Not guarded by `assertBrunchOpen`: it is the one write that is only allowed on a called-off
// brunch. Free of any budget: it can only follow a cancel, which was paid for.
export async function reinstateBrunch(
  input: ReinstateBrunchInput,
  ctx: { readonly db: DbClient; readonly eventBus: EventBus },
): Promise<Result<{ brunchId: BrunchId }, ReinstateBrunchError>> {
  const { db, eventBus } = ctx;

  const hostResult = await assertHostOf(
    { brunchId: input.brunchId, userId: input.requestedById },
    ctx,
  );
  if (hostResult.isErr()) return err(hostResult.error);
  const brunch = hostResult.value;

  if (brunch.status.code !== 'cancelled') return err({ kind: 'not_called_off' });
  if (brunch.statusBeforeCancelId === null) return err({ kind: 'nothing_to_restore' });

  let restoredCode: string;
  try {
    const restored = await db.brunchStatus.findFirst({
      where: { id: brunch.statusBeforeCancelId },
    });
    if (restored === null) return err({ kind: 'nothing_to_restore' });
    restoredCode = restored.code;
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }

  const transitionResult = assertCanTransition({ from: 'cancelled', to: restoredCode });
  if (transitionResult.isErr()) return err(transitionResult.error);

  try {
    await db.$transaction(async (tx) => {
      // Conditional on still being called off: two clicks, or a delete, cannot both win.
      const moved = await tx.brunch.updateMany({
        where: { id: input.brunchId, statusId: brunch.statusId },
        data: { statusId: brunch.statusBeforeCancelId as string },
      });
      if (moved.count === 0) throw new StaleStatusError();
    });
  } catch (cause) {
    if (cause instanceof StaleStatusError) {
      return err({ kind: 'invalid_transition', from: 'cancelled', to: restoredCode });
    }
    return err({ kind: 'db_error', cause });
  }

  try {
    await eventBus.emit('brunch/reinstated', { brunchId: input.brunchId });
  } catch {
    // Side effects must never fail the reinstate (Constitution 12).
  }

  return ok({ brunchId: input.brunchId });
}
