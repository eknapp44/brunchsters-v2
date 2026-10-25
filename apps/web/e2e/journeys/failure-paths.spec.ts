import { getDb } from '../support/db';
import { createBrunch, uniqueSuffix } from '../support/factories';
import { expect, test } from '../support/fixtures';
import { fixturePlaces } from '../support/places';
import { TOAST_WORDS, toast } from '../support/toasts';
import { daysFromNow } from '../support/time';
import { addAttendee, ballot, closeVoting } from '../support/voting';
import { BrunchWizard } from '../support/wizard';

// What the user sees when something goes wrong. The success paths are covered by the journeys;
// these check the client-side recovery logic that only runs when a request fails.

const TWO_PLACES = [fixturePlaces.sunnySide, fixturePlaces.harborBistro];
const TWO_TIMES = [daysFromNow(10), daysFromNow(11)];
// A failed save is an inline line beside the ballot, worded from the code the route sent (spec 0014).
const SAVE_FAILED = TOAST_WORDS.wentSideways;

test.describe('F1 — a ballot that fails to save', () => {
  for (const kind of ['locations', 'times'] as const) {
    test(`the ${kind} checkbox is rolled back and the error shown, and trying again works`, async ({
      makeActor,
    }) => {
      const host = await makeActor('host');
      const voter = await makeActor('voter');
      const brunchId = await createBrunch({
        host: host.user,
        locations: TWO_PLACES,
        times: TWO_TIMES,
      });
      await addAttendee({ brunchId, host: host.user, user: voter.user, response: 'yes' });
      await voter.page.goto(`/brunch/${brunchId}`);
      const box = ballot(voter.page)[kind].getByRole('checkbox').first();

      // The save fails: without the rollback this would leave a checked box for a vote that
      // was never recorded.
      const endpoint = `**/api/v1/brunches/${brunchId}/votes/${kind}`;
      await voter.page.route(endpoint, (route) =>
        route.fulfill({ status: 500, json: { error: 'boom' } }),
      );
      await box.click();
      await expect(voter.page.getByRole('alert').filter({ hasText: SAVE_FAILED })).toBeVisible();
      await expect(box).not.toBeChecked();
      await expect(box).toHaveAccessibleName(/\b0 votes\b/);

      // Once the problem clears, the same click goes through and the error is gone.
      await voter.page.unroute(endpoint);
      await box.click();
      await expect(box).toBeChecked();
      await expect(box).toHaveAccessibleName(/\b1 vote\b/);
      await expect(voter.page.getByText(SAVE_FAILED)).toHaveCount(0);
    });
  }

  test('a vote sent just after the host closes voting is refused and the checkbox rolled back', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const voter = await makeActor('voter');
    const brunchId = await createBrunch({
      host: host.user,
      locations: TWO_PLACES,
      times: TWO_TIMES,
    });
    await addAttendee({ brunchId, host: host.user, user: voter.user, response: 'yes' });
    await voter.page.goto(`/brunch/${brunchId}`);
    const box = ballot(voter.page).locations.getByRole('checkbox').first();
    await expect(box).toBeEnabled();

    // The page was loaded while voting was open; then the host closes it.
    await closeVoting({ brunchId, host: host.user });
    await box.click();

    // A real refusal from the server, so it reads as its own code, not the general line.
    await expect(
      voter.page.getByRole('alert').filter({ hasText: TOAST_WORDS.votingClosed }),
    ).toBeVisible();
    await expect(box).not.toBeChecked();
    const votes = await getDb().brunchLocationVote.count({
      where: { userId: voter.user.id, brunchLocation: { brunchId } },
    });
    expect(votes).toBe(0);
    // A refresh shows why.
    await voter.page.reload();
    await expect(ballot(voter.page).locations).toContainText('Voting is closed.');
  });
});

test.describe('F2 — a brunch that fails to create', () => {
  test('keeps everything entered, shows the error, and creating again works', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const wizard = new BrunchWizard(host.page);
    const title = `Retry Brunch ${uniqueSuffix()}`;
    const guest = `guest-${uniqueSuffix()}@example.com`;

    await wizard.open();
    await wizard.fillWhat({ title });
    await wizard.addPlace(fixturePlaces.sunnySide);
    await wizard.next();
    await wizard.addTime(10);
    await wizard.next();
    await wizard.addEmail(guest);

    // Only the create call fails (not the invite call that would follow a success).
    const isCreate = (url: URL): boolean => url.pathname === '/api/v1/brunches';
    await host.page.route(isCreate, (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 500, json: { error: 'The database is unavailable' } })
        : route.fallback(),
    );
    await wizard.create();

    // Filtered by text: Next.js keeps its own empty role="alert" region on every page.
    await expect(
      host.page.getByRole('alert').filter({ hasText: 'The database is unavailable' }),
    ).toBeVisible();
    await expect(host.page).toHaveURL('/brunch/new');
    await expect(wizard.selectedItem(guest)).toBeVisible();
    await expect(host.page.getByRole('button', { name: 'Create Brunch' })).toBeEnabled();
    expect(await getDb().brunch.count({ where: { hostId: host.user.id, title } })).toBe(0);

    // Back up: the same entries create the brunch, once.
    await host.page.unroute(isCreate);
    await wizard.create();
    await expect(host.page).toHaveURL(/\/brunch\/[0-9a-f-]{36}$/);
    await expect(host.page.getByRole('heading', { name: title })).toBeVisible();
    expect(await getDb().brunch.count({ where: { hostId: host.user.id, title } })).toBe(1);
  });
});

test.describe('F3 — removing the last option', () => {
  test('is refused with an error and leaves the option in place', async ({ makeActor }) => {
    const host = await makeActor('host');
    const guest = await makeActor('guest');
    // Active (so the refusal can only be the "last option" rule), one place and one time.
    const brunchId = await createBrunch({
      host: host.user,
      locations: [fixturePlaces.sunnySide],
      times: [TWO_TIMES[0] ?? new Date()],
    });
    await addAttendee({ brunchId, host: host.user, user: guest.user, response: 'yes' });

    await host.page.goto(`/brunch/${brunchId}/manage`);
    const rows = host.page.getByRole('listitem');
    await rows
      .filter({ hasText: fixturePlaces.sunnySide.name })
      .getByRole('button', { name: 'Remove' })
      .click();
    // One tap with nothing to fix: the server's refusal reads as its code, in a toast.
    await expect(toast(host.page, TOAST_WORDS.lastOption)).toBeVisible();
    await expect(rows.filter({ hasText: fixturePlaces.sunnySide.name })).toHaveCount(1);

    await rows
      .filter({ hasText: /\d{1,2}:\d{2}\s?[AP]M/ })
      .getByRole('button', { name: 'Remove' })
      .click();
    await expect(toast(host.page, TOAST_WORDS.lastOption)).toHaveCount(2);
    await expect(rows.filter({ hasText: /\d{1,2}:\d{2}\s?[AP]M/ })).toHaveCount(1);

    const db = getDb();
    expect(await db.brunchLocation.count({ where: { brunchId } })).toBe(1);
    expect(await db.brunchTime.count({ where: { brunchId } })).toBe(1);
  });
});
