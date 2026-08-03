import type { DbClient } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';

export type BrunchDetail = {
  readonly id: BrunchId;
  readonly title: string;
  readonly description: string | undefined;
  readonly statusCode: string;
  readonly statusLabel: string;
  readonly isHost: boolean;
  readonly viewerRsvpStatus: string | undefined;
  readonly allowInviteSuggestions: boolean;
};

type GetBrunchByIdInput = {
  readonly brunchId: BrunchId;
  readonly viewerId: UserId;
};

// Authorized read: undefined unless the viewer is the host or a live attendee.
// Callers render 404 either way — existence is not leaked to non-members.
export async function getBrunchById(
  input: GetBrunchByIdInput,
  ctx: { readonly db: DbClient },
): Promise<BrunchDetail | undefined> {
  const brunch = await ctx.db.brunch.findFirst({
    where: {
      id: input.brunchId,
      OR: [
        { hostId: input.viewerId },
        // Soft-delete extension only covers top-level queries; relation
        // filters need the deletedAt check spelled out.
        { attendees: { some: { userId: input.viewerId, deletedAt: null } } },
      ],
    },
    include: {
      status: true,
      // Scoped to the viewer only — this is an authorized single-viewer read,
      // never a full attendee list (that's getInvitesForBrunch, host-only).
      attendees: {
        where: { userId: input.viewerId, deletedAt: null },
        include: { rsvpStatus: true },
        take: 1,
      },
    },
  });

  if (brunch === null) return undefined;

  // 'invited' is sendInvites's eager placeholder status for a known-user
  // invitee who hasn't visited their link yet — it's not one of yes/no/maybe,
  // so surface it the same as "no attendee row at all" rather than as a real
  // response the RSVP control would otherwise print verbatim.
  const rsvpStatusCode = brunch.attendees[0]?.rsvpStatus.code;

  return {
    id: brunch.id as BrunchId,
    title: brunch.title,
    description: brunch.description ?? undefined,
    statusCode: brunch.status.code,
    statusLabel: brunch.status.label,
    isHost: brunch.hostId === input.viewerId,
    viewerRsvpStatus: rsvpStatusCode === 'invited' ? undefined : rsvpStatusCode,
    allowInviteSuggestions: brunch.allowInviteSuggestions,
  };
}
