import type { DbClient } from '@brunchsters/database';
import type { InviteId, UserId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';

export type RevokeInviteInput = {
  readonly inviteId: InviteId;
  readonly requestedById: UserId;
};

export type RevokeInviteError =
  | { readonly kind: 'invite_not_found' }
  | { readonly kind: 'not_host' }
  | { readonly kind: 'db_error'; readonly cause: unknown };

export async function revokeInvite(
  input: RevokeInviteInput,
  ctx: { readonly db: DbClient },
): Promise<Result<{ id: InviteId }, RevokeInviteError>> {
  const invite = await ctx.db.brunchInvite.findFirst({
    where: { id: input.inviteId },
    include: { brunch: true },
  });
  if (invite === null) return err({ kind: 'invite_not_found' });
  if (invite.brunch.hostId !== input.requestedById) return err({ kind: 'not_host' });

  try {
    await ctx.db.$transaction(async (tx) => {
      await tx.brunchInvite.update({
        where: { id: input.inviteId },
        data: { deletedAt: new Date(), deletedBy: input.requestedById },
      });

      // A known-user invitee gets a BrunchAttendee row eagerly at send time
      // (before they ever click the link) — without also revoking that row,
      // they'd keep full brunch access via getBrunchById's attendee check
      // despite the invite itself being revoked. updateMany is a safe no-op
      // for unregistered invitees, who have no attendee row yet.
      await tx.brunchAttendee.updateMany({
        where: { inviteId: input.inviteId },
        data: { deletedAt: new Date(), deletedBy: input.requestedById },
      });
    });
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }

  return ok({ id: input.inviteId });
}
