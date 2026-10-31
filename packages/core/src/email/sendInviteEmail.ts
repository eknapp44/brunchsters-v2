import type { DbClient } from '@brunchsters/database';
import type { BrunchId, Email, InviteId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import type { EmailSendFailure, EmailService } from './EmailService';
import { inviteEmailKey, joinUrl } from './emailKeys';
import { clearInviteEmailFailure } from '../invite/inviteEmailFailure';
import { emailAllowed } from './emailAllowed';
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
  // The invited person has an account and turned this email off (spec 0015). Silent: never shown to
  // the host as "didn't go out", or the host could tell who opted out.
  | 'skipped_by_preference'
  // The provider says this exact send already happened (idempotency key seen before).
  | 'skipped_duplicate';

export type SendInviteEmailError =
  | EmailSendFailure
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

  // The invite and its link still exist, and the in-app row is still written; only the email is
  // the person's to refuse.
  const allowed = await emailAllowed(
    {
      email: invite.invitedEmail as Email,
      type: 'invite.received',
      brunchId: invite.brunchId as BrunchId,
    },
    ctx,
  );
  if (allowed.isErr()) return err(allowed.error);
  if (!allowed.value) {
    // The person has chosen not to get it, so an earlier failure (which the host was told about) is no
    // longer the state of this invite: the flag and the host's rows go, silently, like any other skip.
    // Leaving them would show the host "didn't go through" and "Try Resend" for an email that now
    // can never go, and a resend would only be skipped again.
    const cleared = await clearInviteEmailFailure({ inviteId: input.inviteId }, ctx);
    if (cleared.isErr()) return err(cleared.error);
    return ok('skipped_by_preference');
  }

  const { subject, html } = renderInviteEmail({
    hostName: invite.brunch.host.name,
    brunchTitle: invite.brunch.title,
    description: invite.brunch.description ?? undefined,
    link: joinUrl({ base: ctx.appUrl, path: `/invite/${invite.token}` }),
    linkExpiresAt: invite.tokenExpiresAt,
    settingsUrl: joinUrl({ base: ctx.appUrl, path: '/settings/notifications' }),
  });

  const sent = await ctx.emailService.send({
    to: invite.invitedEmail as Email,
    subject,
    html,
    idempotencyKey: await inviteEmailKey({ inviteId: input.inviteId, token: invite.token }),
  });
  if (sent.isErr() && sent.error.kind !== 'already_sent') return err(sent.error);

  // An email for this invite is out (or the provider already had this very one): a failure the host
  // was told about is over, so the flag and the host's rows about it go (spec 0015).
  const cleared = await clearInviteEmailFailure({ inviteId: input.inviteId }, ctx);
  if (cleared.isErr()) return err(cleared.error);

  return ok(sent.isErr() ? 'skipped_duplicate' : 'sent');
}
