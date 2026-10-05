import type { DbClient } from '@brunchsters/database';
import type { BrunchId, BrunchLocationSuggestionId, UserId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import type { LocationInput } from './createBrunch';
import { reviewLocationSuggestion } from './reviewLocationSuggestion';

export type SuggestLocationInput = {
  readonly brunchId: BrunchId;
  readonly suggestedById: UserId;
  readonly location: LocationInput;
};

export type SuggestLocationResult = {
  readonly suggestionId: BrunchLocationSuggestionId;
  readonly status: 'pending' | 'approved';
};

export type SuggestLocationError =
  | { readonly kind: 'brunch_not_found' }
  | { readonly kind: 'suggestions_disabled' }
  | { readonly kind: 'brunch_not_active' }
  | { readonly kind: 'not_attendee' }
  | { readonly kind: 'already_suggested' }
  | { readonly kind: 'lookup_not_found'; readonly code: string }
  | { readonly kind: 'db_error'; readonly cause: unknown };

export async function suggestLocation(
  input: SuggestLocationInput,
  ctx: { readonly db: DbClient },
): Promise<Result<SuggestLocationResult, SuggestLocationError>> {
  const { db } = ctx;

  const brunch = await db.brunch.findFirst({
    where: { id: input.brunchId },
    include: { status: true },
  });
  if (brunch === null) return err({ kind: 'brunch_not_found' });
  if (!brunch.allowLocationSuggestions) return err({ kind: 'suggestions_disabled' });
  if (brunch.status.code !== 'active') return err({ kind: 'brunch_not_active' });

  const isHost = brunch.hostId === input.suggestedById;
  if (!isHost) {
    const attendee = await db.brunchAttendee.findFirst({
      where: { brunchId: input.brunchId, userId: input.suggestedById },
    });
    if (attendee === null) return err({ kind: 'not_attendee' });
  }

  // No soft-delete field on this model — findUnique/findFirst behave the same here.
  const existing = await db.brunchLocationSuggestion.findUnique({
    where: { brunchId_placeId: { brunchId: input.brunchId, placeId: input.location.placeId } },
  });
  if (existing !== null) return err({ kind: 'already_suggested' });

  const pendingStatus = await db.brunchOptionSuggestionStatus.findFirst({
    where: { code: 'pending' },
  });
  if (pendingStatus === null) {
    return err({ kind: 'lookup_not_found', code: 'BrunchOptionSuggestionStatus:pending' });
  }

  let suggestionId: BrunchLocationSuggestionId;
  try {
    const created = await db.brunchLocationSuggestion.create({
      data: {
        brunchId: input.brunchId,
        suggestedById: input.suggestedById,
        placeId: input.location.placeId,
        placeName: input.location.placeName,
        placeAddress: input.location.placeAddress,
        placeUrl: input.location.placeUrl,
        timezone: input.location.timezone,
        statusId: pendingStatus.id,
      },
    });
    suggestionId = created.id as BrunchLocationSuggestionId;
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }

  if (!brunch.requireHostApprovalForOptions) {
    const reviewResult = await reviewLocationSuggestion(
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
