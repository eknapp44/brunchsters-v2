import type { DbClient } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';

export type BrunchSummary = {
  readonly id: BrunchId;
  readonly title: string;
  readonly statusCode: string;
  readonly statusLabel: string;
  readonly isHost: boolean;
  readonly goingCount: number;
  readonly createdAt: Date;
};

type GetBrunchesForUserInput = {
  readonly userId: UserId;
};

// Every brunch the user belongs to comes through their BrunchAttendee row —
// hosts included, via the synthetic invite created on brunch creation.
export async function getBrunchesForUser(
  input: GetBrunchesForUserInput,
  ctx: { readonly db: DbClient },
): Promise<readonly BrunchSummary[]> {
  const attendeeRecords = await ctx.db.brunchAttendee.findMany({
    where: {
      userId: input.userId,
      // The soft-delete extension only filters the top-level model; the
      // joined brunch needs its deletedAt check spelled out.
      brunch: { deletedAt: null },
    },
    include: {
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
        },
      },
    },
    orderBy: { brunch: { createdAt: 'desc' } },
  });

  return attendeeRecords.map((record) => ({
    id: record.brunch.id as BrunchId,
    title: record.brunch.title,
    statusCode: record.brunch.status.code,
    statusLabel: record.brunch.status.label,
    isHost: record.brunch.hostId === input.userId,
    goingCount: record.brunch._count.attendees,
    createdAt: record.brunch.createdAt,
  }));
}
