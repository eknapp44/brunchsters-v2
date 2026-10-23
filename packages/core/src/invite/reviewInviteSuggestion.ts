import type { DbClient } from '@brunchsters/database';
import {
  RATE_LIMIT_POLICIES,
  type BrunchId,
  type InviteSuggestionId,
  type UserId,
} from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { LookupNotFoundError } from '../errors/LookupNotFoundError';
import { StaleStatusError } from '../errors/StaleStatusError';
import type { EventBus } from '../events/EventBus';
import { sendInvitesInTransaction, type InviteSummary } from './sendInvites';
import { assertBrunchOpen, type AssertBrunchOpenError } from '../brunch/guards/assertBrunchOpen';
import type { InvalidTransitionError } from '../brunch/guards/brunchTransitions';
import { isBrunchMember } from '../brunch/guards/isBrunchMember';
import {
  consumeBudgets,
  type RateLimited,
  type RateLimiterUnavailable,
} from '../rateLimit/consumeBudgets';
import type { RateLimiter } from '../rateLimit/RateLimiter';

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
  | AssertBrunchOpenError
  | InvalidTransitionError
  | RateLimited
  | RateLimiterUnavailable
  | { readonly kind: 'lookup_not_found'; readonly code: string }
  | { readonly kind: 'db_error'; readonly cause: unknown };

type ReviewInviteSuggestionContext = {
  readonly db: DbClient;
  readonly eventBus: EventBus;
  readonly rateLimiter: RateLimiter;
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
  if (suggestion.brunch.hostId !== input.reviewedById) {
    // A member may know the suggestion exists; anyone else gets the same answer as for a made-up id.
    const member = await isBrunchMember(
      { brunchId: suggestion.brunchId as BrunchId, userId: input.reviewedById },
      { db },
    );
    return err({ kind: member ? 'not_host' : 'suggestion_not_found' });
  }
  const openResult = assertBrunchOpen(suggestion.brunch);
  if (openResult.isErr()) return err(openResult.error);
  if (suggestion.status.code !== 'pending') return err({ kind: 'already_reviewed' });

  const newStatusCode = input.decision === 'approve' ? 'approved' : 'declined';
  const newStatus = await db.brunchInviteSuggestionStatus.findFirst({
    where: { code: newStatusCode },
  });
  if (newStatus === null) {
    return err({ kind: 'lookup_not_found', code: `BrunchInviteSuggestionStatus:${newStatusCode}` });
  }

  // Approving emails the suggested address, so it spends the same budgets as inviting them directly
  // (otherwise approvals would be a way round the host's daily cap). A decline sends nothing. Spent
  // after the host and pending checks, before anything is written, so a refusal leaves the
  // suggestion pending (ADR 0013).
  if (input.decision === 'approve') {
    const spent = await consumeBudgets({
      limiter: ctx.rateLimiter,
      spends: [
        {
          policy: RATE_LIMIT_POLICIES.inviteEmailsPerBrunch,
          subject: suggestion.brunchId,
          cost: 1,
        },
        {
          policy: RATE_LIMIT_POLICIES.inviteEmailsPerHost,
          subject: input.reviewedById,
          cost: 1,
        },
      ],
    });
    if (spent.isErr()) return err(spent.error);
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
          brunchStatusId: suggestion.brunch.statusId,
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
    if (cause instanceof StaleStatusError) {
      return err({
        kind: 'invalid_transition',
        from: suggestion.brunch.status.code,
        to: 'active',
      });
    }
    return err({ kind: 'db_error', cause });
  }

  for (const invite of createdInvites) {
    try {
      await eventBus.emit('invite/sent', {
        brunchId: suggestion.brunchId as BrunchId,
        inviteId: invite.id,
        invitedEmail: invite.invitedEmail,
      });
    } catch {
      // Side effects must never fail the review (Constitution 12).
    }
  }

  return ok({ suggestionId: input.suggestionId });
}
