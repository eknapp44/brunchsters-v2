import type { DbClient } from '@brunchsters/database';
import type { Email, InviteId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import type { EmailError, EmailService } from './EmailService';
import { inviteEmailKey, joinUrl } from './emailKeys';
import { renderInviteEmail } from './templates/inviteEmail';

export type SendInviteEmailInput = { readonly inviteId: InviteId };

export type SendInviteEmailContext = {
  readonly db: DbClient;
  readonly emailService: EmailService;
  // Absolute base URL of the web app, used to build the invite link.
  readonly appUrl: string;
};

export type SendInviteEmailOutcome =
  | 'sent'
  | 'skipped_gone'
  | 'skipped_revoked'
  | 'skipped_expired'
  | 'skipped_host'
  // The provider says this exact send already happened (idempotency key seen before).
  | 'skipped_duplicate';

export type SendInviteEmailError =
  | Exclude<EmailError, { readonly kind: 'already_sent' }>
  | { readonly kind: 'db_error'; readonly cause: unknown };

// Runs from a queued event, possibly long after the invite was created and possibly
// twice. Everything is read fresh by id: the invite may have been revoked, expired or
// had its token rotated since the event was emitted, and the current token is the
// only one worth sending. Skips are Ok outcomes, not errors, so a queue does not
// retry something that can never succeed.
export async function sendInviteEmail(
  input: SendInviteEmailInput,
  ctx: SendInviteEmailContext,
): Promise<Result<SendInviteEmailOutcome, SendInviteEmailError>> {
  let invite;
  try {
    // findUnique, unlike findFirst, sees soft-deleted rows: a revoked invite is a
    // different answer from one that never existed.
    invite = await ctx.db.brunchInvite.findUnique({
      where: { id: input.inviteId },
      include: { brunch: { include: { host: true } } },
    });
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }

  if (invite === null || invite.brunch.deletedAt !== null) return ok('skipped_gone');
  if (invite.deletedAt !== null) return ok('skipped_revoked');
  if (invite.invitedEmail.toLowerCase() === invite.brunch.host.email.toLowerCase()) {
    return ok('skipped_host');
  }
  if (invite.tokenExpiresAt.getTime() <= Date.now()) return ok('skipped_expired');

  const { subject, html } = renderInviteEmail({
    hostName: invite.brunch.host.name,
    brunchTitle: invite.brunch.title,
    description: invite.brunch.description ?? undefined,
    link: joinUrl({ base: ctx.appUrl, path: `/invite/${invite.token}` }),
    linkExpiresAt: invite.tokenExpiresAt,
  });

  const sent = await ctx.emailService.send({
    to: invite.invitedEmail as Email,
    subject,
    html,
    idempotencyKey: await inviteEmailKey({ inviteId: input.inviteId, token: invite.token }),
  });
  if (sent.isErr()) {
    if (sent.error.kind === 'already_sent') return ok('skipped_duplicate');
    return err(sent.error);
  }

  return ok('sent');
}
