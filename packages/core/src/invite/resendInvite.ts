import type { DbClient } from '@brunchsters/database';
import type { InviteId, UserId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import type { EventBus } from '../events/EventBus';

const INVITE_EXPIRY_DAYS = 30;

export type ResendInviteInput = {
  readonly inviteId: InviteId;
  readonly requestedById: UserId;
};

export type ResendInviteError =
  | { readonly kind: 'invite_not_found' }
  | { readonly kind: 'not_host' }
  | { readonly kind: 'db_error'; readonly cause: unknown };

type ResendInviteContext = {
  readonly db: DbClient;
  readonly eventBus: EventBus;
};

export async function resendInvite(
  input: ResendInviteInput,
  ctx: ResendInviteContext,
): Promise<Result<{ id: InviteId }, ResendInviteError>> {
  const { db, eventBus } = ctx;

  const invite = await db.brunchInvite.findFirst({
    where: { id: input.inviteId },
    include: { brunch: true },
  });
  if (invite === null) return err({ kind: 'invite_not_found' });
  if (invite.brunch.hostId !== input.requestedById) return err({ kind: 'not_host' });

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
    await eventBus.emit('invite/resent', { inviteId: updatedId, brunchId: invite.brunchId });
  } catch {
    // Side effects must never fail the resend (Constitution 12).
  }

  return ok({ id: updatedId });
}
