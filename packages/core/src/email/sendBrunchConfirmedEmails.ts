import type { DbClient } from '@brunchsters/database';
import type { BrunchId, Email } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import type { EmailService } from './EmailService';
import { confirmedEmailKey, joinUrl } from './emailKeys';
import { renderConfirmedEmail } from './templates/confirmedEmail';

export type ConfirmationRecipient = {
  // Stable per person for this brunch: part of the idempotency key and the queue step name.
  readonly key: string;
  readonly email: Email;
  readonly name: string | undefined;
  readonly link: string;
};

export type ConfirmedBrunchSummary = {
  readonly brunchId: BrunchId;
  readonly title: string;
  readonly hostName: string;
  readonly placeName: string;
  readonly placeAddress: string;
  readonly placeUrl: string;
  readonly timezone: string;
  readonly scheduledAt: Date;
};

export type ResolveConfirmationRecipientsError =
  | { readonly kind: 'brunch_not_found' }
  | { readonly kind: 'not_confirmed' }
  | { readonly kind: 'db_error'; readonly cause: unknown };

export type SendConfirmationEmailError =
  | { readonly kind: 'delivery_failed'; readonly message: string }
  | { readonly kind: 'invalid_address'; readonly address: string };

// Who hears that the brunch is confirmed: the host, and everyone invited who has not
// said no. That includes people who never signed in (no RSVP, so no "no") - they get
// the link to their invite page. Read from the database at send time, never from the
// event, so a revoked invite cannot receive anything.
export async function resolveConfirmationRecipients(
  input: { readonly brunchId: BrunchId },
  ctx: { readonly db: DbClient; readonly appUrl: string },
): Promise<
  Result<
    {
      readonly brunch: ConfirmedBrunchSummary;
      readonly recipients: readonly ConfirmationRecipient[];
    },
    ResolveConfirmationRecipientsError
  >
> {
  const { db, appUrl } = ctx;

  try {
    const brunch = await db.brunch.findFirst({
      where: { id: input.brunchId },
      include: { host: true },
    });
    if (brunch === null) return err({ kind: 'brunch_not_found' });

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

    const brunchLink = joinUrl(appUrl, `/brunch/${brunch.id}`);
    const recipients: ConfirmationRecipient[] = [
      {
        key: 'host',
        email: brunch.host.email as Email,
        name: brunch.host.name,
        link: brunchLink,
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
        link: attendee === null ? joinUrl(appUrl, `/invite/${invite.token}`) : brunchLink,
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

export async function sendConfirmationEmail(
  input: {
    readonly brunch: ConfirmedBrunchSummary;
    readonly recipient: ConfirmationRecipient;
  },
  ctx: { readonly emailService: EmailService },
): Promise<Result<'sent' | 'skipped_duplicate', SendConfirmationEmailError>> {
  const { brunch, recipient } = input;
  const { subject, html } = renderConfirmedEmail({
    recipientName: recipient.name,
    hostName: brunch.hostName,
    brunchTitle: brunch.title,
    placeName: brunch.placeName,
    placeAddress: brunch.placeAddress,
    placeUrl: brunch.placeUrl,
    scheduledAt: brunch.scheduledAt,
    timezone: brunch.timezone,
    link: recipient.link,
  });

  const sent = await ctx.emailService.send({
    to: recipient.email,
    subject,
    html,
    idempotencyKey: confirmedEmailKey({
      brunchId: brunch.brunchId,
      recipientKey: recipient.key,
    }),
  });
  if (sent.isErr()) {
    if (sent.error.kind === 'already_sent') return ok('skipped_duplicate');
    return err(sent.error);
  }

  return ok('sent');
}
