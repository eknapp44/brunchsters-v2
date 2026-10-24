import { isUniqueConstraintError, type DbClient } from '@brunchsters/database';
import type { BrunchId, BrunchTimeSuggestionId, UserId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { addTimeInTransaction } from './addTime';
import { assertBrunchActive, type AssertBrunchActiveError } from './guards/assertBrunchActive';
import { assertVotingOpen, type AssertVotingOpenError } from './guards/assertVotingOpen';
import { isBrunchMember } from './guards/isBrunchMember';

export const reviewTimeSuggestionRequestSchema = z.object({
  decision: z.enum(['approve', 'decline']),
});

export type ReviewTimeSuggestionRequest = z.infer<typeof reviewTimeSuggestionRequestSchema>;

export type ReviewTimeSuggestionInput = ReviewTimeSuggestionRequest & {
  readonly suggestionId: BrunchTimeSuggestionId;
  readonly reviewedById: UserId;
};

export type ReviewTimeSuggestionError =
  | { readonly kind: 'suggestion_not_found' }
  | { readonly kind: 'not_host' }
  | AssertBrunchActiveError
  | AssertVotingOpenError
  | { readonly kind: 'already_reviewed' }
  | { readonly kind: 'already_added' }
  | { readonly kind: 'lookup_not_found'; readonly code: string }
  | { readonly kind: 'db_error'; readonly cause: unknown };

export async function reviewTimeSuggestion(
  input: ReviewTimeSuggestionInput,
  ctx: { readonly db: DbClient },
): Promise<Result<{ suggestionId: BrunchTimeSuggestionId }, ReviewTimeSuggestionError>> {
  const { db } = ctx;

  const suggestion = await db.brunchTimeSuggestion.findFirst({
    // A deleted brunch's suggestions are gone with it (the extension filters only this model).
    where: { id: input.suggestionId, brunch: { deletedAt: null } },
    include: { brunch: { include: { status: true } }, status: true },
  });
  if (suggestion === null) return err({ kind: 'suggestion_not_found' });
  if (suggestion.brunch.hostId !== input.reviewedById) {
    // A member may know the suggestion exists; anyone else gets the same answer as for a made-up id.
    const member = await isBrunchMember(
      { brunchId: suggestion.brunchId as BrunchId, userId: input.reviewedById },
      { db },
    );
    return err({ kind: member ? 'not_host' : 'suggestion_not_found' });
  }

  // See reviewLocationSuggestion.ts's identical check for why this matters:
  // a stale pending suggestion can otherwise be approved after the brunch is
  // confirmed, with no way to remove the resulting option afterward.
  const activeResult = assertBrunchActive(suggestion.brunch);
  if (activeResult.isErr()) return err(activeResult.error);

  if (suggestion.status.code !== 'pending') return err({ kind: 'already_reviewed' });

  // See reviewLocationSuggestion.ts's identical check — only approving
  // creates a new live option, so only approving needs voting still open.
  if (input.decision === 'approve') {
    const votingOpenResult = assertVotingOpen(suggestion.brunch);
    if (votingOpenResult.isErr()) return err(votingOpenResult.error);
  }

  const newStatusCode = input.decision === 'approve' ? 'approved' : 'declined';
  const newStatus = await db.brunchOptionSuggestionStatus.findFirst({
    where: { code: newStatusCode },
  });
  if (newStatus === null) {
    return err({ kind: 'lookup_not_found', code: `BrunchOptionSuggestionStatus:${newStatusCode}` });
  }

  try {
    await db.$transaction(async (tx) => {
      if (input.decision === 'approve') {
        // Same create logic addTime uses, run in the same transaction as the
        // status update below — so a real time can never get created while
        // the suggestion is left stuck at 'pending' (or vice versa) if one
        // write succeeds and the other fails.
        await addTimeInTransaction(tx, {
          brunchId: suggestion.brunchId as BrunchId,
          // "Adding a time" is a host action even when it originates from a
          // suggestion — same precedent as reviewInviteSuggestion
          // attributing the resulting invite to the host, not the suggester.
          proposedById: suggestion.brunch.hostId as UserId,
          scheduledAt: suggestion.scheduledAt.toISOString(),
        });
      }

      await tx.brunchTimeSuggestion.update({
        where: { id: input.suggestionId },
        data: { statusId: newStatus.id, reviewedById: input.reviewedById, reviewedAt: new Date() },
      });
    });
  } catch (cause) {
    // See reviewLocationSuggestion.ts's identical check — the host may have
    // added this exact time directly while the suggestion was still pending.
    if (isUniqueConstraintError(cause)) return err({ kind: 'already_added' });
    return err({ kind: 'db_error', cause });
  }

  return ok({ suggestionId: input.suggestionId });
}
