import type { DbClient } from '@brunchsters/database';
import type { UserId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import { isUuid, type NotificationDbError } from './notificationTypes';

export type MarkReadInput = {
  readonly userId: UserId;
  readonly ids: readonly string[];
  readonly now?: Date;
};

// Marks the named notifications read, for the signed-in person only. Every id is matched together
// with the caller's own id, so one that belongs to someone else, one that does not exist and one
// that is not even a UUID all do the same thing: nothing, with the same answer. (A route must not
// become a way to learn whether a notification id exists.) Returns how many changed.
export async function markRead(
  input: MarkReadInput,
  ctx: { readonly db: DbClient },
): Promise<Result<{ marked: number }, NotificationDbError>> {
  const ids = input.ids.filter(isUuid);
  if (ids.length === 0) return ok({ marked: 0 });
  try {
    const result = await ctx.db.notification.updateMany({
      where: { userId: input.userId, id: { in: ids }, readAt: null },
      data: { readAt: input.now ?? new Date() },
    });
    return ok({ marked: result.count });
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }
}

// "Mark all read": everything unread that is the signed-in person's.
export async function markAllRead(
  input: { readonly userId: UserId; readonly now?: Date },
  ctx: { readonly db: DbClient },
): Promise<Result<{ marked: number }, NotificationDbError>> {
  try {
    const result = await ctx.db.notification.updateMany({
      where: { userId: input.userId, readAt: null },
      data: { readAt: input.now ?? new Date() },
    });
    return ok({ marked: result.count });
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }
}
