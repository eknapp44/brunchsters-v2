import { expect, type Page } from '@playwright/test';

// The words of the front door and its edges (spec 0011 M5), in one place so a journey says what
// it means and a wording change is one edit. The landing page and the sign-in page share a
// headline (the prototype's), so a check for either also looks for something only that page has.

export const LANDING_HEADING = 'Your friends are hungry. Probably.';
export const SIGN_IN_HEADING = 'Your friends are hungry. Probably.';

// An invite that cannot be used: expired, revoked or unknown all say exactly this.
export const GONE_COLD = "That invite's gone cold.";
export const GONE_COLD_HELP = 'It may have expired. Ask whoever sent it to send a new one.';

// Every 404: a made-up address, a brunch that does not exist, a brunch the visitor is not in.
export const NOT_FOUND = "This table's empty.";

// A signed-out visitor on the landing page.
export async function expectLandingPage(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: LANDING_HEADING })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Round up the crew' })).toBeVisible();
}

// The sign-in page.
export async function expectSignInPage(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: SIGN_IN_HEADING })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
}

// What a friend sees from an invite link before signing in: who asked, and what for.
export async function expectInvitePreview(
  page: Page,
  invite: { readonly title: string; readonly hostName: string },
): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: invite.title })).toBeVisible();
  await expect(page.getByText(`${invite.hostName} wants you at brunch`)).toBeVisible();
}
