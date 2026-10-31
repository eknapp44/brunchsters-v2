import type { DbClient } from '@brunchsters/database';
import {
  isNotificationTypeCode,
  readNotificationData,
  type BrunchId,
  type NotificationId,
  type UserId,
} from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import type { NotificationDbError, NotificationItem } from './notificationTypes';

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

export type ListNotificationsInput = {
  // Always the signed-in person. Nothing here takes an id the caller named for someone else.
  readonly userId: UserId;
  readonly limit?: number;
  // Rows changed before this moment (the `lastEventAt` of the last row of the previous page).
  readonly before?: Date;
};

// A row about a brunch that has since been deleted is left out: its title must not outlive it.
// (The soft-delete extension filters only the model queried, so the relation needs its own check.)
function liveBrunch() {
  return { OR: [{ brunchId: null }, { brunch: { deletedAt: null } }] };
}

// The person's inbox, newest change first. A row whose type or data is not one this code reads is
// skipped rather than drawn half-empty.
export async function listNotifications(
  input: ListNotificationsInput,
  ctx: { readonly db: DbClient },
): Promise<Result<readonly NotificationItem[], NotificationDbError>> {
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  try {
    const rows = await ctx.db.notification.findMany({
      where: {
        userId: input.userId,
        channel: { code: 'in_app' },
        ...liveBrunch(),
        ...(input.before === undefined ? {} : { lastEventAt: { lt: input.before } }),
      },
      orderBy: [{ lastEventAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: {
        notificationType: { select: { code: true } },
        brunch: { select: { title: true } },
      },
    });

    const items: NotificationItem[] = [];
    for (const row of rows) {
      const type = row.notificationType.code;
      if (!isNotificationTypeCode(type)) continue;
      const data = readNotificationData({ type, data: row.data });
      if (data === undefined) continue;
      items.push({
        id: row.id as NotificationId,
        type,
        brunchId: row.brunchId === null ? undefined : (row.brunchId as BrunchId),
        brunchTitle: row.brunch?.title,
        data,
        title: row.title,
        body: row.body,
        isRead: row.readAt !== null,
        lastEventAt: row.lastEventAt,
      });
    }
    return ok(items);
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }
}
