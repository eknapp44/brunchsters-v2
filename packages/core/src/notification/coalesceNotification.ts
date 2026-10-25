import type { DbClient } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import type { CoalescedType, NotificationDbError } from './notificationTypes';

export type CoalesceNotificationInput = {
  // The person who is told: the host.
  readonly userId: UserId;
  readonly type: CoalescedType;
  readonly brunchId: BrunchId;
  // The person whose reply or vote this is. Counted once, however often they change their answer.
  readonly actorId: UserId;
  // The plain-text fallback. It carries no count, because the count moves after it is written.
  readonly title: string;
  readonly body: string;
  readonly now?: Date;
};

export type CoalesceNotificationError = { readonly kind: 'unknown_type' } | NotificationDbError;

export function coalescedDedupeKey(params: {
  readonly type: CoalescedType;
  readonly brunchId: BrunchId;
}): string {
  return `coalesced:${params.type}:${params.brunchId}`;
}

// One row per (host, brunch, kind) for replies and for votes: "3 new votes on Sunday" (spec 0015,
// ADR 0017). The count is the number of different people since the host last read the row.
//
//   - no row yet: it is written with a count of one;
//   - an unread row and a new person: the count goes up and the row moves to the top;
//   - an unread row and a person already counted: nothing changes (changing a vote is not news);
//   - a read row: it is unread again with a count of one (new since it was read).
//
// All of it is one statement, so two events landing together cannot lose a count.
export async function coalesceNotification(
  input: CoalesceNotificationInput,
  ctx: { readonly db: DbClient },
): Promise<Result<void, CoalesceNotificationError>> {
  const now = input.now ?? new Date();
  const dedupeKey = coalescedDedupeKey(input);
  try {
    const [type, channel] = await Promise.all([
      ctx.db.notificationType.findUnique({ where: { code: input.type } }),
      ctx.db.notificationChannel.findUnique({ where: { code: 'in_app' } }),
    ]);
    if (type === null || channel === null) return err({ kind: 'unknown_type' });

    const initial = JSON.stringify({ kind: input.type, count: 1, actors: [input.actorId] });
    await ctx.db.$executeRaw`
      INSERT INTO "Notification"
        ("id", "userId", "notificationTypeId", "channelId", "brunchId", "title", "body", "data",
         "dedupeKey", "sentAt", "createdAt", "lastEventAt")
      VALUES
        (gen_random_uuid(), ${input.userId}::uuid, ${type.id}::uuid, ${channel.id}::uuid,
         ${input.brunchId}::uuid, ${input.title}, ${input.body}, ${initial}::jsonb,
         ${dedupeKey}, ${now}, ${now}, ${now})
      ON CONFLICT ("userId", "dedupeKey") DO UPDATE SET
        "data" = CASE
          WHEN "Notification"."readAt" IS NOT NULL THEN EXCLUDED."data"
          WHEN ("Notification"."data"->'actors') @> (EXCLUDED."data"->'actors')
            THEN "Notification"."data"
          ELSE "Notification"."data" || jsonb_build_object(
            'count', ("Notification"."data"->>'count')::int + 1,
            'actors', ("Notification"."data"->'actors') || (EXCLUDED."data"->'actors'))
        END,
        "lastEventAt" = CASE
          WHEN "Notification"."readAt" IS NOT NULL
            OR NOT (("Notification"."data"->'actors') @> (EXCLUDED."data"->'actors'))
            THEN ${now}
          ELSE "Notification"."lastEventAt"
        END,
        "readAt" = NULL`;
    return ok(undefined);
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }
}
