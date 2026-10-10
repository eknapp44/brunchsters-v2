import type { DbClient } from '@brunchsters/database';
import type { BrunchId, BrunchTimeId, UserId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import type { EventBus } from '../events/EventBus';
import type { AssertCanVoteError } from './guards/assertCanVote';
import { assertCanVote } from './guards/assertCanVote';
import { assertBrunchActive, type AssertBrunchActiveError } from './guards/assertBrunchActive';
import type { HostBrunch } from './guards/assertHostOf';
import { assertVotingOpen, type AssertVotingOpenError } from './guards/assertVotingOpen';
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
  | AssertVotingOpenError
  | { readonly kind: 'not_a_vote' }
  | { readonly kind: 'unknown_option' }
  | { readonly kind: 'db_error'; readonly cause: unknown };

type CastTimeBallotContext = {
  readonly db: DbClient;
  readonly eventBus: EventBus;
};

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

  // Dedupe defensively — see castLocationBallot.ts's identical note: the
  // Zod schema already rejects duplicates at the API boundary, but a
  // duplicate id reaching createMany would throw on the (brunchTimeId,
  // userId) unique index (architect review).
  const optionIds = Array.from(new Set(input.optionIds));

  const canVoteResult = await assertCanVote(
    { brunchId: input.brunchId, userId: input.voterId },
    { db },
  );
  if (canVoteResult.isErr()) return err(canVoteResult.error);

  const mode = await deriveDecisionMode({ brunchId: input.brunchId, kind: 'time' }, { db });
  if (mode === 'host_decides') return err({ kind: 'not_a_vote' });

  // findMany is soft-delete-filtered automatically — unlike count(), which
  // is not (ADR 0006) — so this already excludes removed options.
  const validOptions = await db.brunchTime.findMany({
    where: { brunchId: input.brunchId },
    select: { id: true },
  });
  const validIds = new Set(validOptions.map((o) => o.id));
  const allKnown = optionIds.every((id) => validIds.has(id));
  if (!allKnown) return err({ kind: 'unknown_option' });

  let hadPriorVote = false;
  let votingClosed = false;
  try {
    await db.$transaction(async (tx) => {
      // Lock the Brunch row before reading its status — see
      // castLocationBallot.ts's identical lock for the full rationale: a
      // concurrent closeVoting (a plain UPDATE, no transaction of its own)
      // can otherwise commit in the gap between this transaction's read and
      // its write, letting a vote land after voting has, in real-time
      // terms, already closed. SELECT FOR UPDATE forces the two to
      // serialize.
      await tx.$executeRaw`SELECT 1 FROM "Brunch" WHERE id = ${input.brunchId}::uuid FOR UPDATE`;

      // Re-fetched here, not reused from the pre-transaction brunch lookup
      // above: closure must reflect the latest committed state at write
      // time, not a value read earlier in the request. A close racing a
      // vote must make the vote lose.
      const freshBrunch = await tx.brunch.findFirst({
        where: { id: input.brunchId },
        include: { status: true },
      });
      if (freshBrunch === null || assertVotingOpen(freshBrunch).isErr()) {
        votingClosed = true;
        return;
      }

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
          brunchTimeId: { notIn: [...optionIds] },
        },
      });

      const toInsert = optionIds.filter((id) => !existingIds.has(id));
      if (toInsert.length > 0) {
        await tx.brunchTimeVote.createMany({
          data: toInsert.map((brunchTimeId) => ({ brunchTimeId, userId: input.voterId })),
        });
      }
    });
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }

  if (votingClosed) return err({ kind: 'voting_closed' });

  try {
    await eventBus.emit(hadPriorVote ? 'vote/changed' : 'vote/cast', {
      brunchId: input.brunchId,
      voterId: input.voterId,
      optionIds,
    });
  } catch {
    // Side effects must never fail the vote (Constitution 12).
  }

  return ok({ optionIds });
}
