import { GONE_COLD } from '../support/pages';
import { normalizeEmail } from '@brunchsters/shared';
import { getDb } from '../support/db';
import { createBrunch, getInviteToken, uniqueSuffix } from '../support/factories';
import { expect, test } from '../support/fixtures';
import { inviteLink, inviteRow } from '../support/invites';
import { TOAST_WORDS } from '../support/toasts';
import { addAttendee } from '../support/voting';
import { BrunchWizard } from '../support/wizard';

// Journey I7 (spec 0007, ADR 0008): one email address is one person, however it is capitalized.
// Found by the e2e suite in spec 0006 M5: inviting `Case-X@Example.com` and later
// `case-x@example.com` used to create two invites, two links and two lines in the host's list.

const invitesFor = (brunchId: string, address: string) =>
  getDb().brunchInvite.count({
    where: { brunchId, invitedEmail: { equals: address, mode: 'insensitive' } },
  });

test.describe('I7 — one address, one person', () => {
  test('the same address typed in two cases is one invite with one working link', async ({
    makeActor,
    page,
  }) => {
    const host = await makeActor('host');
    const suffix = uniqueSuffix();
    const typedFirst = `Guest-${suffix}@Example.COM`;
    const typedLater = `guest-${suffix}@example.com`;
    const address = normalizeEmail(typedLater);
    const title = `Same Person Brunch ${suffix}`;
    const brunchId = await createBrunch({ host: host.user, title });
    const invite = async (typed: string): Promise<void> => {
      await host.page.getByLabel('Invite more people').fill(typed);
      await host.page.getByRole('button', { name: 'Round up the crew' }).click();
      await expect(host.page.getByLabel('Invite more people')).toHaveValue('');
    };

    await host.page.goto(`/brunch/${brunchId}`);
    await invite(typedFirst);
    await expect(inviteRow(host.page, address)).toHaveCount(1);
    const firstToken = await getInviteToken({ brunchId, email: address });

    await invite(typedLater);

    // The second request refreshed the one invite (a re-invite rotates its link); it did not add one.
    await expect.poll(() => getInviteToken({ brunchId, email: address })).not.toBe(firstToken);
    await host.page.reload();
    await expect(inviteRow(host.page, address)).toHaveCount(1);
    expect(await invitesFor(brunchId, address)).toBe(1);
    // Stored in the one canonical form, whichever way it was typed.
    const stored = await getDb().brunchInvite.findFirst({
      where: { brunchId, invitedEmail: address },
    });
    expect(stored?.invitedEmail).toBe(address);

    // One link works; the superseded one does not.
    await page.goto(inviteLink(firstToken));
    await expect(page.getByRole('heading', { name: GONE_COLD })).toBeVisible();
    await page.goto(inviteLink(await getInviteToken({ brunchId, email: address })));
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  });

  test('both spellings in one wizard submission are still one invite', async ({ makeActor }) => {
    const host = await makeActor('host');
    const wizard = new BrunchWizard(host.page);
    const suffix = uniqueSuffix();
    const typedFirst = `Pair-${suffix}@Example.com`;
    const typedLater = `pair-${suffix}@example.com`;

    await wizard.open();
    await wizard.fillWhat({ title: `Wizard Pair ${suffix}` });
    await wizard.next();
    await wizard.next();
    await wizard.addEmail(typedFirst);
    // Added by hand: the helper's case-insensitive text match would see two entries for one address.
    await host.page.getByRole('textbox', { name: 'Email address' }).fill(typedLater);
    await host.page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(host.page.getByRole('listitem')).toHaveCount(2);
    await wizard.create();

    await expect(host.page).toHaveURL(/\/brunch\/[0-9a-f-]{36}$/);
    const brunchId = host.page.url().split('/').pop() ?? '';
    await expect(inviteRow(host.page, typedLater)).toHaveCount(1);
    expect(await invitesFor(brunchId, typedLater)).toBe(1);
  });

  test('an existing account is recognized however the invited address is typed', async ({
    makeActor,
  }) => {
    const suffix = uniqueSuffix();
    const host = await makeActor('host');
    // Google reported a capitalized address; the account is stored lowercase.
    const invitee = await makeActor('capital', { providerEmail: `Capital-${suffix}@Example.COM` });
    const title = `Recognized Brunch ${suffix}`;
    const brunchId = await createBrunch({ host: host.user, title });

    // The host types it in yet another case.
    await host.page.goto(`/brunch/${brunchId}`);
    await host.page.getByLabel('Invite more people').fill(`CAPITAL-${suffix}@example.com`);
    await host.page.getByRole('button', { name: 'Round up the crew' }).click();
    await expect(inviteRow(host.page, invitee.user.email)).toContainText('pending');

    // The invite found the existing account, so the brunch is on their dashboard already,
    // without opening any link (the known-user path, not a stranger's invite).
    await invitee.page.goto('/dashboard');
    await expect(invitee.page.getByRole('link', { name: title })).toBeVisible();
    const invite = await getDb().brunchInvite.findFirst({
      where: { brunchId, invitedEmail: invitee.user.email },
    });
    expect(invite?.invitedUserId).toBe(invitee.user.id);
    expect(await invitesFor(brunchId, invitee.user.email)).toBe(1);
  });

  test('suggesting an address in another case is the same suggestion, and approving it does not add a second invite', async ({
    makeActor,
  }) => {
    const suffix = uniqueSuffix();
    const host = await makeActor('host');
    const attendee = await makeActor('attendee');
    const typedSuggestion = `Friend-${suffix}@Example.com`;
    const address = normalizeEmail(typedSuggestion);
    const brunchId = await createBrunch({ host: host.user });
    await addAttendee({ brunchId, host: host.user, user: attendee.user, response: 'yes' });

    // The host has already invited this person, in lowercase.
    await host.page.goto(`/brunch/${brunchId}`);
    await host.page.getByLabel('Invite more people').fill(address);
    await host.page.getByRole('button', { name: 'Round up the crew' }).click();
    await expect(inviteRow(host.page, address)).toContainText('pending');

    // The attendee suggests the same person with capitals; a second suggestion in a third
    // spelling is refused as a repeat.
    const suggest = async (typed: string): Promise<void> => {
      await attendee.page.getByLabel('Suggest someone').fill(typed);
      await attendee.page.getByRole('button', { name: 'Suggest this person' }).click();
    };
    await attendee.page.goto(`/brunch/${brunchId}`);
    await suggest(typedSuggestion);
    await expect(attendee.page.getByLabel('Suggest someone')).toHaveValue('');
    await suggest(`FRIEND-${suffix}@EXAMPLE.COM`);
    await expect(
      attendee.page.getByRole('alert').filter({ hasText: TOAST_WORDS.alreadyThere }),
    ).toBeVisible();
    expect(
      await getDb().brunchInviteSuggestion.count({
        where: { brunchId, suggestedEmail: address },
      }),
    ).toBe(1);

    // Approving it refreshes the existing invite; it does not create another person.
    await host.page.reload();
    const suggestionRow = host.page.getByRole('listitem').filter({ hasText: 'suggested by' });
    await expect(suggestionRow).toHaveCount(1);
    await suggestionRow.getByRole('button', { name: 'Approve' }).click();
    await expect(suggestionRow).toHaveCount(0);
    expect(await invitesFor(brunchId, address)).toBe(1);
    await expect(inviteRow(host.page, address)).toHaveCount(1);
  });
});
