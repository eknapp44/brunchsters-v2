import type { DbClient } from '@brunchsters/database';
import type { BrunchId, NotificationTypeCode } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import { emailAllowed } from './emailAllowed';
import type {
  ConfirmationRecipient,
  SendConfirmationEmailError,
  SendConfirmationEmailOutcome,
} from './confirmationTypes';
import type { EmailService } from './EmailService';
import { joinUrl } from './emailKeys';
import type { RenderedEmail } from './templates/layout';

// One recipient's email about a brunch, shared by the confirmation, called-off and back-on emails.
// Skips are Ok outcomes, not errors, so a queue does not retry something that can never succeed: a
// revoked or expired invite has nothing to link to, the provider may already have this exact send,
// and a permanently rejected address is recorded rather than ending the run for the people after
// them. The caller supplies the content (given the link) and the idempotency key.
//
// This is the one place these emails reach `emailService.send`; `emailBudgets.test.ts` checks that
// only the three sender files call it.
export async function sendToRecipient(
  input: {
    readonly brunchId: BrunchId;
    readonly recipient: ConfirmationRecipient;
    readonly idempotencyKey: string;
    // Which notification type this email is, for the person's preference and mute (spec 0015).
    readonly type: Extract<
      NotificationTypeCode,
      'brunch.confirmed' | 'brunch.cancelled' | 'brunch.reinstated'
    >;
    // The words, given the links: where the email goes, how to mute this brunch (only for someone
    // already in it) and the settings page.
    readonly render: (links: {
      readonly link: string;
      readonly muteUrl: string | undefined;
      readonly settingsUrl: string;
    }) => RenderedEmail;
  },
  ctx: {
    readonly db: DbClient;
    readonly emailService: EmailService;
    // Absolute base URL of the web app, used to build the link.
    readonly appUrl: string;
  },
): Promise<Result<SendConfirmationEmailOutcome, SendConfirmationEmailError>> {
  const { recipient } = input;

  // A person's own choice comes first and is silent: asked before anything else is read.
  const allowed = await emailAllowed(
    { email: recipient.email, type: input.type, brunchId: input.brunchId },
    ctx,
  );
  if (allowed.isErr()) return err(allowed.error);
  if (!allowed.value) return ok('skipped_by_preference');

  let path: string;
  if (recipient.destination.kind === 'brunch') {
    path = `/brunch/${input.brunchId}`;
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

  const { subject, html } = input.render({
    link: joinUrl({ base: ctx.appUrl, path }),
    // Someone with no account yet cannot mute a brunch they have not joined.
    muteUrl:
      recipient.destination.kind === 'brunch'
        ? joinUrl({ base: ctx.appUrl, path: `/brunch/${input.brunchId}#notifications` })
        : undefined,
    settingsUrl: joinUrl({ base: ctx.appUrl, path: '/settings/notifications' }),
  });

  const sent = await ctx.emailService.send({
    to: recipient.email,
    subject,
    html,
    idempotencyKey: input.idempotencyKey,
  });
  if (sent.isErr()) {
    if (sent.error.kind === 'already_sent') return ok('skipped_duplicate');
    if (sent.error.kind === 'invalid_address') return ok('skipped_invalid_address');
    return err(sent.error);
  }

  return ok('sent');
}
