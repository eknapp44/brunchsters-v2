import type { DbClient } from '@brunchsters/database';
import {
  BIG_STUFF_TYPES,
  MUTE_PROOF_TYPES,
  NOTIFICATION_DEFAULTS,
  isNotificationLevelCode,
  type BrunchId,
  type NotificationChannelCode,
  type NotificationLevelCode,
  type NotificationTypeCode,
  type UserId,
} from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import type { NotificationDbError } from './notificationTypes';

// The whole decision, pure: given the person's level for the brunch, whether they have chosen for
// this type and channel, and what a person gets unasked (ADR 0017).
//
//   1. A mute-proof type ignores the level (the host's "an invite did not go out").
//   2. `muted` drops everything else; `big_stuff` drops everything outside BIG_STUFF_TYPES.
//   3. Then the person's own choice, and where they have not made one, the default.
export function decideDelivery(params: {
  readonly type: NotificationTypeCode;
  readonly channel: NotificationChannelCode;
  readonly level: NotificationLevelCode;
  // Their saved switch for this type and channel; undefined when they never touched it.
  readonly preference: boolean | undefined;
}): boolean {
  const { type, channel, level, preference } = params;
  const muteProof = MUTE_PROOF_TYPES.includes(type);
  if (!muteProof) {
    if (level === 'muted') return false;
    if (level === 'big_stuff' && !BIG_STUFF_TYPES.includes(type)) return false;
  }
  return preference ?? NOTIFICATION_DEFAULTS[type][channel];
}

export type ShouldDeliverInput = {
  readonly userId: UserId;
  readonly type: NotificationTypeCode;
  readonly channel: NotificationChannelCode;
  // The brunch it is about, when there is one: its mute level is the person's for that brunch.
  readonly brunchId?: BrunchId;
};

// The one place that decides whether a person is told something on a channel. Every inbox handler
// and every email sender asks it first, so a preference or a mute cannot be honored by one and
// forgotten by another. Someone who is not (or no longer) in the brunch has the default level.
export async function shouldDeliver(
  input: ShouldDeliverInput,
  ctx: { readonly db: DbClient },
): Promise<Result<boolean, NotificationDbError>> {
  try {
    const [attendee, preference] = await Promise.all([
      input.brunchId === undefined
        ? undefined
        : ctx.db.brunchAttendee.findFirst({
            where: { brunchId: input.brunchId, userId: input.userId },
            select: { notificationLevel: { select: { code: true } } },
          }),
      ctx.db.userNotificationPreference.findFirst({
        where: {
          userId: input.userId,
          notificationType: { code: input.type },
          channel: { code: input.channel },
        },
        select: { isEnabled: true },
      }),
    ]);

    const code = attendee?.notificationLevel.code;
    const level: NotificationLevelCode =
      code !== undefined && isNotificationLevelCode(code) ? code : 'all';
    return ok(
      decideDelivery({
        type: input.type,
        channel: input.channel,
        level,
        preference: preference?.isEnabled,
      }),
    );
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }
}
