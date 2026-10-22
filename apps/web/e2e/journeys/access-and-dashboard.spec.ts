import { HOST_ONLY, NOT_FOUND } from '../support/pages';
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
    await expect(stranger.page.getByText(NOT_FOUND)).toBeVisible();
    // 404, not 403: nothing about the brunch is disclosed.
    await expect(stranger.page.getByText(title)).toHaveCount(0);
  });

  test('the host-only manage page: the host gets it, a member a 403, an outsider the same 404 as a made-up id', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const member = await makeActor('member');
    const stranger = await makeActor('stranger');
    const title = `Host Only ${uniqueSuffix()}`;
    const brunchId = await createBrunch({ host: host.user, title });
    await inviteToBrunch({ brunchId, host: host.user, invitees: [member.user] });
    await respondToInvite({ brunchId, user: member.user, response: 'yes' });
    const manage = `/brunch/${brunchId}/manage`;

    expect((await host.page.goto(manage))?.status()).toBe(200);
    await expect(host.page.getByRole('heading', { name: `Manage: ${title}` })).toBeVisible();

    // A member is told they may not: 403, with no controls and nothing of the host's page.
    const denied = await member.page.goto(manage);
    expect(denied?.status()).toBe(403);
    await expect(member.page.getByRole('heading', { name: HOST_ONLY })).toBeVisible();
    await expect(member.page.getByRole('button', { name: 'Lock it in' })).toHaveCount(0);
    await expect(member.page.getByRole('link', { name: 'Back to dashboard' })).toBeVisible();

    // An outsider learns nothing: the same 404 a made-up id gets, word for word.
    const outsider = await stranger.page.goto(manage);
    expect(outsider?.status()).toBe(404);
    await expect(stranger.page.getByRole('heading', { name: NOT_FOUND })).toBeVisible();
    const outsiderText = await stranger.page.getByRole('main').innerText();
    const made = await stranger.page.goto('/brunch/00000000-0000-4000-8000-000000000000/manage');
    expect(made?.status()).toBe(404);
    await expect(stranger.page.getByRole('heading', { name: NOT_FOUND })).toBeVisible();
    expect(await stranger.page.getByRole('main').innerText()).toBe(outsiderText);
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
  test('puts the next brunch in a card and lists the rest newest first with role, status and going count', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const guest = await makeActor('guest');
    await createBrunch({ host: host.user, title: 'Oldest Draft Brunch' });
    await createBrunch({ host: host.user, title: 'Older Draft Brunch' });
    const activeId = await createBrunch({ host: host.user, title: 'Newer Active Brunch' });
    await inviteToBrunch({ brunchId: activeId, host: host.user, invitees: [guest.user] });
    await respondToInvite({ brunchId: activeId, user: guest.user, response: 'yes' });

    // The active brunch is next up: a card with its title, status and head count, and it is
    // not repeated in the list. The two drafts are the only rows, newest first.
    await host.page.goto('/dashboard');
    await expect(
      host.page.getByRole('heading', { level: 2, name: 'Newer Active Brunch' }),
    ).toBeVisible();
    await expect(host.page.getByText("You're hosting")).toBeVisible();
    await expect(host.page.getByText('Open for votes')).toBeVisible();
    await expect(host.page.getByText('2 going')).toBeVisible();
    const hostRows = host.page.getByRole('listitem');
    await expect(hostRows).toHaveCount(2);
    await expect(hostRows.nth(0)).toContainText('Older Draft Brunch');
    await expect(hostRows.nth(0)).toContainText('(Host)');
    await expect(hostRows.nth(0)).toContainText('In the works');
    await expect(hostRows.nth(0)).toContainText('1 going');
    await expect(hostRows.nth(1)).toContainText('Oldest Draft Brunch');

    // The guest sees only the brunch they belong to, as their next-up card, and is not marked
    // as host. They have no list: the card is not a row.
    await guest.page.goto('/dashboard');
    await expect(
      guest.page.getByRole('heading', { level: 2, name: 'Newer Active Brunch' }),
    ).toBeVisible();
    await expect(guest.page.getByText("You're hosting")).toHaveCount(0);
    await expect(guest.page.getByText('2 going')).toBeVisible();
    await expect(guest.page.getByRole('listitem')).toHaveCount(0);
    await expect(guest.page.getByRole('heading', { name: 'Upcoming' })).toHaveCount(0);
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
