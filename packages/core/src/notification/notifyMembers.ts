import type { DbClient } from '@brunchsters/database';
import {
  formatPersonName,
  type BrunchId,
  type NotificationData,
  type NotificationTypeCode,
} from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import { loadNoticeBrunch } from '../email/loadNoticeBrunch';
import { deliverInApp, type NotifyError } from './deliverInApp';
import { loadBrunchMembers } from './loadBrunchMembers';
import { recipientsFor } from './recipientsFor';

// What the people in a brunch hear when the host changes its course (spec 0015, ADR 0017): it is
// on, it is off, it is back on. Everyone in the brunch but the host (who did it) and the people who
// said no (the one answer that opts out, as with the emails). The host's name is shown the way any
// other member sees a name ("First L.", ADR 0012). In-app rows only here; the emails are sent by
// their own handlers.

type MembersNotice = {
  readonly type: Extract<
    NotificationTypeCode,
    'brunch.confirmed' | 'brunch.cancelled' | 'brunch.reinstated'
  >;
  readonly brunchId: BrunchId;
  readonly dedupeKey: string;
  readonly now?: Date;
  // Words and facts for the row, given the brunch's title and the host's shown name.
  readonly build: (facts: { readonly title: string; readonly hostName: string }) => {
    readonly title: string;
    readonly body: string;
    readonly data: NotificationData;
  };
};

async function notifyMembers(
  input: MembersNotice,
  ctx: { readonly db: DbClient },
): Promise<Result<{ written: number }, NotifyError>> {
  try {
    const loaded = await loadBrunchMembers({ brunchId: input.brunchId }, ctx);
    if (loaded === undefined) return ok({ written: 0 });

    const recipients = recipientsFor({
      type: input.type,
      hostId: loaded.host.id,
      members: loaded.members,
      actorId: loaded.host.id,
    });
    const hostName = formatPersonName({ fullName: loaded.host.name, audience: 'member' });
    const row = input.build({ title: loaded.title, hostName });

    return await deliverInApp(
      {
        userIds: recipients,
        type: input.type,
        brunchId: input.brunchId,
        row: { ...row, dedupeKey: input.dedupeKey },
        ...(input.now === undefined ? {} : { now: input.now }),
      },
      ctx,
    );
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }
}

// "Brunch is on": run when a brunch is confirmed. Like the confirmation email it says nothing for a
// brunch since called off or archived, or one without a confirmed place and time.
export async function notifyBrunchConfirmed(
  input: { readonly brunchId: BrunchId; readonly now?: Date },
  ctx: { readonly db: DbClient },
): Promise<Result<{ written: number }, NotifyError>> {
  try {
    const loaded = await loadNoticeBrunch({ brunchId: input.brunchId }, ctx);
    if (loaded === undefined) return ok({ written: 0 });
    const status = loaded.brunch.status.code;
    if (status === 'cancelled' || status === 'archived') return ok({ written: 0 });
    const { plan } = loaded.summary;
    if (plan === undefined) return ok({ written: 0 });

    return await notifyMembers(
      {
        type: 'brunch.confirmed',
        brunchId: input.brunchId,
        dedupeKey: `confirmed:${input.brunchId}`,
        ...(input.now === undefined ? {} : { now: input.now }),
        build: ({ title, hostName }) => ({
          title: 'Brunch is on',
          body: `${title} is on at ${plan.placeName}.`,
          data: {
            kind: 'brunch.confirmed',
            hostName,
            placeName: plan.placeName,
            scheduledAt: plan.scheduledAt.toISOString(),
            timezone: plan.timezone,
          },
        }),
      },
      ctx,
    );
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }
}

// "Called off": run once the called-off notice has been claimed (after the hold, and only if this
// cancellation still stood), so a brunch brought back inside the hold writes nothing. The
// cancellation's moment is in the key: a second, later cancellation is a new row.
export function notifyBrunchCancelled(
  input: { readonly brunchId: BrunchId; readonly cancelledAt: Date; readonly now?: Date },
  ctx: { readonly db: DbClient },
): Promise<Result<{ written: number }, NotifyError>> {
  return notifyMembers(
    {
      type: 'brunch.cancelled',
      brunchId: input.brunchId,
      dedupeKey: `cancelled:${input.brunchId}:${input.cancelledAt.toISOString()}`,
      ...(input.now === undefined ? {} : { now: input.now }),
      build: ({ title, hostName }) => ({
        title: 'Called off',
        body: `${title} was called off.`,
        data: { kind: 'brunch.cancelled', hostName },
      }),
    },
    ctx,
  );
}

// "Back on": run only when people were told it was off (the back-on handler decides that). Keyed by
// the cancellation it undoes.
export function notifyBrunchReinstated(
  input: { readonly brunchId: BrunchId; readonly cancelledAt: Date; readonly now?: Date },
  ctx: { readonly db: DbClient },
): Promise<Result<{ written: number }, NotifyError>> {
  return notifyMembers(
    {
      type: 'brunch.reinstated',
      brunchId: input.brunchId,
      dedupeKey: `reinstated:${input.brunchId}:${input.cancelledAt.toISOString()}`,
      ...(input.now === undefined ? {} : { now: input.now }),
      build: ({ title, hostName }) => ({
        title: 'Back on',
        body: `${title} is back on.`,
        data: { kind: 'brunch.reinstated', hostName },
      }),
    },
    ctx,
  );
}
