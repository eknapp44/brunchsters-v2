import type { Email } from '@brunchsters/shared';
import { getDb } from '../support/db';
import {
  createBrunch,
  createUser,
  getInviteToken,
  inviteToBrunch,
  respondToInvite,
  uniqueSuffix,
} from '../support/factories';
import { expect, test } from '../support/fixtures';
import { inviteLink, inviteLinkFor, inviteRow } from '../support/invites';
import { mintSessionCookie } from '../support/session';

// Journeys I2, A3 and I6b — the invitee's half of spec 0004 (and spec 0002's invite sign-in path).

const newEmail = (label: string): Email => `${label}-${uniqueSuffix()}@example.com` as Email;
const BRUNCH_URL = /\/brunch\/[0-9a-f-]{36}$/;

test.describe('I2 — an existing user follows an invite link', () => {
  test('lands on the brunch already going, changes their answer, and the host sees it', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const guest = await makeActor('guest');
    const title = `Invited Brunch ${uniqueSuffix()}`;
    const brunchId = await createBrunch({ host: host.user, title });
    await inviteToBrunch({ brunchId, host: host.user, invitees: [guest.user] });

    // Before they open the link, the host sees an unanswered invite.
    await host.page.goto(`/brunch/${brunchId}`);
    await expect(inviteRow(host.page, guest.user.email)).toContainText('pending');

    await guest.page.goto(await inviteLinkFor({ brunchId, email: guest.user.email }));
    await expect(guest.page).toHaveURL(`/brunch/${brunchId}`);
    await expect(guest.page.getByRole('heading', { name: title })).toBeVisible();
    // Following the link accepts the invite...
    await expect(guest.page.getByText('Current: yes')).toBeVisible();

    // ...and the RSVP control is where they change their mind.
    await guest.page.getByRole('button', { name: 'maybe', exact: true }).click();
    await expect(guest.page.getByText('Current: maybe')).toBeVisible();

    await host.page.reload();
    await expect(inviteRow(host.page, guest.user.email)).toContainText('maybe');

    await guest.page.getByRole('button', { name: 'no', exact: true }).click();
    await expect(guest.page.getByText('Current: no')).toBeVisible();
    await host.page.reload();
    await expect(inviteRow(host.page, guest.user.email)).toContainText('no');
  });
});

test.describe('A3 — a newcomer follows an invite link while signed out', () => {
  test('sees a preview with nothing private, is sent to sign in, and is accepted when they return', async ({
    makeActor,
    page,
  }) => {
    const host = await makeActor('host');
    const newcomerEmail = newEmail('newcomer');
    const bystander = newEmail('bystander');
    const title = `Preview Brunch ${uniqueSuffix()}`;
    const brunchId = await createBrunch({ host: host.user, title });
    await inviteToBrunch({
      brunchId,
      host: host.user,
      invitees: [{ email: newcomerEmail }, { email: bystander }],
    });
    const token = await getInviteToken({ brunchId, email: newcomerEmail });

    await page.goto(inviteLink(token));

    // A preview: what the brunch is and who is hosting it...
    await expect(page.getByRole('heading', { name: `You're invited to ${title}` })).toBeVisible();
    await expect(page.getByText(`Hosted by ${host.user.name}`)).toBeVisible();
    await expect(page.getByText('Active', { exact: true })).toBeVisible();
    // ...and nothing else: no other invitee, no host email (Constitution 29).
    await expect(page.locator('body')).not.toContainText(bystander);
    await expect(page.locator('body')).not.toContainText(host.user.email);
    await expect(page.locator('body')).not.toContainText(newcomerEmail);

    // The sign-in link remembers where they were going.
    const signIn = page.getByRole('link', { name: 'Sign in with Google' });
    await expect(signIn).toHaveAttribute(
      'href',
      `/sign-in?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`,
    );
    await signIn.click();
    await expect(page).toHaveURL(/\/sign-in\?callbackUrl=/);
    await expect(page.locator('input[name="callbackUrl"]')).toHaveValue(`/invite/${token}`);

    // Google's own screen cannot be driven (ADR 0007), so resume as the sign-in would have
    // left them: an account for that address, with a session.
    const newcomer = await createUser({ label: 'newcomer', email: newcomerEmail });
    await page.context().addCookies([await mintSessionCookie(newcomer)]);
    await page.goto(inviteLink(token));

    await expect(page).toHaveURL(BRUNCH_URL);
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByText('Current: yes')).toBeVisible();

    await host.page.goto(`/brunch/${brunchId}`);
    await expect(inviteRow(host.page, newcomerEmail)).toContainText('yes');
    // Only the person who followed their link was accepted.
    await expect(inviteRow(host.page, bystander)).toContainText('pending');
  });
});

test.describe('I6b — historic bug: following a link when you already belong', () => {
  test('the host opening one of their own invite links is taken to the brunch, and nothing changes', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const guest = newEmail('guest');
    const title = `Own Link Brunch ${uniqueSuffix()}`;
    const brunchId = await createBrunch({ host: host.user, title });
    await inviteToBrunch({ brunchId, host: host.user, invitees: [{ email: guest }] });

    // Spec 0004 M5: this used to crash on a uniqueness collision with the host's own row.
    await host.page.goto(await inviteLinkFor({ brunchId, email: guest }));

    await expect(host.page).toHaveURL(`/brunch/${brunchId}`);
    await expect(host.page.getByRole('heading', { name: title })).toBeVisible();
    await expect(host.page.getByText('Current: yes')).toBeVisible();
    // The host's visit did not consume the guest's invite.
    await expect(inviteRow(host.page, guest)).toContainText('pending');
  });

  test('an attendee opening someone else’s invite link is taken to the brunch, keeping their answer', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const member = await makeActor('member');
    const other = newEmail('other');
    const brunchId = await createBrunch({ host: host.user });
    await inviteToBrunch({ brunchId, host: host.user, invitees: [member.user, { email: other }] });
    await respondToInvite({ brunchId, user: member.user, response: 'maybe' });

    await member.page.goto(await inviteLinkFor({ brunchId, email: other }));

    await expect(member.page).toHaveURL(`/brunch/${brunchId}`);
    await expect(member.page.getByText('Current: maybe')).toBeVisible();

    await host.page.goto(`/brunch/${brunchId}`);
    await expect(inviteRow(host.page, other)).toContainText('pending');
    await expect(inviteRow(host.page, member.user.email)).toContainText('maybe');
    // Still exactly one attendee row for the member.
    const rows = await getDb().brunchAttendee.count({
      where: { brunchId, userId: member.user.id },
    });
    expect(rows).toBe(1);
  });
});
