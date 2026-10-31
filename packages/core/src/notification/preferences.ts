import type { DbClient } from '@brunchsters/database';
import {
  EMAIL_NOTIFICATION_TYPES,
  NOTIFICATION_DEFAULTS,
  PRODUCED_NOTIFICATION_TYPES,
  type NotificationChannelCode,
  type NotificationTypeCode,
  type UserId,
} from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import type { NotificationDbError } from './notificationTypes';

// What a person gets, per type and channel (spec 0015, ADR 0017): what they chose, and the default
// where they have not. Only the types something produces are listed (the settings page draws
// exactly these), and an email entry exists only where an email does.

export type EffectivePreferences = Readonly<
  Partial<Record<NotificationTypeCode, Readonly<Record<NotificationChannelCode, boolean>>>>
>;

export async function getNotificationPreferences(
  input: { readonly userId: UserId },
  ctx: { readonly db: DbClient },
): Promise<Result<EffectivePreferences, NotificationDbError>> {
  try {
    const saved = await ctx.db.userNotificationPreference.findMany({
      where: { userId: input.userId },
      include: {
        notificationType: { select: { code: true } },
        channel: { select: { code: true } },
      },
    });

    const effective: Partial<
      Record<NotificationTypeCode, Record<NotificationChannelCode, boolean>>
    > = {};
    for (const type of PRODUCED_NOTIFICATION_TYPES) {
      effective[type] = { ...NOTIFICATION_DEFAULTS[type] };
    }
    for (const row of saved) {
      const type = row.notificationType.code as NotificationTypeCode;
      const channel = row.channel.code as NotificationChannelCode;
      const entry = effective[type];
      if (entry !== undefined && (channel === 'in_app' || channel === 'email')) {
        entry[channel] = row.isEnabled;
      }
    }
    return ok(effective);
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }
}

export type SetNotificationPreferencesInput = {
  readonly userId: UserId;
  // One switch can govern several types (the settings page words "Replies and votes" as one line).
  readonly types: readonly NotificationTypeCode[];
  readonly channel: NotificationChannelCode;
  readonly enabled: boolean;
};

export type SetNotificationPreferencesError =
  // A type nothing produces, or an email switch for a type no email exists for.
  { readonly kind: 'invalid_selection' } | { readonly kind: 'unknown_type' } | NotificationDbError;

// Saves one switch for the signed-in person. Keyed by the session's user id and nothing a request
// names, so there is no one else's preference to reach.
export async function setNotificationPreferences(
  input: SetNotificationPreferencesInput,
  ctx: { readonly db: DbClient },
): Promise<Result<void, SetNotificationPreferencesError>> {
  const produced: readonly string[] = PRODUCED_NOTIFICATION_TYPES;
  const emailable: readonly string[] = EMAIL_NOTIFICATION_TYPES;
  const types = [...new Set(input.types)];
  if (types.length === 0) return err({ kind: 'invalid_selection' });
  for (const type of types) {
    if (!produced.includes(type)) return err({ kind: 'invalid_selection' });
    if (input.channel === 'email' && !emailable.includes(type)) {
      return err({ kind: 'invalid_selection' });
    }
  }

  try {
    const [typeRows, channel] = await Promise.all([
      ctx.db.notificationType.findMany({ where: { code: { in: types } } }),
      ctx.db.notificationChannel.findUnique({ where: { code: input.channel } }),
    ]);
    if (channel === null || typeRows.length !== types.length) return err({ kind: 'unknown_type' });

    await ctx.db.$transaction(
      typeRows.map((type) =>
        ctx.db.userNotificationPreference.upsert({
          where: {
            userId_notificationTypeId_channelId: {
              userId: input.userId,
              notificationTypeId: type.id,
              channelId: channel.id,
            },
          },
          update: { isEnabled: input.enabled },
          create: {
            userId: input.userId,
            notificationTypeId: type.id,
            channelId: channel.id,
            isEnabled: input.enabled,
          },
        }),
      ),
    );
    return ok(undefined);
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }
}
