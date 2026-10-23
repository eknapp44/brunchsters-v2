import type { DbClient } from '@brunchsters/database';
import { RATE_LIMIT_POLICIES, type BrunchId, type UserId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import { LookupNotFoundError } from '../errors/LookupNotFoundError';
import { StaleStatusError } from '../errors/StaleStatusError';
import type { EventBus } from '../events/EventBus';
import {
  consumeBudgets,
  type RateLimited,
  type RateLimiterUnavailable,
} from '../rateLimit/consumeBudgets';
import type { RateLimiter } from '../rateLimit/RateLimiter';
import { assertBrunchOpen, type AssertBrunchOpenError } from './guards/assertBrunchOpen';
import { assertHostOf, type AssertHostOfError } from './guards/assertHostOf';
import { assertCanTransition, type InvalidTransitionError } from './guards/brunchTransitions';
import { isPastBrunch } from './presentation/isPastBrunch';

export type CancelBrunchInput = {
  readonly brunchId: BrunchId;
  readonly requestedById: UserId;
  // The moment "already over" is judged at; the clock by default.
  readonly now?: Date;
};

export type CancelBrunchError =
  | AssertHostOfError
  // Already called off: the same answer every other write gets on a called-off brunch.
  | AssertBrunchOpenError
  // A draft (it can only be deleted), or the status changed under the request.
  | InvalidTransitionError
  // A confirmed brunch whose time has passed happened; calling it off would email people about the
  // past.
  | { readonly kind: 'brunch_over' }
  | RateLimited
  | RateLimiterUnavailable
  | { readonly kind: 'lookup_not_found'; readonly code: string }
  | { readonly kind: 'db_error'; readonly cause: unknown };

type CancelBrunchContext = {
  readonly db: DbClient;
  readonly eventBus: EventBus;
  readonly rateLimiter: RateLimiter;
};

// The host calls the brunch off (spec 0013, ADR 0015). Only the status changes: the confirmed
// place and time, votes, invites and attendees are left exactly as they are, so Bring it back
// restores them. Order of checks: host (404 for an outsider, 403 for a member), already called
// off, allowed move (a draft is not cancelled), not over, then the budget, so a refusal for any
// earlier reason costs nothing. The email waits out a hold in the queue; this service only emits.
export async function cancelBrunch(
  input: CancelBrunchInput,
  ctx: CancelBrunchContext,
): Promise<Result<{ brunchId: BrunchId; cancelledAt: Date }, CancelBrunchError>> {
  const { db, eventBus } = ctx;
  const now = input.now ?? new Date();

  const hostResult = await assertHostOf(
    { brunchId: input.brunchId, userId: input.requestedById },
    ctx,
  );
  if (hostResult.isErr()) return err(hostResult.error);
  const brunch = hostResult.value;

  const openResult = assertBrunchOpen(brunch);
  if (openResult.isErr()) return err(openResult.error);

  const transitionResult = assertCanTransition({ from: brunch.status.code, to: 'cancelled' });
  if (transitionResult.isErr()) return err(transitionResult.error);

  let scheduledAt: Date | undefined;
  try {
    const confirmedTime = await db.brunchTime.findFirst({
      where: { brunchId: input.brunchId, isConfirmed: true },
    });
    scheduledAt = confirmedTime?.scheduledAt;
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }
  if (
    isPastBrunch({ statusCode: brunch.status.code, scheduledAt, createdAt: brunch.createdAt }, now)
  ) {
    return err({ kind: 'brunch_over' });
  }

  // The notice emails the people in the brunch, so a cancellation is a unit of the host's day.
  // After the host and state checks: only the host reaches a budget, and a refused cancel is never
  // charged (ADR 0013).
  const spent = await consumeBudgets({
    limiter: ctx.rateLimiter,
    spends: [{ policy: RATE_LIMIT_POLICIES.cancelNoticesPerHost, subject: input.requestedById }],
  });
  if (spent.isErr()) return err(spent.error);

  try {
    await db.$transaction(async (tx) => {
      const cancelledStatus = await tx.brunchStatus.findFirst({ where: { code: 'cancelled' } });
      if (cancelledStatus === null) throw new LookupNotFoundError('BrunchStatus:cancelled');

      // Conditional on the status read above: a confirm (or a second cancel) that got there first
      // matches no row, and this request loses instead of overwriting it.
      const moved = await tx.brunch.updateMany({
        where: { id: input.brunchId, statusId: brunch.statusId },
        data: {
          statusId: cancelledStatus.id,
          statusBeforeCancelId: brunch.statusId,
          cancelledAt: now,
          cancelledBy: input.requestedById,
          // A new cancellation has not been announced yet.
          cancelNoticeSentAt: null,
        },
      });
      if (moved.count === 0) throw new StaleStatusError();
    });
  } catch (cause) {
    if (cause instanceof LookupNotFoundError) {
      return err({ kind: 'lookup_not_found', code: cause.code });
    }
    if (cause instanceof StaleStatusError) {
      return err({ kind: 'invalid_transition', from: brunch.status.code, to: 'cancelled' });
    }
    return err({ kind: 'db_error', cause });
  }

  try {
    await eventBus.emit('brunch/cancelled', {
      brunchId: input.brunchId,
      cancelledAt: now.toISOString(),
    });
  } catch {
    // Side effects must never fail the cancel (Constitution 12).
  }

  return ok({ brunchId: input.brunchId, cancelledAt: now });
}
