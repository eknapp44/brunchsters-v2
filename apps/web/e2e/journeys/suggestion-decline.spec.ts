import { getDb } from '../support/db';
import { createBrunch } from '../support/factories';
import { expect, test } from '../support/fixtures';
import { fixturePlaces } from '../support/places';
import { daysFromNow, toDatetimeLocalValue } from '../support/time';
import { addAttendee, ballot } from '../support/voting';

// V4's other half: what happens to a suggestion the host turns down (spec 0005).

test.describe('V4 — a declined suggestion', () => {
  test('a declined place never reaches the ballot and the suggester no longer sees it pending', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const suggester = await makeActor('suggester');
    const brunchId = await createBrunch({
      host: host.user,
      locations: [fixturePlaces.sunnySide],
      times: [daysFromNow(10), daysFromNow(11)],
    });
    await addAttendee({ brunchId, host: host.user, user: suggester.user, response: 'yes' });
    const pacific = fixturePlaces.pacificBrunchHouse;

    await suggester.page.goto(`/brunch/${brunchId}`);
    await suggester.page.getByRole('textbox', { name: 'Search for a place' }).fill('pacific');
    await suggester.page
      .getByRole('button', { name: `${pacific.name} — ${pacific.address}` })
      .click();
    await expect(suggester.page.getByText('(awaiting host approval)')).toBeVisible();

    await host.page.goto(`/brunch/${brunchId}/manage`);
    const row = host.page
      .getByRole('listitem')
      .filter({ hasText: `suggested by ${suggester.user.name}` });
    await row.getByRole('button', { name: 'Decline' }).click();
    await expect(row).toHaveCount(0);

    // Nothing was added: still one place (a decision, not a vote), and the pending note is gone.
    await suggester.page.reload();
    await expect(suggester.page.getByText('(awaiting host approval)')).toHaveCount(0);
    await expect(ballot(suggester.page).locations.getByRole('checkbox')).toHaveCount(0);
    await expect(ballot(suggester.page).locations).not.toContainText(pacific.name);
    expect(await getDb().brunchLocation.count({ where: { brunchId } })).toBe(1);
  });

  test('a declined time never reaches the ballot', async ({ makeActor }) => {
    const host = await makeActor('host');
    const suggester = await makeActor('suggester');
    const brunchId = await createBrunch({
      host: host.user,
      locations: [fixturePlaces.sunnySide, fixturePlaces.harborBistro],
      times: [daysFromNow(10)],
    });
    await addAttendee({ brunchId, host: host.user, user: suggester.user, response: 'yes' });

    await suggester.page.goto(`/brunch/${brunchId}`);
    await suggester.page
      .getByLabel('Suggested date and time')
      .fill(toDatetimeLocalValue(daysFromNow(15, 9, 0)));
    await suggester.page.getByRole('button', { name: 'Suggest this time' }).click();
    await expect(suggester.page.getByText('(awaiting host approval)')).toBeVisible();

    await host.page.goto(`/brunch/${brunchId}/manage`);
    const row = host.page
      .getByRole('listitem')
      .filter({ hasText: `suggested by ${suggester.user.name}` });
    await row.getByRole('button', { name: 'Decline' }).click();
    await expect(row).toHaveCount(0);

    await suggester.page.reload();
    await expect(suggester.page.getByText('(awaiting host approval)')).toHaveCount(0);
    await expect(ballot(suggester.page).times.getByRole('checkbox')).toHaveCount(0);
    expect(await getDb().brunchTime.count({ where: { brunchId } })).toBe(1);
  });
});
