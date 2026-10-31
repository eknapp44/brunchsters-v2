import type { DbClient } from '@brunchsters/database';
import type { BrunchId, InviteId, UserId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import { deliverInApp, type NotifyError } from '../notification/deliverInApp';
import type { NotificationDbError } from '../notification/notificationTypes';

// "An email did not go out" (spec 0015, ADR 0017). Two small services around one fact on the invite,
// `emailFailedAt`: it is set when the invite email failed for good (the address was refused, or the
// provider kept failing until the queue gave up) and cleared when an email for it finally goes.
//
// It is the host's to know and nobody else's: the invited person is never told, and a person who
// switched the email off is a skip, not a failure, so this is never reached for them (the host must
// not learn who opted out).

// The key of the host's row. Each send (the first, and every resend) has one, so a second failure
// after a resend is news again, while a replay of the same failure writes nothing twice.
function rowKey(invite: { readonly id: string; readonly lastResentAt: Date | null }): string {
  return `email-failed:${invite.id}:${invite.lastResentAt?.getTime() ?? 'first'}`;
}

const ROW_PREFIX = (inviteId: string): string => `email-failed:${inviteId}:`;

// The invite email failed for good: remember it on the invite (the invite list shows it beside
// Resend) and tell the host in their inbox. A revoked invite or a deleted brunch is nobody's
// business any more, so nothing is written. The host's own switch for this row, and nothing else,
// can silence it (muting a brunch never hides this one); the flag on the invite stays either way.
export async function recordInviteEmailFailed(
  input: { readonly inviteId: InviteId; readonly now?: Date },
  ctx: { readonly db: DbClient },
): Promise<Result<{ written: number }, NotifyError>> {
  const now = input.now ?? new Date();
  try {
    const invite = await ctx.db.brunchInvite.findFirst({
      where: { id: input.inviteId },
      include: { brunch: true },
    });
    if (invite === null || invite.brunch.deletedAt !== null) return ok({ written: 0 });

    await ctx.db.brunchInvite.update({
      where: { id: invite.id },
      data: { emailFailedAt: now },
    });

    return await deliverInApp(
      {
        userIds: [invite.brunch.hostId as UserId],
        type: 'invite.email.failed',
        brunchId: invite.brunchId as BrunchId,
        row: {
          title: "An invite didn't go through",
          body: `Your invite to ${invite.invitedEmail} didn't go through.`,
          data: { kind: 'invite.email.failed', email: invite.invitedEmail },
          dedupeKey: rowKey(invite),
        },
        now,
      },
      ctx,
    );
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }
}

// An email for this invite went out (or the provider says it already had): the failure is over. The
// flag goes, and so do the host's rows about it, because "didn't go through" would now be untrue.
// (A hard delete: a notification is an ephemeral view with no record value, ADR 0017.)
export async function clearInviteEmailFailure(
  input: { readonly inviteId: InviteId },
  ctx: { readonly db: DbClient },
): Promise<Result<void, NotificationDbError>> {
  try {
    await ctx.db.brunchInvite.updateMany({
      where: { id: input.inviteId, emailFailedAt: { not: null } },
      data: { emailFailedAt: null },
    });
    await ctx.db.notification.deleteMany({
      where: { dedupeKey: { startsWith: ROW_PREFIX(input.inviteId) } },
    });
    return ok(undefined);
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }
}
