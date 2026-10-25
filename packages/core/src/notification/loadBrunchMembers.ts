import type { DbClient } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';
import type { RecipientMember } from './recipientsFor';

export type LoadedBrunchMembers = {
  readonly brunchId: BrunchId;
  readonly title: string;
  readonly statusCode: string;
  readonly host: { readonly id: UserId; readonly name: string };
  // Everyone with a place in the brunch, the host included.
  readonly members: readonly RecipientMember[];
};

// The people in a brunch as the notification rules see them (spec 0015). Read from the database
// when a handler runs, never from an event, so a person who has since been removed is not told.
// Undefined for a deleted brunch or a made-up id (the soft-delete extension filters the lookup).
//
// `hasVoted` means they have cast a ballot on either the places or the times. Throws on a database
// failure; each producer wraps it in its own error.
export async function loadBrunchMembers(
  input: { readonly brunchId: BrunchId },
  ctx: { readonly db: DbClient },
): Promise<LoadedBrunchMembers | undefined> {
  const { db } = ctx;

  const brunch = await db.brunch.findFirst({
    where: { id: input.brunchId },
    include: { host: true, status: true },
  });
  if (brunch === null) return undefined;

  const [attendees, locationVotes, timeVotes] = await Promise.all([
    db.brunchAttendee.findMany({
      where: { brunchId: input.brunchId },
      include: { rsvpStatus: true },
    }),
    db.brunchLocationVote.findMany({
      where: { brunchLocation: { brunchId: input.brunchId } },
      select: { userId: true },
    }),
    db.brunchTimeVote.findMany({
      where: { brunchTime: { brunchId: input.brunchId } },
      select: { userId: true },
    }),
  ]);
  const voters = new Set([...locationVotes, ...timeVotes].map((vote) => vote.userId));

  return {
    brunchId: input.brunchId,
    title: brunch.title,
    statusCode: brunch.status.code,
    host: { id: brunch.hostId as UserId, name: brunch.host.name },
    members: attendees.map((attendee) => ({
      userId: attendee.userId as UserId,
      isHost: attendee.userId === brunch.hostId,
      canVote: attendee.rsvpStatus.canVote,
      hasVoted: voters.has(attendee.userId),
      hasDeclined: attendee.rsvpStatus.code === 'no',
    })),
  };
}
