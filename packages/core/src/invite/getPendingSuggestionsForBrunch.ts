import type { DbClient } from '@brunchsters/database';
import type { BrunchId, InviteSuggestionId, UserId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';

export type SuggestionListItem = {
  readonly id: InviteSuggestionId;
  readonly suggestedEmail: string;
  readonly suggestedByName: string;
};

export type GetPendingSuggestionsForBrunchInput = {
  readonly brunchId: BrunchId;
  readonly requestedById: UserId;
};

export type GetPendingSuggestionsForBrunchError =
  | { readonly kind: 'brunch_not_found' }
  | { readonly kind: 'not_host' };

// Host-only, pending suggestions only — approved/declined ones are done and
// don't need review UI (approved ones are already visible as real invites
// via getInvitesForBrunch).
export async function getPendingSuggestionsForBrunch(
  input: GetPendingSuggestionsForBrunchInput,
  ctx: { readonly db: DbClient },
): Promise<Result<readonly SuggestionListItem[], GetPendingSuggestionsForBrunchError>> {
  const brunch = await ctx.db.brunch.findFirst({ where: { id: input.brunchId } });
  if (brunch === null) return err({ kind: 'brunch_not_found' });
  if (brunch.hostId !== input.requestedById) return err({ kind: 'not_host' });

  const suggestions = await ctx.db.brunchInviteSuggestion.findMany({
    where: { brunchId: input.brunchId, status: { code: 'pending' } },
    include: { suggestedBy: true },
    orderBy: { createdAt: 'asc' },
  });

  return ok(
    suggestions.map((suggestion) => ({
      id: suggestion.id as InviteSuggestionId,
      suggestedEmail: suggestion.suggestedEmail,
      suggestedByName: suggestion.suggestedBy.name,
    })),
  );
}
