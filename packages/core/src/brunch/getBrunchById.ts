import type { DbClient } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';

export type BrunchDetail = {
  readonly id: BrunchId;
  readonly title: string;
  readonly description: string | undefined;
  readonly statusCode: string;
  readonly statusLabel: string;
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
    include: { status: true },
  });

  if (brunch === null) return undefined;

  return {
    id: brunch.id as BrunchId,
    title: brunch.title,
    description: brunch.description ?? undefined,
    statusCode: brunch.status.code,
    statusLabel: brunch.status.label,
  };
}
