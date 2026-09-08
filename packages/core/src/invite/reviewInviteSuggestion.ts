import type { DbClient } from '@brunchsters/database';
import type { BrunchId, InviteSuggestionId, UserId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { LookupNotFoundError } from '../errors/LookupNotFoundError';
import type { EventBus } from '../events/EventBus';
import { sendInvitesInTransaction, type InviteSummary } from './sendInvites';

export const reviewInviteSuggestionRequestSchema = z.object({
  decision: z.enum(['approve', 'decline']),
});

export type ReviewInviteSuggestionRequest = z.infer<typeof reviewInviteSuggestionRequestSchema>;

export type ReviewInviteSuggestionInput = ReviewInviteSuggestionRequest & {
  readonly suggestionId: InviteSuggestionId;
  readonly reviewedById: UserId;
};

export type ReviewInviteSuggestionError =
  | { readonly kind: 'suggestion_not_found' }
  | { readonly kind: 'not_host' }
  | { readonly kind: 'already_reviewed' }
  | { readonly kind: 'lookup_not_found'; readonly code: string }
  | { readonly kind: 'db_error'; readonly cause: unknown };

type ReviewInviteSuggestionContext = {
  readonly db: DbClient;
  readonly eventBus: EventBus;
};

export async function reviewInviteSuggestion(
  input: ReviewInviteSuggestionInput,
  ctx: ReviewInviteSuggestionContext,
): Promise<Result<{ suggestionId: InviteSuggestionId }, ReviewInviteSuggestionError>> {
  const { db, eventBus } = ctx;

  const suggestion = await db.brunchInviteSuggestion.findFirst({
    where: { id: input.suggestionId },
    include: { brunch: { include: { status: true } }, status: true },
  });
  if (suggestion === null) return err({ kind: 'suggestion_not_found' });
  if (suggestion.brunch.hostId !== input.reviewedById) return err({ kind: 'not_host' });
  if (suggestion.status.code !== 'pending') return err({ kind: 'already_reviewed' });

  const newStatusCode = input.decision === 'approve' ? 'approved' : 'declined';
  const newStatus = await db.brunchInviteSuggestionStatus.findFirst({
    where: { code: newStatusCode },
  });
  if (newStatus === null) {
    return err({ kind: 'lookup_not_found', code: `BrunchInviteSuggestionStatus:${newStatusCode}` });
  }

  let createdInvites: readonly InviteSummary[] = [];
  try {
    await db.$transaction(async (tx) => {
      if (input.decision === 'approve') {
        // Same create-or-revive logic sendInvites uses, run in the same
        // transaction as the status update below — so a real invite can
        // never get created while the suggestion is left stuck at 'pending'
        // (or vice versa) if one write succeeds and the other fails.
        createdInvites = await sendInvitesInTransaction(tx, {
          brunchId: suggestion.brunchId as BrunchId,
          invitedById: suggestion.brunch.hostId as UserId,
          emails: [suggestion.suggestedEmail],
          brunchStatusCode: suggestion.brunch.status.code,
        });
      }

      await tx.brunchInviteSuggestion.update({
        where: { id: input.suggestionId },
        data: { statusId: newStatus.id, reviewedById: input.reviewedById, reviewedAt: new Date() },
      });
    });
  } catch (cause) {
    if (cause instanceof LookupNotFoundError) {
      return err({ kind: 'lookup_not_found', code: cause.code });
    }
    return err({ kind: 'db_error', cause });
  }

  for (const invite of createdInvites) {
    try {
      await eventBus.emit('invite/sent', {
        brunchId: suggestion.brunchId,
        inviteId: invite.id,
        invitedEmail: invite.invitedEmail,
      });
    } catch {
      // Side effects must never fail the review (Constitution 12).
    }
  }

  return ok({ suggestionId: input.suggestionId });
}
