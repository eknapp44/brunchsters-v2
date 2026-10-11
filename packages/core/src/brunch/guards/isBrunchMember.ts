import type { DbClient } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';

// Whether someone belongs to a brunch: its host (who has a built-in attendee row) or a current
// attendee. A removed attendee does not count — the soft-delete filter excludes them.
//
// Used to decide between "you are not allowed" (403, only for members) and "there is nothing here"
// (404, for everyone else). An outsider must not be able to tell a real brunch from a made-up id,
// so every check that could reveal anything about a brunch runs AFTER this one.
export async function isBrunchMember(
  input: { readonly brunchId: BrunchId; readonly userId: UserId },
  ctx: { readonly db: DbClient },
): Promise<boolean> {
  const attendee = await ctx.db.brunchAttendee.findFirst({
    where: { brunchId: input.brunchId, userId: input.userId },
    select: { id: true },
  });
  return attendee !== null;
}
