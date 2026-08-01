import type { DbClient } from '@brunchsters/database';
import type { BrunchId, InviteSuggestionId, UserId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import type { EventBus } from '../events/EventBus';
import { sendInvites } from './sendInvites';

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
  const { db } = ctx;

  const suggestion = await db.brunchInviteSuggestion.findFirst({
    where: { id: input.suggestionId },
    include: { brunch: true, status: true },
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

  if (input.decision === 'approve') {
    const inviteResult = await sendInvites(
      {
        brunchId: suggestion.brunchId as BrunchId,
        invitedById: suggestion.brunch.hostId as UserId,
        emails: [suggestion.suggestedEmail],
      },
      ctx,
    );
    if (inviteResult.isErr()) return err({ kind: 'db_error', cause: inviteResult.error });
  }

  try {
    await db.brunchInviteSuggestion.update({
      where: { id: input.suggestionId },
      data: { statusId: newStatus.id, reviewedById: input.reviewedById, reviewedAt: new Date() },
    });
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }

  return ok({ suggestionId: input.suggestionId });
}
