import { getDb } from '../support/db';
import { createBrunch, inviteToBrunch, respondToInvite, uniqueSuffix } from '../support/factories';
import { expect, test } from '../support/fixtures';

// Journeys C3 and C4 (spec 0003 "Brunch detail — access rule" and "Dashboard").

test.describe('C3 — who can open a brunch', () => {
  test('host and attendee can open it; an unrelated user gets a 404 that reveals nothing', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const attendee = await makeActor('attendee');
    const stranger = await makeActor('stranger');
    const title = `Private Brunch ${uniqueSuffix()}`;
    const brunchId = await createBrunch({ host: host.user, title });
    await inviteToBrunch({ brunchId, host: host.user, invitees: [attendee.user] });
    await respondToInvite({ brunchId, user: attendee.user, response: 'yes' });

    for (const member of [host, attendee]) {
      const response = await member.page.goto(`/brunch/${brunchId}`);
      expect(response?.status()).toBe(200);
      await expect(member.page.getByRole('heading', { name: title })).toBeVisible();
    }

    const denied = await stranger.page.goto(`/brunch/${brunchId}`);
    expect(denied?.status()).toBe(404);
    await expect(stranger.page.getByText('This page could not be found.')).toBeVisible();
    // 404, not 403: nothing about the brunch is disclosed.
    await expect(stranger.page.getByText(title)).toHaveCount(0);
  });

  test('a malformed or unknown brunch id is a 404, not an error', async ({ makeActor }) => {
    const member = await makeActor('member');

    const malformed = await member.page.goto('/brunch/not-a-uuid');
    expect(malformed?.status()).toBe(404);

    const unknown = await member.page.goto('/brunch/00000000-0000-4000-8000-000000000000');
    expect(unknown?.status()).toBe(404);
  });
});

test.describe('C4 — dashboard', () => {
  test('lists a user’s brunches newest first with role, status and going count', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const guest = await makeActor('guest');
    await createBrunch({ host: host.user, title: 'Older Draft Brunch' });
    const activeId = await createBrunch({ host: host.user, title: 'Newer Active Brunch' });
    await inviteToBrunch({ brunchId: activeId, host: host.user, invitees: [guest.user] });
    await respondToInvite({ brunchId: activeId, user: guest.user, response: 'yes' });

    await host.page.goto('/dashboard');
    const hostRows = host.page.getByRole('listitem');
    await expect(hostRows).toHaveCount(2);
    await expect(hostRows.nth(0)).toContainText('Newer Active Brunch');
    await expect(hostRows.nth(0)).toContainText('(Host)');
    await expect(hostRows.nth(0)).toContainText('Active');
    await expect(hostRows.nth(0)).toContainText('2 going');
    await expect(hostRows.nth(1)).toContainText('Older Draft Brunch');
    await expect(hostRows.nth(1)).toContainText('Draft');
    await expect(hostRows.nth(1)).toContainText('1 going');

    // The guest sees only the brunch they belong to, and is not marked as host.
    await guest.page.goto('/dashboard');
    const guestRows = guest.page.getByRole('listitem');
    await expect(guestRows).toHaveCount(1);
    await expect(guestRows.first()).toContainText('Newer Active Brunch');
    await expect(guestRows.first()).not.toContainText('(Host)');
  });

  test('finished brunches are listed under Past, apart from Upcoming', async ({ makeActor }) => {
    const host = await makeActor('host');
    const brunchId = await createBrunch({ host: host.user, title: 'Long Ago Brunch' });
    // The app has no way to complete a brunch yet (that status ships with a later spec), so
    // this is the one fixture that reaches state directly instead of through a service.
    const db = getDb();
    const completed = await db.brunchStatus.findFirst({ where: { code: 'completed' } });
    if (completed === null) throw new Error('Seed is missing the "completed" brunch status');
    await db.brunch.update({ where: { id: brunchId }, data: { statusId: completed.id } });

    await host.page.goto('/dashboard');

    await expect(host.page.getByRole('heading', { name: 'Upcoming' })).toBeVisible();
    await expect(host.page.getByText('No upcoming brunches.')).toBeVisible();
    await expect(host.page.getByRole('heading', { name: 'Past' })).toBeVisible();
    await expect(host.page.getByRole('link', { name: 'Long Ago Brunch' })).toBeVisible();
  });
});
