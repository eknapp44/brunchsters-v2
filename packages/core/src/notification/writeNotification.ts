import { isUniqueConstraintError, type DbClient } from '@brunchsters/database';
import type {
  BrunchId,
  NotificationData,
  NotificationId,
  NotificationTypeCode,
  UserId,
} from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import type { NotificationDbError } from './notificationTypes';

export type WriteNotificationInput = {
  readonly userId: UserId;
  readonly type: NotificationTypeCode;
  readonly brunchId?: BrunchId;
  // The plain-text fallback; the inbox words `data` itself (ADR 0017).
  readonly title: string;
  readonly body: string;
  readonly data: NotificationData;
  // One row per (person, key): a handler that runs twice writes the row once.
  readonly dedupeKey: string;
  readonly now?: Date;
};

export type WriteNotificationError = { readonly kind: 'unknown_type' } | NotificationDbError;

// Writes the in-app row for one person (spec 0015, ADR 0017). Idempotent on the dedupe key: the
// second call with the same key leaves the first row as it was (a person who already read it is
// not made to read it again) and says `created: false`. Whether the person should get it at all
// (their preferences, their mute) is `shouldDeliver`'s question, asked by the caller before this.
export async function writeNotification(
  input: WriteNotificationInput,
  ctx: { readonly db: DbClient },
): Promise<Result<{ id: NotificationId; created: boolean }, WriteNotificationError>> {
  const now = input.now ?? new Date();
  try {
    const [type, channel] = await Promise.all([
      ctx.db.notificationType.findUnique({ where: { code: input.type } }),
      ctx.db.notificationChannel.findUnique({ where: { code: 'in_app' } }),
    ]);
    if (type === null || channel === null) return err({ kind: 'unknown_type' });

    try {
      const row = await ctx.db.notification.create({
        data: {
          userId: input.userId,
          notificationTypeId: type.id,
          channelId: channel.id,
          brunchId: input.brunchId ?? null,
          title: input.title,
          body: input.body,
          data: input.data,
          dedupeKey: input.dedupeKey,
          sentAt: now,
          createdAt: now,
          lastEventAt: now,
        },
      });
      return ok({ id: row.id as NotificationId, created: true });
    } catch (cause) {
      if (!isUniqueConstraintError(cause)) throw cause;
      const existing = await ctx.db.notification.findFirstOrThrow({
        where: { userId: input.userId, dedupeKey: input.dedupeKey },
      });
      return ok({ id: existing.id as NotificationId, created: false });
    }
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }
}
