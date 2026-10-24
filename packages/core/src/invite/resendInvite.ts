import type { DbClient } from '@brunchsters/database';
import {
  RATE_LIMIT_POLICIES,
  type BrunchId,
  type InviteId,
  type UserId,
} from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import type { EventBus } from '../events/EventBus';
import { assertBrunchOpen, type AssertBrunchOpenError } from '../brunch/guards/assertBrunchOpen';
import { isBrunchMember } from '../brunch/guards/isBrunchMember';
import {
  consumeBudgets,
  type RateLimited,
  type RateLimiterUnavailable,
} from '../rateLimit/consumeBudgets';
import type { RateLimiter } from '../rateLimit/RateLimiter';

const INVITE_EXPIRY_DAYS = 30;

export type ResendInviteInput = {
  readonly inviteId: InviteId;
  readonly requestedById: UserId;
};

export type ResendInviteError =
  | { readonly kind: 'invite_not_found' }
  | { readonly kind: 'not_host' }
  | AssertBrunchOpenError
  | RateLimited
  | RateLimiterUnavailable
  | { readonly kind: 'db_error'; readonly cause: unknown };

type ResendInviteContext = {
  readonly db: DbClient;
  readonly eventBus: EventBus;
  readonly rateLimiter: RateLimiter;
};

export async function resendInvite(
  input: ResendInviteInput,
  ctx: ResendInviteContext,
): Promise<Result<{ id: InviteId }, ResendInviteError>> {
  const { db, eventBus } = ctx;

  const invite = await db.brunchInvite.findFirst({
    // A deleted brunch's invites are gone with it (the extension filters only this model).
    where: { id: input.inviteId, brunch: { deletedAt: null } },
    include: { brunch: { include: { status: true } } },
  });
  if (invite === null) return err({ kind: 'invite_not_found' });
  if (invite.brunch.hostId !== input.requestedById) {
    // A member may know the invite exists; anyone else gets the same answer as for a made-up id.
    const member = await isBrunchMember(
      { brunchId: invite.brunchId as BrunchId, userId: input.requestedById },
      ctx,
    );
    return err({ kind: member ? 'not_host' : 'invite_not_found' });
  }

  // After the host check; before the budgets, so a refused resend costs nothing and sends nothing.
  const openResult = assertBrunchOpen(invite.brunch);
  if (openResult.isErr()) return err(openResult.error);

  // A resend is an email: once per invite per window, and it spends one of the host's daily invite
  // emails. After the host check, so only a host reaches a budget that names an invite (ADR 0013).
  const spent = await consumeBudgets({
    limiter: ctx.rateLimiter,
    spends: [
      { policy: RATE_LIMIT_POLICIES.resendPerInvite, subject: input.inviteId },
      { policy: RATE_LIMIT_POLICIES.inviteEmailsPerHost, subject: input.requestedById },
    ],
  });
  if (spent.isErr()) return err(spent.error);

  let updatedId: InviteId;
  try {
    const updated = await db.brunchInvite.update({
      where: { id: input.inviteId },
      data: {
        token: crypto.randomUUID(),
        tokenExpiresAt: new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
        lastResentAt: new Date(),
      },
    });
    updatedId = updated.id as InviteId;
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }

  try {
    await eventBus.emit('invite/resent', {
      inviteId: updatedId,
      brunchId: invite.brunchId as BrunchId,
    });
  } catch {
    // Side effects must never fail the resend (Constitution 12).
  }

  return ok({ id: updatedId });
}
