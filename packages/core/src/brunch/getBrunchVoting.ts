import type { DbClient } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';
import type { DecisionMode } from './guards/deriveDecisionMode';
import { deriveDecisionMode } from './guards/deriveDecisionMode';
import { isVotingClosed } from './guards/assertVotingOpen';

// Below this, the 66% nudge never fires — a host alone with one or two
// attendees would otherwise see it at 1/1 or 2/2 immediately (spec 0005).
const MIN_ELIGIBLE_FOR_CLOSE_NUDGE = 3;
const CLOSE_NUDGE_PARTICIPATION_THRESHOLD = 0.66;

export type LocationVoteOption = {
  readonly id: string;
  readonly placeId: string;
  readonly placeName: string;
  readonly placeAddress: string;
  readonly placeUrl: string;
  readonly timezone: string;
  readonly isConfirmed: boolean;
  readonly voteCount: number;
  readonly viewerVoted: boolean;
  // Populated only for the host — mirrors the RSVP visibility rule
  // (PLANNING §17): everyone else sees counts, not who voted for what.
  readonly voters: readonly string[] | undefined;
};

export type TimeVoteOption = {
  readonly id: string;
  readonly scheduledAt: Date;
  readonly isConfirmed: boolean;
  readonly voteCount: number;
  readonly viewerVoted: boolean;
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

export type BrunchVotingKind<TOption, TPendingSuggestion> = {
  readonly mode: DecisionMode;
  readonly closed: boolean;
  readonly options: readonly TOption[];
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
  readonly locations: BrunchVotingKind<LocationVoteOption, PendingLocationSuggestion>;
  readonly times: BrunchVotingKind<TimeVoteOption, PendingTimeSuggestion>;
};

type GetBrunchVotingInput = {
  readonly brunchId: BrunchId;
  readonly viewerId: UserId;
};

type RawVote = {
  readonly userId: string;
  readonly user: { readonly name: string };
};

type Summarized<TOption> = Omit<TOption, 'votes'> & {
  readonly voteCount: number;
  readonly viewerVoted: boolean;
  readonly voters: readonly string[] | undefined;
};

function summarizeOption<TOption extends { readonly votes: readonly RawVote[] }>(
  option: TOption,
  viewerId: UserId,
  isHost: boolean,
): Summarized<TOption> {
  const { votes, ...rest } = option;
  return {
    ...rest,
    voteCount: votes.length,
    viewerVoted: votes.some((vote) => vote.userId === viewerId),
    voters: isHost ? votes.map((vote) => vote.user.name) : undefined,
  } as Summarized<TOption>;
}

function buildKind<TOption extends { readonly votes: readonly RawVote[] }, TPendingSuggestion>(
  options: readonly TOption[],
  mode: DecisionMode,
  closed: boolean,
  viewerId: UserId,
  isHost: boolean,
  eligibleIds: ReadonlySet<string>,
  pendingSuggestions: readonly TPendingSuggestion[],
): BrunchVotingKind<Summarized<TOption>, TPendingSuggestion> {
  const participantIds = new Set<string>();
  for (const option of options) {
    for (const vote of option.votes) participantIds.add(vote.userId);
  }
  const builtOptions = options.map((option) => summarizeOption(option, viewerId, isHost));

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

  const voteSelect = { userId: true, user: { select: { name: true } } } as const;
  // Postgres returns rows in no guaranteed order, and createMany stamps every row it inserts
  // with the same createdAt — so each list needs an explicit, total order or the screens
  // reshuffle between loads (found by the e2e suite, spec 0006 M4). Times run chronologically;
  // places keep creation order, tie-broken by name; voter names are alphabetical.
  const votesOrder = [{ user: { name: 'asc' as const } }, { userId: 'asc' as const }];
  const suggestionsOrder = [{ createdAt: 'asc' as const }, { id: 'asc' as const }];

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
    // Explicit select, not include — these rows are spread straight into the
    // API/UI-facing output, so only name-the-fields-you-mean-to-expose here
    // (CLAUDE.md: output types are stripped of internal-only fields).
    db.brunchLocation.findMany({
      where: { brunchId: input.brunchId },
      select: {
        id: true,
        placeId: true,
        placeName: true,
        placeAddress: true,
        placeUrl: true,
        timezone: true,
        isConfirmed: true,
        votes: { select: voteSelect, orderBy: votesOrder },
      },
      orderBy: [{ createdAt: 'asc' }, { placeName: 'asc' }, { id: 'asc' }],
    }),
    db.brunchTime.findMany({
      where: { brunchId: input.brunchId },
      select: {
        id: true,
        scheduledAt: true,
        isConfirmed: true,
        votes: { select: voteSelect, orderBy: votesOrder },
      },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
    }),
    db.brunchLocationSuggestion.findMany({
      where: { brunchId: input.brunchId, status: { code: 'pending' }, ...suggestionScope },
      include: { suggestedBy: { select: { name: true } } },
      orderBy: suggestionsOrder,
    }),
    db.brunchTimeSuggestion.findMany({
      where: { brunchId: input.brunchId, status: { code: 'pending' }, ...suggestionScope },
      include: { suggestedBy: { select: { name: true } } },
      orderBy: suggestionsOrder,
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
