import type { DbClient } from '@brunchsters/database';
import type { InviteToken } from '@brunchsters/shared';

export type InvitePreview = {
  readonly brunchTitle: string;
  readonly hostName: string;
  readonly brunchStatusLabel: string;
};

// Deliberately minimal: no attendee list, no other invitees' emails (Constitution
// 29 — email is identity, not contact info). undefined for any invalid state —
// expired, revoked, or nonexistent — so a bad token can't distinguish those cases.
export async function getInviteByToken(
  token: InviteToken,
  ctx: { readonly db: DbClient },
): Promise<InvitePreview | undefined> {
  const invite = await ctx.db.brunchInvite.findFirst({
    where: { token, tokenExpiresAt: { gt: new Date() } },
    include: { brunch: { include: { status: true, host: true } } },
  });
  if (invite === null) return undefined;

  return {
    brunchTitle: invite.brunch.title,
    hostName: invite.brunch.host.name,
    brunchStatusLabel: invite.brunch.status.label,
  };
}
