import { createBrunch, uniqueSuffix } from '../support/factories';
import { expect, test } from '../support/fixtures';
import { fixturePlaces } from '../support/places';
import { daysFromNow } from '../support/time';
import { addAttendee, ballot, castVotes } from '../support/voting';
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
