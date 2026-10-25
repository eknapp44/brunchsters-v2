import type { DbClient } from '@brunchsters/database';
import { formatPersonName, type BrunchId, type InviteId, type UserId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import { deliverInApp, type NotifyError } from './deliverInApp';
import { recipientsFor } from './recipientsFor';

// "{Host} wants you at brunch" for an invited person who already has an account (spec 0015, ADR
// 0017). Someone with no account has no inbox: they get the email, and nothing is stored for them
// until they join. The row carries the invite's id, never its token; the inbox finds the invite
// page from the id for the signed-in invitee only.
//
// Nothing is written when the invite is gone, expired, already answered, or is the inviter's own.
// Run from `invite/sent` (a first send, and an approved suggestion); a resend writes nothing new
// because the row is keyed by the invite.
export async function notifyInvited(
  input: { readonly inviteId: InviteId; readonly now?: Date },
  ctx: { readonly db: DbClient },
): Promise<Result<{ written: number }, NotifyError>> {
  const now = input.now ?? new Date();
  try {
    const invite = await ctx.db.brunchInvite.findFirst({
      where: { id: input.inviteId },
      include: {
        brunch: { include: { host: true } },
        attendee: { select: { rsvpStatus: { select: { code: true } } } },
      },
    });
    if (invite === null || invite.tokenExpiresAt.getTime() <= now.getTime()) {
      return ok({ written: 0 });
    }
    // The soft-delete extension filters only the model queried: a deleted brunch has no one to tell.
    if (invite.brunch.deletedAt !== null) return ok({ written: 0 });
    // Someone who already has an account is added to the brunch when invited, with the placeholder
    // answer "invited"; one who has answered since needs no invitation.
    if (invite.attendee !== null && invite.attendee.rsvpStatus.code !== 'invited') {
      return ok({ written: 0 });
    }

    const invitedUserId =
      invite.invitedUserId ??
      (await ctx.db.user.findFirst({ where: { email: invite.invitedEmail }, select: { id: true } }))
        ?.id;
    if (invitedUserId === undefined) return ok({ written: 0 });

    const recipients = recipientsFor({
      type: 'invite.received',
      hostId: invite.brunch.hostId as UserId,
      members: [],
      invitedUserId: invitedUserId as UserId,
      actorId: invite.invitedById as UserId,
    });
    const hostName = formatPersonName({ fullName: invite.brunch.host.name, audience: 'member' });

    return await deliverInApp(
      {
        userIds: recipients,
        type: 'invite.received',
        brunchId: invite.brunchId as BrunchId,
        row: {
          title: "You're invited",
          body: `${hostName} wants you at ${invite.brunch.title}.`,
          data: { kind: 'invite.received', hostName, inviteId: invite.id },
          dedupeKey: `invite-received:${invite.id}`,
        },
        now,
      },
      ctx,
    );
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }
}
