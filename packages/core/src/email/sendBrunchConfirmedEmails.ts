import type { DbClient } from '@brunchsters/database';
import type { BrunchId, Email, InviteId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import type { EmailError, EmailService } from './EmailService';
import { confirmedEmailKey, joinUrl } from './emailKeys';
import { renderConfirmedEmail } from './templates/confirmedEmail';

// Where a recipient's link points. An invite-page link carries the invite's bearer token, and
// recipients are stored as queue step output, so only the invite's id travels and the token is
// read from the database when the email is sent (ADR 0009: queue state holds ids, never secrets).
export type ConfirmationDestination =
  | { readonly kind: 'brunch' }
  | { readonly kind: 'invite'; readonly inviteId: InviteId };

export type ConfirmationRecipient = {
  // Stable per person for this brunch: part of the idempotency key and the queue step name.
  readonly key: string;
  readonly email: Email;
  readonly name: string | undefined;
  readonly destination: ConfirmationDestination;
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

export type SendConfirmationEmailOutcome = 'sent' | 'skipped_duplicate' | 'skipped_invite_gone';

export type SendConfirmationEmailError =
  | Exclude<EmailError, { readonly kind: 'already_sent' }>
  | { readonly kind: 'db_error'; readonly cause: unknown };

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

export async function sendConfirmationEmail(
  input: {
    readonly brunch: ConfirmedBrunchSummary;
    readonly recipient: ConfirmationRecipient;
  },
  ctx: {
    readonly db: DbClient;
    readonly emailService: EmailService;
    // Absolute base URL of the web app, used to build the link.
    readonly appUrl: string;
  },
): Promise<Result<SendConfirmationEmailOutcome, SendConfirmationEmailError>> {
  const { brunch, recipient } = input;

  let path: string;
  if (recipient.destination.kind === 'brunch') {
    path = `/brunch/${brunch.brunchId}`;
  } else {
    // The token is read now, not carried from when the recipients were listed: it may have
    // been rotated since, and a revoked or expired invite has nothing to link to.
    let invite;
    try {
      invite = await ctx.db.brunchInvite.findFirst({
        where: { id: recipient.destination.inviteId },
      });
    } catch (cause) {
      return err({ kind: 'db_error', cause });
    }
    if (invite === null || invite.tokenExpiresAt.getTime() <= Date.now()) {
      return ok('skipped_invite_gone');
    }
    path = `/invite/${invite.token}`;
  }

  const { subject, html } = renderConfirmedEmail({
    recipientName: recipient.name,
    hostName: brunch.hostName,
    brunchTitle: brunch.title,
    placeName: brunch.placeName,
    placeAddress: brunch.placeAddress,
    placeUrl: brunch.placeUrl,
    scheduledAt: brunch.scheduledAt,
    timezone: brunch.timezone,
    link: joinUrl({ base: ctx.appUrl, path }),
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
