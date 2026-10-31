import type { DbClient } from '@brunchsters/database';
import type { BrunchId, NotificationData, NotificationTypeCode, UserId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import type { NotificationDbError } from './notificationTypes';
import { shouldDeliver } from './shouldDeliver';
import { writeNotification, type WriteNotificationError } from './writeNotification';

export type NotifyError = WriteNotificationError | NotificationDbError;

type InAppRow = {
  readonly title: string;
  readonly body: string;
  readonly data: NotificationData;
  readonly dedupeKey: string;
};

// Writes one in-app row for each person who should get it (spec 0015): asks `shouldDeliver` about
// their preferences and mute first, then `writeNotification`, which is idempotent on the dedupe
// key, so a handler that runs twice writes each row once. Returns how many rows were new. A failure
// for one person ends the run with an error (the queue retries; the rows already written are
// skipped by their keys).
export async function deliverInApp(
  input: {
    readonly userIds: readonly UserId[];
    readonly type: NotificationTypeCode;
    readonly brunchId: BrunchId;
    readonly row: InAppRow;
    readonly now?: Date;
  },
  ctx: { readonly db: DbClient },
): Promise<Result<{ written: number }, NotifyError>> {
  let written = 0;
  for (const userId of input.userIds) {
    const wanted = await shouldDeliver(
      { userId, type: input.type, channel: 'in_app', brunchId: input.brunchId },
      ctx,
    );
    if (wanted.isErr()) return err(wanted.error);
    if (!wanted.value) continue;

    const result = await writeNotification(
      {
        userId,
        type: input.type,
        brunchId: input.brunchId,
        ...input.row,
        ...(input.now === undefined ? {} : { now: input.now }),
      },
      ctx,
    );
    if (result.isErr()) return err(result.error);
    if (result.value.created) written += 1;
  }
  return ok({ written });
}
