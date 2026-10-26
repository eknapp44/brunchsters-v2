import type { DbClient } from '@brunchsters/database';
import {
  isNotificationLevelCode,
  type BrunchId,
  type NotificationLevelCode,
  type UserId,
} from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import type { NotificationDbError } from './notificationTypes';

// A person's mute level for one brunch (spec 0015, ADR 0017): all, just big stuff, or muted. It is a
// fact about their own place in the brunch (their attendee row; the host has one), so the signed-in
// person is the only one who can read or change it.

export type NotificationLevelError = { readonly kind: 'brunch_not_found' } | NotificationDbError;

// Where the person's own place in a live brunch is: undefined for an outsider, a removed member or
// a deleted brunch alike, which is all a caller may tell (a made-up id gets the same answer).
const ownPlace = (input: { readonly brunchId: BrunchId; readonly userId: UserId }) =>
  ({
    brunchId: input.brunchId,
    userId: input.userId,
    // The soft-delete extension filters only this model: a deleted brunch has no members.
    brunch: { deletedAt: null },
  }) as const;

export async function getNotificationLevel(
  input: { readonly brunchId: BrunchId; readonly userId: UserId },
  ctx: { readonly db: DbClient },
): Promise<Result<NotificationLevelCode, NotificationLevelError>> {
  try {
    const attendee = await ctx.db.brunchAttendee.findFirst({
      where: ownPlace(input),
      select: { notificationLevel: { select: { code: true } } },
    });
    if (attendee === null) return err({ kind: 'brunch_not_found' });
    const code = attendee.notificationLevel.code;
    return ok(isNotificationLevelCode(code) ? code : 'all');
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }
}

// Sets it. Membership is the one check, and it is the same lookup as the write, so an outsider and a
// made-up id are answered identically. A called-off brunch may still be muted (that is harmless,
// and the person may want the quiet), so this skips `assertBrunchOpen` on purpose.
export async function setNotificationLevel(
  input: {
    readonly brunchId: BrunchId;
    readonly userId: UserId;
    readonly level: NotificationLevelCode;
  },
  ctx: { readonly db: DbClient },
): Promise<Result<{ level: NotificationLevelCode }, NotificationLevelError>> {
  try {
    const level = await ctx.db.notificationLevel.findUnique({ where: { code: input.level } });
    if (level === null) return err({ kind: 'db_error', cause: new Error('Missing level row') });

    const result = await ctx.db.brunchAttendee.updateMany({
      where: ownPlace(input),
      data: { notificationLevelId: level.id },
    });
    if (result.count === 0) return err({ kind: 'brunch_not_found' });
    return ok({ level: input.level });
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }
}
