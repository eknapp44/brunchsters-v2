import type { DbClient } from '@brunchsters/database';
import type { BrunchId, InviteId, UserId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';

export type InviteStatus = 'pending' | 'yes' | 'no' | 'maybe';

export type InviteListItem = {
  readonly id: InviteId;
  readonly invitedEmail: string;
  readonly status: InviteStatus;
  readonly lastResentAt: Date | undefined;
};

export type GetInvitesForBrunchInput = {
  readonly brunchId: BrunchId;
  readonly requestedById: UserId;
};

export type GetInvitesForBrunchError =
  | { readonly kind: 'brunch_not_found' }
  | { readonly kind: 'not_host' };

function toInviteStatus(rsvpStatusCode: string | undefined): InviteStatus {
  return rsvpStatusCode === 'yes' || rsvpStatusCode === 'no' || rsvpStatusCode === 'maybe'
    ? rsvpStatusCode
    : 'pending';
}

// Host-only. Excludes the synthetic self-invite created on brunch creation
// (identified by invitedEmail matching the host's own email) — the host
// shouldn't see themselves in "who did I invite".
export async function getInvitesForBrunch(
  input: GetInvitesForBrunchInput,
  ctx: { readonly db: DbClient },
): Promise<Result<readonly InviteListItem[], GetInvitesForBrunchError>> {
  const brunch = await ctx.db.brunch.findFirst({
    where: { id: input.brunchId },
    include: { host: true },
  });
  if (brunch === null) return err({ kind: 'brunch_not_found' });
  if (brunch.hostId !== input.requestedById) return err({ kind: 'not_host' });

  const invites = await ctx.db.brunchInvite.findMany({
    where: { brunchId: input.brunchId, invitedEmail: { not: brunch.host.email } },
    include: { attendee: { include: { rsvpStatus: true } } },
    orderBy: { createdAt: 'asc' },
  });

  return ok(
    invites.map((invite) => ({
      id: invite.id as InviteId,
      invitedEmail: invite.invitedEmail,
      status: toInviteStatus(invite.attendee?.rsvpStatus.code),
      lastResentAt: invite.lastResentAt ?? undefined,
    })),
  );
}
