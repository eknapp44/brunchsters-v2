import type { BrunchId, Email } from '@brunchsters/shared';
import { getDb } from '../support/db';
import { createBrunch, inviteToBrunch, respondToInvite, uniqueSuffix } from '../support/factories';
import { expect, test, type Actor } from '../support/fixtures';
import { inviteRow } from '../support/invites';

// Journey I5 (spec 0004 "Invitee — suggests someone" and "Host — reviews a suggestion").

const newEmail = (label: string): Email => `${label}-${uniqueSuffix()}@example.com` as Email;

// An active brunch whose host and one going attendee are signed in.
async function activeBrunchWithAttendee(
  makeActor: (label: string) => Promise<Actor>,
): Promise<{ host: Actor; attendee: Actor; brunchId: BrunchId }> {
  const host = await makeActor('host');
  const attendee = await makeActor('attendee');
  const brunchId = await createBrunch({ host: host.user });
  await inviteToBrunch({ brunchId, host: host.user, invitees: [attendee.user] });
  await respondToInvite({ brunchId, user: attendee.user, response: 'yes' });
  return { host, attendee, brunchId };
}

async function suggest(attendee: Actor, brunchId: BrunchId, email: string): Promise<void> {
  await attendee.page.goto(`/brunch/${brunchId}`);
  await attendee.page.getByLabel('Suggest someone').fill(email);
  // Its own accessible name: the time-suggestion control used to have an identical "Suggest"
  // button, which a screen reader could not tell apart (strict mode here fails if it returns).
  await attendee.page.getByRole('button', { name: 'Suggest this person' }).click();
  // The box empties once the suggestion has been accepted by the server.
  await expect(attendee.page.getByLabel('Suggest someone')).toHaveValue('');
}

test.describe('I5 — suggesting someone to invite', () => {
  test('the host approves one suggestion, which becomes an invite, and declines another, which does not', async ({
    makeActor,
  }) => {
    const { host, attendee, brunchId } = await activeBrunchWithAttendee(makeActor);
    const approved = newEmail('approved');
    const declined = newEmail('declined');

    // Hosts invite directly; only attendees get the suggestion control.
    await host.page.goto(`/brunch/${brunchId}`);
    await expect(host.page.getByLabel('Suggest someone')).toHaveCount(0);

    await suggest(attendee, brunchId, approved);
    await suggest(attendee, brunchId, declined);

    await host.page.reload();
    const approvedRow = host.page.getByRole('listitem').filter({ hasText: 'suggested by' }).filter({
      hasText: approved,
    });
    const declinedRow = host.page.getByRole('listitem').filter({ hasText: 'suggested by' }).filter({
      hasText: declined,
    });
    await expect(approvedRow).toContainText(`suggested by ${attendee.user.name}`);
    await expect(declinedRow).toBeVisible();
    // Pending suggestions are not invites yet.
    await expect(inviteRow(host.page, approved)).toHaveCount(1); // the suggestion row only

    await approvedRow.getByRole('button', { name: 'Approve' }).click();
    await expect(approvedRow).toHaveCount(0);
    await expect(inviteRow(host.page, approved)).toContainText('pending');

    await declinedRow.getByRole('button', { name: 'Decline' }).click();
    await expect(declinedRow).toHaveCount(0);
    await expect(inviteRow(host.page, declined)).toHaveCount(0);
    await expect(host.page.getByText('No pending suggestions.')).toBeVisible();

    const db = getDb();
    expect(await db.brunchInvite.count({ where: { brunchId, invitedEmail: approved } })).toBe(1);
    expect(await db.brunchInvite.count({ where: { brunchId, invitedEmail: declined } })).toBe(0);
  });

  test('when the host has switched suggestions off, attendees get no control', async ({
    makeActor,
  }) => {
    const { host, attendee, brunchId } = await activeBrunchWithAttendee(makeActor);
    // No screen exposes this setting yet, so it is set directly.
    await getDb().brunch.update({
      where: { id: brunchId },
      data: { allowInviteSuggestions: false },
    });

    await attendee.page.goto(`/brunch/${brunchId}`);
    await expect(attendee.page.getByRole('heading', { name: 'Invites' })).toHaveCount(0);
    await expect(attendee.page.getByLabel('Suggest someone')).toHaveCount(0);
    await expect(attendee.page.getByRole('heading', { name: 'Invite Suggestions' })).toHaveCount(0);

    // The host's own invite tools are unaffected.
    await host.page.goto(`/brunch/${brunchId}`);
    await expect(host.page.getByLabel('Invite more people')).toBeVisible();
  });

  test('when approval is not required, a suggestion becomes an invite immediately', async ({
    makeActor,
  }) => {
    const { host, attendee, brunchId } = await activeBrunchWithAttendee(makeActor);
    await getDb().brunch.update({
      where: { id: brunchId },
      data: { requireHostApprovalToInvite: false },
    });
    const suggested = newEmail('auto');

    await suggest(attendee, brunchId, suggested);

    await host.page.goto(`/brunch/${brunchId}`);
    await expect(inviteRow(host.page, suggested)).toContainText('pending');
    await expect(host.page.getByText('suggested by')).toHaveCount(0);
    await expect(host.page.getByText('No pending suggestions.')).toBeVisible();
  });
});
