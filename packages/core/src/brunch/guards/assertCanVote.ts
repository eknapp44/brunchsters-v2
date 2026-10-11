import type { BrunchAttendee, DbClient } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';

// Includes rsvpStatus so callers can read canVote without a re-query.
export type VotingAttendee = BrunchAttendee & {
  readonly rsvpStatus: { readonly canVote: boolean };
};

export type AssertCanVoteError =
  | { readonly kind: 'brunch_not_found' }
  | { readonly kind: 'cannot_vote' };

type AssertCanVoteInput = {
  readonly brunchId: BrunchId;
  readonly userId: UserId;
};

// "Gets a say" is RsvpStatus.canVote, deliberately not countsAsAttendee
// ("is coming") — a maybe shouldn't inflate the headcount but is often the
// most informative voter (spec 0005).
export async function assertCanVote(
  input: AssertCanVoteInput,
  ctx: { readonly db: DbClient },
): Promise<Result<VotingAttendee, AssertCanVoteError>> {
  const attendee = await ctx.db.brunchAttendee.findFirst({
    where: { brunchId: input.brunchId, userId: input.userId },
    include: { rsvpStatus: true },
  });
  // Not a member: indistinguishable from a brunch that does not exist.
  if (attendee === null) return err({ kind: 'brunch_not_found' });
  if (!attendee.rsvpStatus.canVote) return err({ kind: 'cannot_vote' });

  return ok(attendee);
}
