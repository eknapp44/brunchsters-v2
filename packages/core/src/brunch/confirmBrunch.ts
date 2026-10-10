import { isUniqueConstraintError, type DbClient } from '@brunchsters/database';
import type { BrunchId, BrunchLocationId, BrunchTimeId, UserId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import type { EventBus } from '../events/EventBus';
import { LookupNotFoundError } from '../errors/LookupNotFoundError';
import { assertBrunchActive, type AssertBrunchActiveError } from './guards/assertBrunchActive';
import { assertHostOf, type AssertHostOfError } from './guards/assertHostOf';

const INVITE_EXPIRY_AFTER_CONFIRM_DAYS = 7;

export type ConfirmBrunchInput = {
  readonly brunchId: BrunchId;
  readonly requestedById: UserId;
  readonly locationId: BrunchLocationId;
  readonly timeId: BrunchTimeId;
};

export type ConfirmBrunchError =
  | AssertHostOfError
  | AssertBrunchActiveError
  | { readonly kind: 'no_locations' }
  | { readonly kind: 'no_times' }
  | { readonly kind: 'unknown_option' }
  | { readonly kind: 'lookup_not_found'; readonly code: string }
  | { readonly kind: 'db_error'; readonly cause: unknown };

type ConfirmBrunchContext = {
  readonly db: DbClient;
  readonly eventBus: EventBus;
};

export async function confirmBrunch(
  input: ConfirmBrunchInput,
  ctx: ConfirmBrunchContext,
): Promise<Result<{ brunchId: BrunchId }, ConfirmBrunchError>> {
  const { db, eventBus } = ctx;

  const hostResult = await assertHostOf(
    { brunchId: input.brunchId, userId: input.requestedById },
    ctx,
  );
  if (hostResult.isErr()) return err(hostResult.error);
  const brunch = hostResult.value;

  const activeResult = assertBrunchActive(brunch);
  if (activeResult.isErr()) return err(activeResult.error);

  // findMany is soft-delete-filtered automatically (ADR 0006) — these
  // already exclude removed options.
  const [locations, times] = await Promise.all([
    db.brunchLocation.findMany({
      where: { brunchId: input.brunchId },
      include: { votes: true },
    }),
    db.brunchTime.findMany({
      where: { brunchId: input.brunchId },
      include: { votes: true },
    }),
  ]);

  if (locations.length === 0) return err({ kind: 'no_locations' });
  if (times.length === 0) return err({ kind: 'no_times' });

  const chosenLocation = locations.find((location) => location.id === input.locationId);
  const chosenTime = times.find((time) => time.id === input.timeId);
  if (chosenLocation === undefined || chosenTime === undefined) {
    return err({ kind: 'unknown_option' });
  }

  // The host may confirm any option, not just the winner — ties are the
  // normal outcome under approval voting (spec 0005). "Was the vote leader"
  // is recorded for the event, not enforced as a precondition.
  const maxLocationVotes = Math.max(...locations.map((location) => location.votes.length));
  const maxTimeVotes = Math.max(...times.map((time) => time.votes.length));
  const locationWasVoteLeader = chosenLocation.votes.length === maxLocationVotes;
  const timeWasVoteLeader = chosenTime.votes.length === maxTimeVotes;

  const now = new Date();
  // Floored at now — nothing stops the host from confirming a candidate
  // time that's already passed (addTime only validates futureness at
  // creation, not at confirm time), and scheduledAt + 7 days could still
  // land in the past for anything more than a week stale. That would quietly
  // expire every outstanding invite on a brunch that was just confirmed
  // (architect review, F8). A brunch happening tonight shouldn't invalidate
  // links either, so the floor is "at least 7 days from now", not "exactly".
  const tokenExpiresAt = new Date(
    Math.max(chosenTime.scheduledAt.getTime(), now.getTime()) +
      INVITE_EXPIRY_AFTER_CONFIRM_DAYS * 24 * 60 * 60 * 1000,
  );

  try {
    await db.$transaction(async (tx) => {
      const confirmedStatus = await tx.brunchStatus.findFirst({ where: { code: 'confirmed' } });
      if (confirmedStatus === null) throw new LookupNotFoundError('BrunchStatus:confirmed');

      const host = await tx.user.findFirst({ where: { id: brunch.hostId } });
      if (host === null) throw new LookupNotFoundError(`User:${brunch.hostId}`);

      await tx.brunchLocation.update({
        where: { id: input.locationId },
        data: { isConfirmed: true, confirmedAt: now },
      });
      await tx.brunchTime.update({
        where: { id: input.timeId },
        data: { isConfirmed: true, confirmedAt: now },
      });
      await tx.brunch.update({
        where: { id: input.brunchId },
        data: {
          statusId: confirmedStatus.id,
          votingClosedAt: brunch.votingClosedAt ?? now,
        },
      });

      // Spec 0004's deferred hook: tokens were born at a flat 30-day expiry
      // because nothing had confirmed a time yet. The host's own synthetic
      // invite is excluded (same identification as getInvitesForBrunch) —
      // it was deliberately born expired and never needs to be usable.
      await tx.brunchInvite.updateMany({
        where: {
          brunchId: input.brunchId,
          deletedAt: null,
          NOT: { invitedEmail: { equals: host.email, mode: 'insensitive' } },
        },
        data: { tokenExpiresAt },
      });
    });
  } catch (cause) {
    if (cause instanceof LookupNotFoundError) {
      return err({ kind: 'lookup_not_found', code: cause.code });
    }
    // Two concurrent confirms on the same brunch: the partial unique index
    // (one confirmed, non-deleted location/time per brunch) is what
    // actually prevents both from landing, not a re-fetch-inside-transaction
    // check — see confirmBrunch.integration.test.ts's concurrent-confirm
    // test. The loser hits this collision; brunch_not_active is a more
    // honest answer than a generic db_error, since the brunch genuinely
    // isn't active anymore by the time this transaction's write landed
    // (architect review, F12).
    if (isUniqueConstraintError(cause)) return err({ kind: 'brunch_not_active' });
    return err({ kind: 'db_error', cause });
  }

  try {
    await eventBus.emit('brunch/confirmed', {
      brunchId: input.brunchId,
      locationId: input.locationId,
      timeId: input.timeId,
      locationWasVoteLeader,
      timeWasVoteLeader,
    });
  } catch {
    // Side effects must never fail the confirm (Constitution 12).
  }

  return ok({ brunchId: input.brunchId });
}
