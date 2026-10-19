import { expect, test } from '../support/fixtures';
import { fixturePlaces } from '../support/places';
import { BrunchWizard } from '../support/wizard';

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
