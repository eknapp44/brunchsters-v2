import type { DbClient } from '@brunchsters/database';
import type { BrunchId, BrunchTimeSuggestionId, UserId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import { addTimeRequestSchema, type AddTimeRequest } from './addTime';
import { reviewTimeSuggestion } from './reviewTimeSuggestion';
import { assertBrunchActive } from './guards/assertBrunchActive';

export const suggestTimeRequestSchema = addTimeRequestSchema;
export type SuggestTimeRequest = AddTimeRequest;

export type SuggestTimeInput = SuggestTimeRequest & {
  readonly brunchId: BrunchId;
  readonly suggestedById: UserId;
};

export type SuggestTimeResult = {
  readonly suggestionId: BrunchTimeSuggestionId;
  readonly status: 'pending' | 'approved';
};

export type SuggestTimeError =
  | { readonly kind: 'brunch_not_found' }
  | { readonly kind: 'suggestions_disabled' }
  | { readonly kind: 'brunch_not_active' }
  | { readonly kind: 'already_suggested' }
  | { readonly kind: 'lookup_not_found'; readonly code: string }
  | { readonly kind: 'db_error'; readonly cause: unknown };

export async function suggestTime(
  input: SuggestTimeInput,
  ctx: { readonly db: DbClient },
): Promise<Result<SuggestTimeResult, SuggestTimeError>> {
  const { db } = ctx;

  const brunch = await db.brunch.findFirst({
    where: { id: input.brunchId },
    include: { status: true },
  });
  if (brunch === null) return err({ kind: 'brunch_not_found' });

  // Membership first: an outsider must not learn anything (suggestions on? active?) about it.
  const isHost = brunch.hostId === input.suggestedById;
  if (!isHost) {
    const attendee = await db.brunchAttendee.findFirst({
      where: { brunchId: input.brunchId, userId: input.suggestedById },
    });
    if (attendee === null) return err({ kind: 'brunch_not_found' });
  }

  if (!brunch.allowTimeSuggestions) return err({ kind: 'suggestions_disabled' });
  const activeResult = assertBrunchActive(brunch);
  if (activeResult.isErr()) return err(activeResult.error);

  // No soft-delete field on this model — findUnique/findFirst behave the same here.
  const existing = await db.brunchTimeSuggestion.findUnique({
    where: {
      brunchId_scheduledAt: { brunchId: input.brunchId, scheduledAt: new Date(input.scheduledAt) },
    },
  });
  if (existing !== null) return err({ kind: 'already_suggested' });

  // Also check against already-live options — see suggestLocation.ts's
  // identical check for why.
  const existingTime = await db.brunchTime.findFirst({
    where: { brunchId: input.brunchId, scheduledAt: new Date(input.scheduledAt) },
  });
  if (existingTime !== null) return err({ kind: 'already_suggested' });

  const pendingStatus = await db.brunchOptionSuggestionStatus.findFirst({
    where: { code: 'pending' },
  });
  if (pendingStatus === null) {
    return err({ kind: 'lookup_not_found', code: 'BrunchOptionSuggestionStatus:pending' });
  }

  let suggestionId: BrunchTimeSuggestionId;
  try {
    const created = await db.brunchTimeSuggestion.create({
      data: {
        brunchId: input.brunchId,
        suggestedById: input.suggestedById,
        scheduledAt: new Date(input.scheduledAt),
        statusId: pendingStatus.id,
      },
    });
    suggestionId = created.id as BrunchTimeSuggestionId;
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }

  if (!brunch.requireHostApprovalForOptions) {
    const reviewResult = await reviewTimeSuggestion(
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
