import type { DbClient } from '@brunchsters/database';
import type { BrunchId, Email, InviteId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import type {
  ConfirmationRecipient,
  ConfirmedBrunchSummary,
  ResolveConfirmationRecipientsError,
} from './confirmationTypes';

// A brunch that has since been cancelled or archived must not announce itself, however late
// a queued run gets to it.
const NO_LONGER_ON_STATUS_CODES: ReadonlySet<string> = new Set(['cancelled', 'archived']);

// Who hears that the brunch is confirmed: the host, and everyone invited who has not
// said no. That includes people who never signed in (no RSVP, so no "no") - they get
// the link to their invite page. Read from the database at send time, never from the
// event, so a revoked invite cannot receive anything.
export async function resolveConfirmationRecipients(
  input: { readonly brunchId: BrunchId },
  ctx: { readonly db: DbClient },
): Promise<
  Result<
    {
      readonly brunch: ConfirmedBrunchSummary;
      readonly recipients: readonly ConfirmationRecipient[];
    },
    ResolveConfirmationRecipientsError
  >
> {
  const { db } = ctx;

  try {
    const brunch = await db.brunch.findFirst({
      where: { id: input.brunchId },
      include: { host: true, status: true },
    });
    if (brunch === null) return err({ kind: 'brunch_not_found' });
    if (NO_LONGER_ON_STATUS_CODES.has(brunch.status.code)) return err({ kind: 'not_confirmed' });

    const location = await db.brunchLocation.findFirst({
      where: { brunchId: input.brunchId, isConfirmed: true },
    });
    const time = await db.brunchTime.findFirst({
      where: { brunchId: input.brunchId, isConfirmed: true },
    });
    if (location === null || time === null) return err({ kind: 'not_confirmed' });

    // The host's own synthetic invite is excluded the same way getInvitesForBrunch does.
    const invites = await db.brunchInvite.findMany({
      where: {
        brunchId: input.brunchId,
        NOT: { invitedEmail: { equals: brunch.host.email, mode: 'insensitive' } },
      },
      include: { attendee: { include: { rsvpStatus: true, user: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const recipients: ConfirmationRecipient[] = [
      {
        key: 'host',
        email: brunch.host.email as Email,
        name: brunch.host.name,
        destination: { kind: 'brunch' },
      },
    ];
    const seen = new Set([brunch.host.email.toLowerCase()]);

    for (const invite of invites) {
      const email = invite.invitedEmail.toLowerCase();
      if (seen.has(email)) continue;

      // Nested includes are not soft-delete filtered. A removed attendee is no longer
      // part of the brunch, and a "no" is the one answer that opts out.
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

    return ok({
      brunch: {
        brunchId: input.brunchId,
        title: brunch.title,
        hostName: brunch.host.name,
        placeName: location.placeName,
        placeAddress: location.placeAddress,
        placeUrl: location.placeUrl,
        timezone: location.timezone,
        scheduledAt: time.scheduledAt,
      },
      recipients,
    });
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }
}
