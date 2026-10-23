import type { DbClient } from '@brunchsters/database';
import type { BrunchId, InviteId, UserId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import { assertBrunchOpen, type AssertBrunchOpenError } from '../brunch/guards/assertBrunchOpen';
import { isBrunchMember } from '../brunch/guards/isBrunchMember';

export type RevokeInviteInput = {
  readonly inviteId: InviteId;
  readonly requestedById: UserId;
};

export type RevokeInviteError =
  | { readonly kind: 'invite_not_found' }
  | { readonly kind: 'not_host' }
  | AssertBrunchOpenError
  | { readonly kind: 'db_error'; readonly cause: unknown };

export async function revokeInvite(
  input: RevokeInviteInput,
  ctx: { readonly db: DbClient },
): Promise<Result<{ id: InviteId }, RevokeInviteError>> {
  const invite = await ctx.db.brunchInvite.findFirst({
    where: { id: input.inviteId },
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

  const openResult = assertBrunchOpen(invite.brunch);
  if (openResult.isErr()) return err(openResult.error);

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
