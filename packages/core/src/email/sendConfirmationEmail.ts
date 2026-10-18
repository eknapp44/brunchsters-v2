import type { DbClient } from '@brunchsters/database';
import { err, ok, type Result } from 'neverthrow';
import type {
  ConfirmationRecipient,
  ConfirmedBrunchSummary,
  SendConfirmationEmailError,
  SendConfirmationEmailOutcome,
} from './confirmationTypes';
import type { EmailService } from './EmailService';
import { confirmedEmailKey, joinUrl } from './emailKeys';
import { renderConfirmedEmail } from './templates/confirmedEmail';

// One recipient's confirmation. Skips are Ok outcomes, not errors, so a queue does not retry
// something that can never succeed: a revoked or expired invite has nothing to link to, the
// provider may already have this exact send, and a permanently rejected address is recorded
// rather than ending the run for the people after them.
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
    if (sent.error.kind === 'invalid_address') return ok('skipped_invalid_address');
    return err(sent.error);
  }

  return ok('sent');
}
