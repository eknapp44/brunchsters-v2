import type { DbClient } from '@brunchsters/database';
import type { UserId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import type { NotificationDbError } from './notificationTypes';

// The bell's number: unread rows for the signed-in person, one indexed count. Rows about a deleted
// brunch are not counted (they are not listed either).
export async function countUnread(
  input: { readonly userId: UserId },
  ctx: { readonly db: DbClient },
): Promise<Result<number, NotificationDbError>> {
  try {
    const count = await ctx.db.notification.count({
      where: {
        userId: input.userId,
        readAt: null,
        channel: { code: 'in_app' },
        OR: [{ brunchId: null }, { brunch: { deletedAt: null } }],
      },
    });
    return ok(count);
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }
}
