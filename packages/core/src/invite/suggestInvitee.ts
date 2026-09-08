import type { DbClient } from '@brunchsters/database';
import type { BrunchId, InviteSuggestionId, UserId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import type { EventBus } from '../events/EventBus';
import { reviewInviteSuggestion } from './reviewInviteSuggestion';

export const suggestInviteeRequestSchema = z.object({
  email: z.email(),
});

export type SuggestInviteeRequest = z.infer<typeof suggestInviteeRequestSchema>;

export type SuggestInviteeInput = SuggestInviteeRequest & {
  readonly brunchId: BrunchId;
  readonly suggestedById: UserId;
};

export type SuggestInviteeResult = {
  readonly suggestionId: InviteSuggestionId;
  readonly status: 'pending' | 'approved';
};

export type SuggestInviteeError =
  | { readonly kind: 'brunch_not_found' }
  | { readonly kind: 'suggestions_disabled' }
  | { readonly kind: 'not_attendee' }
  | { readonly kind: 'cannot_suggest_host' }
  | { readonly kind: 'already_suggested' }
  | { readonly kind: 'lookup_not_found'; readonly code: string }
  | { readonly kind: 'db_error'; readonly cause: unknown };

type SuggestInviteeContext = {
  readonly db: DbClient;
  readonly eventBus: EventBus;
};

export async function suggestInvitee(
  input: SuggestInviteeInput,
  ctx: SuggestInviteeContext,
): Promise<Result<SuggestInviteeResult, SuggestInviteeError>> {
  const { db } = ctx;

  const brunch = await db.brunch.findFirst({
    where: { id: input.brunchId },
    include: { host: true },
  });
  if (brunch === null) return err({ kind: 'brunch_not_found' });
  if (!brunch.allowInviteSuggestions) return err({ kind: 'suggestions_disabled' });
  if (input.email.toLowerCase() === brunch.host.email.toLowerCase()) {
    return err({ kind: 'cannot_suggest_host' });
  }

  const isHost = brunch.hostId === input.suggestedById;
  if (!isHost) {
    const attendee = await db.brunchAttendee.findFirst({
      where: { brunchId: input.brunchId, userId: input.suggestedById },
    });
    if (attendee === null) return err({ kind: 'not_attendee' });
  }

  // No soft-delete field on this model — findUnique/findFirst behave the same here.
  const existing = await db.brunchInviteSuggestion.findUnique({
    where: { brunchId_suggestedEmail: { brunchId: input.brunchId, suggestedEmail: input.email } },
  });
  if (existing !== null) return err({ kind: 'already_suggested' });

  const pendingStatus = await db.brunchInviteSuggestionStatus.findFirst({
    where: { code: 'pending' },
  });
  if (pendingStatus === null) {
    return err({ kind: 'lookup_not_found', code: 'BrunchInviteSuggestionStatus:pending' });
  }

  const suggestedUser = await db.user.findFirst({ where: { email: input.email } });

  let suggestionId: InviteSuggestionId;
  try {
    const created = await db.brunchInviteSuggestion.create({
      data: {
        brunchId: input.brunchId,
        suggestedById: input.suggestedById,
        suggestedEmail: input.email,
        suggestedUserId: suggestedUser?.id ?? null,
        statusId: pendingStatus.id,
      },
    });
    suggestionId = created.id as InviteSuggestionId;
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }

  if (!brunch.requireHostApprovalToInvite) {
    const reviewResult = await reviewInviteSuggestion(
      { suggestionId, reviewedById: brunch.hostId as UserId, decision: 'approve' },
      ctx,
    );
    if (reviewResult.isOk()) {
      return ok({ suggestionId, status: 'approved' });
    }
    // Suggestion row still exists as 'pending' — host can approve it manually later.
  }

  return ok({ suggestionId, status: 'pending' });
}
