import { isUniqueConstraintError, type DbClient } from '@brunchsters/database';
import type { BrunchId, BrunchLocationSuggestionId, UserId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { addLocationInTransaction } from './addLocation';
import { assertBrunchActive, type AssertBrunchActiveError } from './guards/assertBrunchActive';
import { assertVotingOpen, type AssertVotingOpenError } from './guards/assertVotingOpen';

export const reviewLocationSuggestionRequestSchema = z.object({
  decision: z.enum(['approve', 'decline']),
});

export type ReviewLocationSuggestionRequest = z.infer<typeof reviewLocationSuggestionRequestSchema>;

export type ReviewLocationSuggestionInput = ReviewLocationSuggestionRequest & {
  readonly suggestionId: BrunchLocationSuggestionId;
  readonly reviewedById: UserId;
};

export type ReviewLocationSuggestionError =
  | { readonly kind: 'suggestion_not_found' }
  | { readonly kind: 'not_host' }
  | AssertBrunchActiveError
  | AssertVotingOpenError
  | { readonly kind: 'already_reviewed' }
  | { readonly kind: 'already_added' }
  | { readonly kind: 'lookup_not_found'; readonly code: string }
  | { readonly kind: 'db_error'; readonly cause: unknown };

export async function reviewLocationSuggestion(
  input: ReviewLocationSuggestionInput,
  ctx: { readonly db: DbClient },
): Promise<Result<{ suggestionId: BrunchLocationSuggestionId }, ReviewLocationSuggestionError>> {
  const { db } = ctx;

  const suggestion = await db.brunchLocationSuggestion.findFirst({
    where: { id: input.suggestionId },
    include: { brunch: { include: { status: true } }, status: true },
  });
  if (suggestion === null) return err({ kind: 'suggestion_not_found' });
  if (suggestion.brunch.hostId !== input.reviewedById) return err({ kind: 'not_host' });

  // A suggestion can sit pending from before the brunch was confirmed (or
  // cancelled) — without this, approving it after the fact would silently
  // add a brand-new, never-voted-on option to a brunch that's supposed to be
  // locked, with no way to remove it afterward (removeLocation/removeTime
  // require active too). Declining a stale suggestion is equally blocked —
  // there's no reason to review anything once the brunch itself is settled.
  const activeResult = assertBrunchActive(suggestion.brunch);
  if (activeResult.isErr()) return err(activeResult.error);

  if (suggestion.status.code !== 'pending') return err({ kind: 'already_reviewed' });

  // Only approving creates a new live option — declining a stale suggestion
  // is still fine to let through even while voting's closed, it just
  // dismisses a pending row rather than growing the ballot (architect
  // review, F6; see addLocation.ts's identical check for the full reason).
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
        // Same create logic addLocation uses, run in the same transaction as
        // the status update below — so a real location can never get
        // created while the suggestion is left stuck at 'pending' (or vice
        // versa) if one write succeeds and the other fails.
        await addLocationInTransaction(tx, {
          brunchId: suggestion.brunchId as BrunchId,
          // "Adding a location" is a host action even when it originates
          // from a suggestion — same precedent as reviewInviteSuggestion
          // attributing the resulting invite to the host, not the suggester.
          proposedById: suggestion.brunch.hostId as UserId,
          location: {
            placeId: suggestion.placeId,
            placeName: suggestion.placeName,
            placeAddress: suggestion.placeAddress,
            placeUrl: suggestion.placeUrl,
            timezone: suggestion.timezone,
          },
        });
      }

      await tx.brunchLocationSuggestion.update({
        where: { id: input.suggestionId },
        data: { statusId: newStatus.id, reviewedById: input.reviewedById, reviewedAt: new Date() },
      });
    });
  } catch (cause) {
    // The host may have added this exact place directly (OptionManager)
    // while the suggestion was still pending — the partial unique index
    // catches it here, approval-time, since suggestLocation's own check
    // only runs at suggestion-time.
    if (isUniqueConstraintError(cause)) return err({ kind: 'already_added' });
    return err({ kind: 'db_error', cause });
  }

  return ok({ suggestionId: input.suggestionId });
}
