import type { BrunchId, Email } from '@brunchsters/shared';
import type { Locator, Page } from '@playwright/test';
import { getDb } from './db';
import { baseUrl } from './env';
import { getInviteToken } from './factories';

// The host's "Invites" list entry for one address, e.g. "guest@example.com — pending".
export function inviteRow(page: Page, email: string): Locator {
  return page.getByRole('listitem').filter({ hasText: email });
}

export function inviteLink(token: string): string {
  return `${baseUrl}/invite/${token}`;
}

export async function inviteLinkFor(params: {
  readonly brunchId: BrunchId;
  readonly email: Email;
}): Promise<string> {
  return inviteLink(await getInviteToken(params));
}

// There is no service that expires an invite early (only time does), so this reaches state
// directly: the token stays valid in every other respect.
export async function expireInvite(params: {
  readonly brunchId: BrunchId;
  readonly email: Email;
}): Promise<void> {
  const { count } = await getDb().brunchInvite.updateMany({
    where: { brunchId: params.brunchId, invitedEmail: params.email },
    data: { tokenExpiresAt: new Date(Date.now() - 60_000) },
  });
  if (count !== 1) throw new Error(`Expected to expire 1 invite, expired ${count}`);
}
