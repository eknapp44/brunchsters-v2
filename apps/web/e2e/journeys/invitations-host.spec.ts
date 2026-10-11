import type { Email } from '@brunchsters/shared';
import { getDb } from '../support/db';
import {
  createBrunch,
  getInviteToken,
  inviteToBrunch,
  respondToInvite,
  uniqueSuffix,
} from '../support/factories';
import { expect, test } from '../support/fixtures';
import { expireInvite, inviteLink, inviteLinkFor, inviteRow } from '../support/invites';
import { BrunchWizard } from '../support/wizard';

// Journeys I1, I3, I4 and I6a — the host's half of spec 0004.

const newEmail = (label: string): Email => `${label}-${uniqueSuffix()}@example.com` as Email;

test.describe('I1 — the host’s invite list', () => {
  test('shows each invitee’s status, and its copy button yields the real invite link', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const answered = await makeActor('answered');
    const silent = newEmail('silent');
    const brunchId = await createBrunch({ host: host.user });
    // One invitee with an account who has answered, one address nobody has signed in with yet.
    await inviteToBrunch({
      brunchId,
      host: host.user,
      invitees: [answered.user, { email: silent }],
    });
    await respondToInvite({ brunchId, user: answered.user, response: 'yes' });

    await host.page.goto(`/brunch/${brunchId}`);
    await expect(inviteRow(host.page, answered.user.email)).toContainText('yes');
    await expect(inviteRow(host.page, silent)).toContainText('pending');

    await host.context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await inviteRow(host.page, silent).getByRole('button', { name: 'Copy link' }).click();
    await expect(
      inviteRow(host.page, silent).getByRole('button', { name: 'Copied!' }),
    ).toBeVisible();
    const copied = await host.page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(await inviteLinkFor({ brunchId, email: silent }));
  });
});

test.describe('I3 — inviting more people later', () => {
  test('the first invite turns a draft brunch active; later ones join the list', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const first = newEmail('first');
    const second = newEmail('second');
    const brunchId = await createBrunch({ host: host.user });

    await host.page.goto(`/brunch/${brunchId}`);
    await expect(host.page.getByText('Draft', { exact: true })).toBeVisible();
    await expect(host.page.getByText('No invites sent yet.')).toBeVisible();

    await host.page.getByLabel('Invite more people').fill(first);
    await host.page.getByRole('button', { name: 'Send Invite' }).click();
    await expect(inviteRow(host.page, first)).toContainText('pending');
    await expect(host.page.getByText('Active', { exact: true })).toBeVisible();
    // The input is cleared, ready for the next one.
    await expect(host.page.getByLabel('Invite more people')).toHaveValue('');

    await host.page.getByLabel('Invite more people').fill(second);
    await host.page.getByRole('button', { name: 'Send Invite' }).click();
    await expect(inviteRow(host.page, second)).toContainText('pending');
    await expect(inviteRow(host.page, first)).toContainText('pending');
  });
});

test.describe('I4 — links that stop working', () => {
  test('a revoked invite disappears from the list and its link reveals nothing', async ({
    makeActor,
    page,
  }) => {
    const host = await makeActor('host');
    const invitee = newEmail('revoked');
    const title = `Secret Brunch ${uniqueSuffix()}`;
    const brunchId = await createBrunch({ host: host.user, title });
    await inviteToBrunch({ brunchId, host: host.user, invitees: [{ email: invitee }] });
    const link = await inviteLinkFor({ brunchId, email: invitee });

    await host.page.goto(`/brunch/${brunchId}`);
    await inviteRow(host.page, invitee).getByRole('button', { name: 'Revoke' }).click();
    await expect(inviteRow(host.page, invitee)).toHaveCount(0);

    await page.goto(link);
    await expect(page.getByRole('heading', { name: 'Invite not found' })).toBeVisible();
    await expect(page.getByText('This invite has expired or is invalid.')).toBeVisible();
    await expect(page.getByText(title)).toHaveCount(0);
    await expect(page.getByText(host.user.name)).toHaveCount(0);
  });

  test('an expired invite is dead until the host resends it, which also retires the old link', async ({
    makeActor,
    page,
  }) => {
    const host = await makeActor('host');
    const invitee = newEmail('expired');
    const title = `Late Brunch ${uniqueSuffix()}`;
    const brunchId = await createBrunch({ host: host.user, title });
    await inviteToBrunch({ brunchId, host: host.user, invitees: [{ email: invitee }] });
    const oldLink = await inviteLinkFor({ brunchId, email: invitee });
    await expireInvite({ brunchId, email: invitee });

    await page.goto(oldLink);
    await expect(page.getByRole('heading', { name: 'Invite not found' })).toBeVisible();
    await expect(page.getByText(title)).toHaveCount(0);

    await host.page.goto(`/brunch/${brunchId}`);
    await inviteRow(host.page, invitee).getByRole('button', { name: 'Resend' }).click();
    // The list re-renders after the resend; the stored token changes.
    await expect
      .poll(async () => inviteLink(await getInviteToken({ brunchId, email: invitee })))
      .not.toBe(oldLink);

    await page.goto(oldLink);
    await expect(page.getByRole('heading', { name: 'Invite not found' })).toBeVisible();

    const newLink = await inviteLinkFor({ brunchId, email: invitee });
    await page.goto(newLink);
    await expect(page.getByRole('heading', { name: `You're invited to ${title}` })).toBeVisible();
  });

  test('a made-up token is the same "not found" page', async ({ page }) => {
    await page.goto('/invite/00000000-0000-4000-8000-000000000000');

    await expect(page.getByRole('heading', { name: 'Invite not found' })).toBeVisible();
  });
});

test.describe('I6a — historic bug: the host invites themselves', () => {
  test('the rest of the batch still goes out and the host is not listed as an invitee', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const wizard = new BrunchWizard(host.page);
    const guest = newEmail('guest');
    const title = `Self Invite Brunch ${uniqueSuffix()}`;

    await wizard.open();
    await wizard.fillWhat({ title });
    await wizard.next(); // places: none
    await wizard.next(); // times: none
    // Spec 0004 M5: an own address in the batch used to reject the whole thing, silently.
    await wizard.addEmail(host.user.email);
    await wizard.addEmail(guest);
    // The same address in another case must not matter either. Added by hand: the helper's
    // case-insensitive text match would see two entries for one address.
    await host.page
      .getByRole('textbox', { name: 'Email address' })
      .fill(host.user.email.toUpperCase());
    await host.page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(host.page.getByRole('listitem')).toHaveCount(3);
    await wizard.create();

    await expect(host.page).toHaveURL(/\/brunch\/[0-9a-f-]{36}$/);
    await expect(inviteRow(host.page, guest)).toContainText('pending');
    await expect(inviteRow(host.page, host.user.email)).toHaveCount(0);
    await expect(host.page.getByText('Active', { exact: true })).toBeVisible();

    // One invite for the guest, plus the host's own built-in one: nothing duplicated.
    const brunchId = host.page.url().split('/').pop() ?? '';
    const invites = await getDb().brunchInvite.findMany({ where: { brunchId } });
    expect(invites.map((invite) => invite.invitedEmail).sort()).toEqual(
      [guest, host.user.email].sort(),
    );
  });
});
