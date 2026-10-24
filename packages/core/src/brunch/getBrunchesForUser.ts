import type { DbClient } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { isVotingClosed } from './guards/assertVotingOpen';
import { isVoteWaiting } from './presentation/isVoteWaiting';

export type BrunchSummary = {
  readonly id: BrunchId;
  readonly title: string;
  readonly description: string | undefined;
  readonly statusCode: string;
  readonly statusLabel: string;
  readonly isHost: boolean;
  readonly goingCount: number;
  readonly createdAt: Date;
  // The viewer hid this brunch from their own dashboard (spec 0013). Theirs alone: the brunch and
  // everyone else's view are unchanged.
  readonly isHidden: boolean;
  // The confirmed time and place; all undefined until the host confirms.
  readonly scheduledAt: Date | undefined;
  readonly placeName: string | undefined;
  // IANA zone of the confirmed place, for showing the day where the brunch is.
  readonly timezone: string | undefined;
  readonly votingDeadline: Date | undefined;
  readonly votingClosed: boolean;
  // A vote is waiting on this person (see isVoteWaiting): the dashboard's butter pill.
  readonly votesWaiting: boolean;
};

type GetBrunchesForUserInput = {
  readonly userId: UserId;
  // The moment "closed" and "waiting" are judged at; the clock by default.
  readonly now?: Date;
};

// Every brunch the user belongs to comes through their BrunchAttendee row —
// hosts included, via the synthetic invite created on brunch creation.
//
// One query: the brunch, its status, the confirmed place and time, and the viewer's own votes
// all come in the same call, so a dashboard with twenty brunches is not twenty round trips.
export async function getBrunchesForUser(
  input: GetBrunchesForUserInput,
  ctx: { readonly db: DbClient },
): Promise<readonly BrunchSummary[]> {
  const now = input.now ?? new Date();
  const attendeeRecords = await ctx.db.brunchAttendee.findMany({
    where: {
      userId: input.userId,
      // The soft-delete extension only filters the top-level model; the
      // joined brunch needs its deletedAt check spelled out.
      brunch: { deletedAt: null },
    },
    include: {
      // "Gets a say" on voting (canVote), for the vote-waiting rule.
      rsvpStatus: { select: { canVote: true } },
      brunch: {
        include: {
          status: true,
          _count: {
            select: {
              // "Going" = live attendees whose RSVP counts (yes), not everyone invited.
              attendees: {
                where: { deletedAt: null, rsvpStatus: { countsAsAttendee: true } },
              },
            },
          },
          // Live options only (nested filters need deletedAt spelled out), with just the
          // viewer's own vote on each: enough to say what is confirmed and what is unvoted.
          locations: {
            where: { deletedAt: null },
            select: {
              isConfirmed: true,
              placeName: true,
              timezone: true,
              votes: { where: { userId: input.userId }, select: { id: true } },
            },
          },
          times: {
            where: { deletedAt: null },
            select: {
              isConfirmed: true,
              scheduledAt: true,
              votes: { where: { userId: input.userId }, select: { id: true } },
            },
          },
        },
      },
    },
    orderBy: { brunch: { createdAt: 'desc' } },
  });

  return attendeeRecords.map((record) => {
    const { brunch } = record;
    const confirmedLocation = brunch.locations.find((location) => location.isConfirmed);
    const confirmedTime = brunch.times.find((time) => time.isConfirmed);
    const closure = {
      status: brunch.status,
      votingClosedAt: brunch.votingClosedAt,
      votingDeadline: brunch.votingDeadline,
    };

    return {
      id: brunch.id as BrunchId,
      title: brunch.title,
      description: brunch.description ?? undefined,
      statusCode: brunch.status.code,
      statusLabel: brunch.status.label,
      isHost: brunch.hostId === input.userId,
      goingCount: brunch._count.attendees,
      createdAt: brunch.createdAt,
      // `?? null` so a row from a test double without the column reads as not hidden.
      isHidden: (record.hiddenAt ?? null) !== null,
      scheduledAt: confirmedTime?.scheduledAt,
      placeName: confirmedLocation?.placeName,
      timezone: confirmedLocation?.timezone,
      votingDeadline: brunch.votingDeadline ?? undefined,
      votingClosed: isVotingClosed(closure, now),
      votesWaiting: isVoteWaiting({
        brunch: closure,
        viewerCanVote: record.rsvpStatus.canVote,
        lists: [
          {
            liveOptionCount: brunch.locations.length,
            viewerVoted: brunch.locations.some((location) => location.votes.length > 0),
          },
          {
            liveOptionCount: brunch.times.length,
            viewerVoted: brunch.times.some((time) => time.votes.length > 0),
          },
        ],
        now,
      }),
    };
  });
}
