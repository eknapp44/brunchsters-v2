import type { DbClient } from '@brunchsters/database';
import type { BrunchId, Email, InviteId } from '@brunchsters/shared';
import type { ConfirmationRecipient } from './confirmationTypes';

// Who is in a brunch as far as an email is concerned: everyone invited who has not said no. That
// includes people who never signed in (no RSVP, so no "no"): they get the link to their invite
// page. The host's own built-in invite is never listed as a guest; the host is added once, first,
// when `includeHost` is set (the confirmation goes to the host too, a cancellation does not: they
// did it). Read from the database at send time, never from an event, so a revoked invite cannot
// receive anything. Shared by the confirmation, called-off and back-on emails (specs 0008, 0013).
//
// Throws on a database failure: each caller wraps it in its own error.
export async function listBrunchRecipients(
  input: {
    readonly brunchId: BrunchId;
    readonly host: { readonly email: string; readonly name: string };
    readonly includeHost: boolean;
  },
  ctx: { readonly db: DbClient },
): Promise<readonly ConfirmationRecipient[]> {
  const { db } = ctx;

  // The host's own synthetic invite is excluded the same way getInvitesForBrunch does.
  const invites = await db.brunchInvite.findMany({
    where: {
      brunchId: input.brunchId,
      NOT: { invitedEmail: { equals: input.host.email, mode: 'insensitive' } },
    },
    include: { attendee: { include: { rsvpStatus: true, user: true } } },
    orderBy: { createdAt: 'asc' },
  });

  const recipients: ConfirmationRecipient[] = input.includeHost
    ? [
        {
          key: 'host',
          email: input.host.email as Email,
          name: input.host.name,
          destination: { kind: 'brunch' },
        },
      ]
    : [];
  const seen = new Set([input.host.email.toLowerCase()]);

  for (const invite of invites) {
    const email = invite.invitedEmail.toLowerCase();
    if (seen.has(email)) continue;

    // Nested includes are not soft-delete filtered. A removed attendee is no longer part of the
    // brunch, and a "no" is the one answer that opts out.
    const attendee = invite.attendee;
    if (attendee !== null && (attendee.deletedAt !== null || attendee.rsvpStatus.code === 'no')) {
      continue;
    }

    seen.add(email);
    recipients.push({
      key: `invite:${invite.id}`,
      email: invite.invitedEmail as Email,
      name: attendee?.user.name,
      destination:
        attendee === null
          ? { kind: 'invite', inviteId: invite.id as InviteId }
          : { kind: 'brunch' },
    });
  }

  return recipients;
}
