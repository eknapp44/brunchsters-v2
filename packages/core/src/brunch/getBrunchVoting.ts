import type { DbClient } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';
import type { DecisionMode } from './guards/deriveDecisionMode';
import { deriveDecisionMode } from './guards/deriveDecisionMode';
import { isVotingClosed } from './guards/assertVotingOpen';

// Below this, the 66% nudge never fires — a host alone with one or two
// attendees would otherwise see it at 1/1 or 2/2 immediately (spec 0005).
const MIN_ELIGIBLE_FOR_CLOSE_NUDGE = 3;
const CLOSE_NUDGE_PARTICIPATION_THRESHOLD = 0.66;

export type VoteOptionSummary = {
  readonly id: string;
  readonly voteCount: number;
  readonly viewerVoted: boolean;
  // Populated only for the host — mirrors the RSVP visibility rule
  // (PLANNING §17): everyone else sees counts, not who voted for what.
  readonly voters: readonly string[] | undefined;
};

export type PendingLocationSuggestion = {
  readonly id: string;
  readonly placeId: string;
  readonly placeName: string;
  readonly placeAddress: string;
  readonly placeUrl: string;
  readonly timezone: string;
  readonly suggestedByName: string;
  readonly suggestedByViewer: boolean;
};

export type PendingTimeSuggestion = {
  readonly id: string;
  readonly scheduledAt: Date;
  readonly suggestedByName: string;
  readonly suggestedByViewer: boolean;
};

export type BrunchVotingKind<TPendingSuggestion> = {
  readonly mode: DecisionMode;
  readonly closed: boolean;
  readonly options: readonly VoteOptionSummary[];
  readonly eligibleCount: number;
  readonly participationRatio: number;
  // Derived, not stored — v1 has no way to deliver a notification for this,
  // so it's a banner on the host's manage screen rather than a fire-once
  // event (see ADR-adjacent note in plan.md's "66% nudge is derived").
  readonly shouldSuggestClosing: boolean;
  // The host sees every pending suggestion; anyone else sees only their own
  // — mirrors the RSVP/vote visibility rule (PLANNING §17).
  readonly pendingSuggestions: readonly TPendingSuggestion[];
};

// One shape for every viewer, regardless of role — a return type that
// varied by caller identity would push role-checking into every consumer.
export type BrunchVoting = {
  readonly canVote: boolean;
  readonly locations: BrunchVotingKind<PendingLocationSuggestion>;
  readonly times: BrunchVotingKind<PendingTimeSuggestion>;
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

function buildKind<TPendingSuggestion>(
  options: readonly RawOption[],
  mode: DecisionMode,
  closed: boolean,
  viewerId: UserId,
  isHost: boolean,
  eligibleIds: ReadonlySet<string>,
  pendingSuggestions: readonly TPendingSuggestion[],
): BrunchVotingKind<TPendingSuggestion> {
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
  const shouldSuggestClosing =
    !closed &&
    eligibleCount >= MIN_ELIGIBLE_FOR_CLOSE_NUDGE &&
    participationRatio >= CLOSE_NUDGE_PARTICIPATION_THRESHOLD;

  return {
    mode,
    closed,
    options: builtOptions,
    eligibleCount,
    participationRatio,
    shouldSuggestClosing,
    pendingSuggestions,
  };
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
  const closed = isVotingClosed(brunch);

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

  // The host sees every pending suggestion; everyone else sees only their own.
  const suggestionScope = isHost ? {} : { suggestedById: input.viewerId };

  const [
    locationMode,
    timeMode,
    locations,
    times,
    pendingLocationSuggestions,
    pendingTimeSuggestions,
  ] = await Promise.all([
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
    db.brunchLocationSuggestion.findMany({
      where: { brunchId: input.brunchId, status: { code: 'pending' }, ...suggestionScope },
      include: { suggestedBy: { select: { name: true } } },
    }),
    db.brunchTimeSuggestion.findMany({
      where: { brunchId: input.brunchId, status: { code: 'pending' }, ...suggestionScope },
      include: { suggestedBy: { select: { name: true } } },
    }),
  ]);

  const locationSuggestions: readonly PendingLocationSuggestion[] = pendingLocationSuggestions.map(
    (s) => ({
      id: s.id,
      placeId: s.placeId,
      placeName: s.placeName,
      placeAddress: s.placeAddress,
      placeUrl: s.placeUrl,
      timezone: s.timezone,
      suggestedByName: s.suggestedBy.name,
      suggestedByViewer: s.suggestedById === input.viewerId,
    }),
  );
  const timeSuggestions: readonly PendingTimeSuggestion[] = pendingTimeSuggestions.map((s) => ({
    id: s.id,
    scheduledAt: s.scheduledAt,
    suggestedByName: s.suggestedBy.name,
    suggestedByViewer: s.suggestedById === input.viewerId,
  }));

  return {
    canVote,
    locations: buildKind(
      locations,
      locationMode,
      closed,
      input.viewerId,
      isHost,
      eligibleIds,
      locationSuggestions,
    ),
    times: buildKind(times, timeMode, closed, input.viewerId, isHost, eligibleIds, timeSuggestions),
  };
}
