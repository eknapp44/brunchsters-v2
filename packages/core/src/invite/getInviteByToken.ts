import type { DbClient } from '@brunchsters/database';
import type { InviteToken } from '@brunchsters/shared';
import { assertBrunchOpen } from '../brunch/guards/assertBrunchOpen';

export type InvitePreview = {
  readonly brunchTitle: string;
  readonly hostName: string;
  // Already in the invite email, so a link-holder learns nothing new from it.
  readonly description: string | undefined;
  readonly brunchStatusLabel: string;
  // The host called the brunch off (spec 0013). The page says so instead of offering to join; the
  // holder already knows the title and host from the same preview, so this tells them nothing an
  // outsider could use (someone with no token still gets nothing).
  readonly isCalledOff: boolean;
};

// Deliberately minimal: no attendee list, no other invitees' emails (Constitution
// 29 — email is identity, not contact info). undefined for any invalid state —
// expired, revoked, or nonexistent — so a bad token can't distinguish those cases.
export async function getInviteByToken(
  token: InviteToken,
  ctx: { readonly db: DbClient },
): Promise<InvitePreview | undefined> {
  const invite = await ctx.db.brunchInvite.findFirst({
    // The soft-delete extension covers only the top-level model, so a deleted brunch must be
    // excluded here: its link is as dead as a revoked one.
    where: { token, tokenExpiresAt: { gt: new Date() }, brunch: { deletedAt: null } },
    include: { brunch: { include: { status: true, host: true } } },
  });
  if (invite === null) return undefined;

  return {
    brunchTitle: invite.brunch.title,
    hostName: invite.brunch.host.name,
    description: invite.brunch.description ?? undefined,
    brunchStatusLabel: invite.brunch.status.label,
    isCalledOff: assertBrunchOpen(invite.brunch).isErr(),
  };
}
