import type { DbClient } from '@brunchsters/database';
import type { BrunchId, BrunchTimeId, UserId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import type { EventBus } from '../events/EventBus';
import type { AssertCanVoteError } from './guards/assertCanVote';
import { assertCanVote } from './guards/assertCanVote';
import { assertBrunchActive, type AssertBrunchActiveError } from './guards/assertBrunchActive';
import type { HostBrunch } from './guards/assertHostOf';
import { deriveDecisionMode } from './guards/deriveDecisionMode';

export type CastTimeBallotInput = {
  readonly brunchId: BrunchId;
  readonly voterId: UserId;
  readonly optionIds: readonly BrunchTimeId[];
};

export type CastTimeBallotError =
  | { readonly kind: 'brunch_not_found' }
  | AssertBrunchActiveError
  | { readonly kind: 'empty_ballot' }
  | AssertCanVoteError
  | { readonly kind: 'voting_closed' }
  | { readonly kind: 'not_a_vote' }
  | { readonly kind: 'unknown_option' }
  | { readonly kind: 'db_error'; readonly cause: unknown };

type CastTimeBallotContext = {
  readonly db: DbClient;
  readonly eventBus: EventBus;
};

// Closure here is a placeholder for M4's guards/assertVotingOpen.ts, which
// will also account for an early manual close (votingClosedAt). Until that
// column exists, closed is just "confirmed" or "past the original deadline."
function isVotingClosed(brunch: HostBrunch & { readonly votingDeadline: Date | null }): boolean {
  if (brunch.status.code === 'confirmed') return true;
  return brunch.votingDeadline !== null && new Date() > brunch.votingDeadline;
}

export async function castTimeBallot(
  input: CastTimeBallotInput,
  ctx: CastTimeBallotContext,
): Promise<Result<{ optionIds: readonly BrunchTimeId[] }, CastTimeBallotError>> {
  const { db, eventBus } = ctx;

  const brunch = await db.brunch.findFirst({
    where: { id: input.brunchId },
    include: { status: true },
  });
  if (brunch === null) return err({ kind: 'brunch_not_found' });

  const activeResult = assertBrunchActive(brunch as HostBrunch);
  if (activeResult.isErr()) return err(activeResult.error);

  if (input.optionIds.length === 0) return err({ kind: 'empty_ballot' });

  const canVoteResult = await assertCanVote(
    { brunchId: input.brunchId, userId: input.voterId },
    { db },
  );
  if (canVoteResult.isErr()) return err(canVoteResult.error);

  if (isVotingClosed(brunch)) return err({ kind: 'voting_closed' });

  const mode = await deriveDecisionMode({ brunchId: input.brunchId, kind: 'time' }, { db });
  if (mode === 'host_decides') return err({ kind: 'not_a_vote' });

  // findMany is soft-delete-filtered automatically — unlike count(), which
  // is not (ADR 0006) — so this already excludes removed options.
  const validOptions = await db.brunchTime.findMany({
    where: { brunchId: input.brunchId },
    select: { id: true },
  });
  const validIds = new Set(validOptions.map((o) => o.id));
  const allKnown = input.optionIds.every((id) => validIds.has(id));
  if (!allKnown) return err({ kind: 'unknown_option' });

  let hadPriorVote = false;
  try {
    await db.$transaction(async (tx) => {
      const existingVotes = await tx.brunchTimeVote.findMany({
        where: { userId: input.voterId, brunchTime: { brunchId: input.brunchId } },
        select: { brunchTimeId: true },
      });
      const existingIds = new Set(existingVotes.map((v) => v.brunchTimeId));
      hadPriorVote = existingIds.size > 0;

      // Scoped by the brunchTime relation, not by validIds — this also
      // cleans up any orphaned vote left on a since-removed option, which
      // is exactly "replace the voter's entire set" (spec 0005).
      await tx.brunchTimeVote.deleteMany({
        where: {
          userId: input.voterId,
          brunchTime: { brunchId: input.brunchId },
          brunchTimeId: { notIn: [...input.optionIds] },
        },
      });

      const toInsert = input.optionIds.filter((id) => !existingIds.has(id));
      if (toInsert.length > 0) {
        await tx.brunchTimeVote.createMany({
          data: toInsert.map((brunchTimeId) => ({ brunchTimeId, userId: input.voterId })),
        });
      }
    });
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }

  try {
    await eventBus.emit(hadPriorVote ? 'vote/changed' : 'vote/cast', {
      brunchId: input.brunchId,
      voterId: input.voterId,
      optionIds: input.optionIds,
    });
  } catch {
    // Side effects must never fail the vote (Constitution 12).
  }

  return ok({ optionIds: input.optionIds });
}
