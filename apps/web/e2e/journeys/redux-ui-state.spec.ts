import { createBrunch, uniqueSuffix } from '../support/factories';
import { expect, test } from '../support/fixtures';
import { fixturePlaces } from '../support/places';
import { daysFromNow } from '../support/time';
import { addAttendee, ballot, castVotes, removeLocationByName } from '../support/voting';
import { BrunchWizard } from '../support/wizard';

const TWO_PLACES = [fixturePlaces.sunnySide, fixturePlaces.harborBistro];
const TWO_TIMES = [daysFromNow(10), daysFromNow(11)];
const SAVE_FAILED = 'Failed to save your vote';

// Journeys R1-R3 (spec 0010). The client store lives in the (authenticated) layout and outlives
// any one page, so these check that no draft or unsaved selection leaks from one visit to the next.

test.describe('R1 — the wizard does not keep a draft', () => {
  test('leaving the wizard and coming back starts empty', async ({ makeActor }) => {
    const host = await makeActor('host');
    const wizard = new BrunchWizard(host.page);

    await wizard.open();
    await wizard.fillWhat({ title: 'Abandoned Brunch', description: 'Never mind.' });
    await wizard.addPlace(fixturePlaces.sunnySide);

    // In-app navigation (no reload), so only the store could carry the draft over.
    await host.page.getByRole('link', { name: 'brunchsters' }).click();
    await expect(host.page).toHaveURL('/dashboard');
    await host.page.getByRole('link', { name: 'Plan a Brunch' }).click();
    await expect(host.page).toHaveURL('/brunch/new');

    await expect(host.page.getByLabel('Title')).toHaveValue('');
    await expect(host.page.getByLabel('Description')).toHaveValue('');
    await wizard.fillWhat({ title: 'Fresh Start' });
    await expect(host.page.getByRole('listitem')).toHaveCount(0);
  });
});

test.describe('R2 — an unsaved ballot does not outlive the page', () => {
  test('leaving after unchecking the last option brings the saved vote back', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const voter = await makeActor('voter');
    const title = `Revisit Brunch ${uniqueSuffix()}`;
    const brunchId = await createBrunch({
      host: host.user,
      title,
      locations: TWO_PLACES,
      times: TWO_TIMES,
    });
    await addAttendee({ brunchId, host: host.user, user: voter.user, response: 'yes' });
    await castVotes({ brunchId, voter: voter.user, places: [fixturePlaces.sunnySide.name] });

    await voter.page.goto(`/brunch/${brunchId}`);
    const sunny = ballot(voter.page).locations.getByRole('checkbox', { name: /^Sunny Side Cafe/ });
    await expect(sunny).toBeChecked();

    // Unchecking the last option is held back: warned about, never sent.
    await sunny.uncheck();
    await expect(
      voter.page.getByRole('alert').filter({ hasText: 'withdraws your vote' }),
    ).toBeVisible();
    await expect(sunny).not.toBeChecked();

    // Away and back inside the app (no reload), so only the store could carry it over.
    await voter.page.getByRole('link', { name: 'brunchsters' }).click();
    await expect(voter.page).toHaveURL('/dashboard');
    await voter.page.getByRole('link', { name: title }).click();
    await expect(voter.page).toHaveURL(`/brunch/${brunchId}`);

    await expect(sunny).toBeChecked();
    await expect(voter.page.getByText('withdraws your vote')).toHaveCount(0);
  });
});

test.describe('R3 — the place ballot and the time ballot are separate', () => {
  test('a failed place save rolls back only the place checkbox', async ({ makeActor }) => {
    const host = await makeActor('host');
    const voter = await makeActor('voter');
    const brunchId = await createBrunch({
      host: host.user,
      locations: TWO_PLACES,
      times: TWO_TIMES,
    });
    await addAttendee({ brunchId, host: host.user, user: voter.user, response: 'yes' });
    await voter.page.goto(`/brunch/${brunchId}`);
    const place = ballot(voter.page).locations.getByRole('checkbox').first();
    const time = ballot(voter.page).times.getByRole('checkbox').first();

    // The time vote saves.
    await time.check();
    await expect(time).toHaveAccessibleName(/\b1 vote\b/);

    // Then the place vote fails: only the place box rolls back, and the error appears once.
    await voter.page.route(`**/api/v1/brunches/${brunchId}/votes/locations`, (route) =>
      route.fulfill({ status: 500, json: { error: 'boom' } }),
    );
    await place.click();
    await expect(voter.page.getByRole('alert').filter({ hasText: SAVE_FAILED })).toHaveCount(1);
    await expect(place).not.toBeChecked();
    await expect(time).toBeChecked();
    await expect(time).toHaveAccessibleName(/\b1 vote\b/);
  });
});

test.describe('R4 — an option the host removed drops out of the ballot', () => {
  test('the next vote is saved without it (spec 0005 review F2)', async ({ makeActor }) => {
    const host = await makeActor('host');
    const voter = await makeActor('voter');
    const places = [
      fixturePlaces.sunnySide,
      fixturePlaces.harborBistro,
      fixturePlaces.pacificBrunchHouse,
    ];
    const brunchId = await createBrunch({ host: host.user, locations: places, times: TWO_TIMES });
    await addAttendee({ brunchId, host: host.user, user: voter.user, response: 'yes' });
    await castVotes({ brunchId, voter: voter.user, places: [fixturePlaces.sunnySide.name] });

    await voter.page.goto(`/brunch/${brunchId}`);
    const { locations, times } = ballot(voter.page);
    const named = (name: string) =>
      locations.getByRole('checkbox', { name: new RegExp(`^${name}`) });
    await expect(named(fixturePlaces.sunnySide.name)).toBeChecked();
    await named(fixturePlaces.harborBistro.name).check();
    await expect(named(fixturePlaces.harborBistro.name)).toBeChecked();

    // The host removes the place the voter had ticked; the voter's page does not know yet.
    await removeLocationByName({ brunchId, host: host.user, place: fixturePlaces.sunnySide.name });

    // A time vote refreshes the page, and the removed place disappears from it.
    await times.getByRole('checkbox').first().check();
    await expect(locations.getByRole('checkbox')).toHaveCount(2);

    // Without the filter the old id would be sent along and refused as an unknown option.
    await named(fixturePlaces.pacificBrunchHouse.name).check();
    await expect(named(fixturePlaces.pacificBrunchHouse.name)).toBeChecked();
    await expect(named(fixturePlaces.pacificBrunchHouse.name)).toHaveAccessibleName(/\b1 vote\b/);
    await expect(voter.page.getByRole('alert').filter({ hasText: SAVE_FAILED })).toHaveCount(0);
  });
});

test.describe('R5 — a slow save from an earlier visit', () => {
  test('does not undo a vote made on the next visit', async ({ makeActor }) => {
    const host = await makeActor('host');
    const voter = await makeActor('voter');
    const title = `Slow Save Brunch ${uniqueSuffix()}`;
    const places = [
      fixturePlaces.sunnySide,
      fixturePlaces.harborBistro,
      fixturePlaces.pacificBrunchHouse,
    ];
    const brunchId = await createBrunch({
      host: host.user,
      title,
      locations: places,
      times: TWO_TIMES,
    });
    await addAttendee({ brunchId, host: host.user, user: voter.user, response: 'yes' });
    await voter.page.goto(`/brunch/${brunchId}`);
    const named = (name: string) =>
      ballot(voter.page).locations.getByRole('checkbox', { name: new RegExp(`^${name}`) });

    // The first save is held back, then refused; every later save goes through.
    let saves = 0;
    let refuseFirstSave: () => void = () => undefined;
    const firstSaveHeld = new Promise<void>((resolve) => (refuseFirstSave = resolve));
    await voter.page.route(`**/api/v1/brunches/${brunchId}/votes/locations`, async (route) => {
      saves += 1;
      if (saves > 1) return route.fallback();
      await firstSaveHeld;
      return route.fulfill({ status: 500, json: { error: 'boom' } });
    });

    await named(fixturePlaces.harborBistro.name).click();
    await expect.poll(() => saves).toBe(1);

    // Away and back inside the app while that save is still in flight, then vote again.
    await voter.page.getByRole('link', { name: 'brunchsters' }).click();
    await expect(voter.page).toHaveURL('/dashboard');
    await voter.page.getByRole('link', { name: title }).click();
    await expect(voter.page).toHaveURL(`/brunch/${brunchId}`);
    await named(fixturePlaces.pacificBrunchHouse.name).check();
    await expect(named(fixturePlaces.pacificBrunchHouse.name)).toBeChecked();

    // The old save now fails. It belongs to the earlier visit, so the new vote is left alone.
    refuseFirstSave();
    await voter.page.waitForTimeout(500);
    await expect(named(fixturePlaces.pacificBrunchHouse.name)).toBeChecked();
    await expect(voter.page.getByRole('alert').filter({ hasText: SAVE_FAILED })).toHaveCount(0);
  });
});
