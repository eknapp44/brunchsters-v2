import type { DbClient } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';
import type { DecisionMode } from './guards/deriveDecisionMode';
import { deriveDecisionMode } from './guards/deriveDecisionMode';

export type VoteOptionSummary = {
  readonly id: string;
  readonly voteCount: number;
  readonly viewerVoted: boolean;
  // Populated only for the host — mirrors the RSVP visibility rule
  // (PLANNING §17): everyone else sees counts, not who voted for what.
  readonly voters: readonly string[] | undefined;
};

export type BrunchVotingKind = {
  readonly mode: DecisionMode;
  readonly closed: boolean;
  readonly options: readonly VoteOptionSummary[];
  readonly eligibleCount: number;
  readonly participationRatio: number;
};

// One shape for every viewer, regardless of role — a return type that
// varied by caller identity would push role-checking into every consumer.
export type BrunchVoting = {
  readonly canVote: boolean;
  readonly locations: BrunchVotingKind;
  readonly times: BrunchVotingKind;
};

type GetBrunchVotingInput = {
  readonly brunchId: BrunchId;
  readonly viewerId: UserId;
};

type RawOption = {
  readonly id: string;
  readonly votes: readonly {
    readonly userId: string;
    readonly user: { readonly name: string };
  }[];
};

function buildKind(
  options: readonly RawOption[],
  mode: DecisionMode,
  closed: boolean,
  viewerId: UserId,
  isHost: boolean,
  eligibleIds: ReadonlySet<string>,
): BrunchVotingKind {
  const participantIds = new Set<string>();
  const builtOptions = options.map((option) => {
    for (const vote of option.votes) participantIds.add(vote.userId);
    return {
      id: option.id,
      voteCount: option.votes.length,
      viewerVoted: option.votes.some((vote) => vote.userId === viewerId),
      voters: isHost ? option.votes.map((vote) => vote.user.name) : undefined,
    };
  });

  const eligibleCount = eligibleIds.size;
  const participated = Array.from(participantIds).filter((id) => eligibleIds.has(id)).length;
  const participationRatio = eligibleCount > 0 ? participated / eligibleCount : 0;

  return { mode, closed, options: builtOptions, eligibleCount, participationRatio };
}

// Closure here is a placeholder for M4's guards/assertVotingOpen.ts, which
// will also account for an early manual close (votingClosedAt). Until that
// column exists, closed is just "confirmed" or "past the original deadline."
function isVotingClosed(statusCode: string, votingDeadline: Date | null): boolean {
  if (statusCode === 'confirmed') return true;
  return votingDeadline !== null && new Date() > votingDeadline;
}

// Authorized read: undefined unless the viewer is the host or a live
// attendee — same access rule as getBrunchById.
export async function getBrunchVoting(
  input: GetBrunchVotingInput,
  ctx: { readonly db: DbClient },
): Promise<BrunchVoting | undefined> {
  const { db } = ctx;

  const brunch = await db.brunch.findFirst({
    where: {
      id: input.brunchId,
      OR: [
        { hostId: input.viewerId },
        { attendees: { some: { userId: input.viewerId, deletedAt: null } } },
      ],
    },
    include: { status: true },
  });
  if (brunch === null) return undefined;

  const isHost = brunch.hostId === input.viewerId;
  const closed = isVotingClosed(brunch.status.code, brunch.votingDeadline);

  const viewerAttendee = await db.brunchAttendee.findFirst({
    where: { brunchId: input.brunchId, userId: input.viewerId },
    include: { rsvpStatus: true },
  });
  const canVote = viewerAttendee?.rsvpStatus.canVote ?? false;

  const eligibleAttendees = await db.brunchAttendee.findMany({
    where: { brunchId: input.brunchId, rsvpStatus: { canVote: true } },
    select: { userId: true },
  });
  const eligibleIds = new Set(eligibleAttendees.map((a) => a.userId));

  const [locationMode, timeMode, locations, times] = await Promise.all([
    deriveDecisionMode({ brunchId: input.brunchId, kind: 'location' }, { db }),
    deriveDecisionMode({ brunchId: input.brunchId, kind: 'time' }, { db }),
    db.brunchLocation.findMany({
      where: { brunchId: input.brunchId },
      include: { votes: { include: { user: { select: { name: true } } } } },
    }),
    db.brunchTime.findMany({
      where: { brunchId: input.brunchId },
      include: { votes: { include: { user: { select: { name: true } } } } },
    }),
  ]);

  return {
    canVote,
    locations: buildKind(locations, locationMode, closed, input.viewerId, isHost, eligibleIds),
    times: buildKind(times, timeMode, closed, input.viewerId, isHost, eligibleIds),
  };
}
