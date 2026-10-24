import { createBrunch } from '../support/factories';
import { expect, test } from '../support/fixtures';
import { fixturePlaces } from '../support/places';
import { daysFromNow } from '../support/time';
import { addAttendee, ballot, castVotes } from '../support/voting';

// Journeys H3 and H6 (spec 0005 "Host confirms the brunch").

const TIMES = [daysFromNow(10), daysFromNow(11)];

// The same format the page uses, in an explicit zone so it does not depend on this machine.
function formatIn(date: Date, timeZone: string): string {
  return date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone });
}

test.describe('H3 — confirming the brunch', () => {
  test('preselects a clear leader, leaves a tie to the host, and locks everything but RSVP', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const ann = await makeActor('ann');
    const bob = await makeActor('bob');
    const brunchId = await createBrunch({
      host: host.user,
      locations: [fixturePlaces.sunnySide, fixturePlaces.harborBistro],
      times: TIMES,
    });
    await addAttendee({ brunchId, host: host.user, user: ann.user, response: 'yes' });
    await addAttendee({ brunchId, host: host.user, user: bob.user, response: 'yes' });
    // Sunny Side wins 2–0; the two times split 1–1.
    await castVotes({
      brunchId,
      voter: ann.user,
      places: [fixturePlaces.sunnySide.name],
      times: [0],
    });
    await castVotes({
      brunchId,
      voter: bob.user,
      places: [fixturePlaces.sunnySide.name],
      times: [1],
    });

    await host.page.goto(`/brunch/${brunchId}/manage`);
    const confirm = host.page.locator('section').filter({
      has: host.page.getByRole('heading', { name: 'Confirm', exact: true }),
    });
    await expect(
      confirm.getByRole('radio', { name: /^Sunny Side Cafe.*\(2 votes\)/ }),
    ).toBeChecked();
    await expect(
      confirm.getByRole('radio', { name: /^Harbor Bistro.*\(0 votes\)/ }),
    ).not.toBeChecked();
    // A tie preselects nothing, so confirming waits for the host to choose.
    const timeRadios = confirm.getByRole('group', { name: 'Time' }).getByRole('radio');
    await expect(timeRadios).toHaveCount(2);
    await expect(timeRadios.nth(0)).not.toBeChecked();
    await expect(timeRadios.nth(1)).not.toBeChecked();
    const confirmButton = confirm.getByRole('button', { name: 'Lock it in' });
    await expect(confirmButton).toBeDisabled();

    // One action confirms both choices.
    await timeRadios.nth(1).check();
    await expect(confirmButton).toBeEnabled();
    await confirmButton.click();

    // The host's manage screen becomes a read-only summary, in the confirmed place's zone.
    await expect(host.page.getByRole('heading', { name: 'Confirmed', exact: true })).toBeVisible();
    await expect(host.page.getByText(fixturePlaces.sunnySide.name)).toBeVisible();
    await expect(
      host.page.getByText(formatIn(TIMES[1] ?? new Date(), 'America/Chicago')),
    ).toBeVisible();
    await expect(host.page.getByRole('button', { name: 'Lock it in' })).toHaveCount(0);
    await expect(host.page.getByRole('button', { name: 'Add Time' })).toHaveCount(0);
    await expect(host.page.getByRole('button', { name: 'Call it', exact: true })).toHaveCount(0);

    // An attendee sees it everywhere: status, both choices marked, the ballot frozen...
    await ann.page.goto(`/brunch/${brunchId}`);
    await expect(ann.page.getByText('Confirmed', { exact: true })).toBeVisible();
    const { locations, times } = ballot(ann.page);
    await expect(
      locations.getByRole('listitem').filter({ hasText: 'Sunny Side Cafe' }),
    ).toContainText('Confirmed');
    await expect(
      locations.getByRole('listitem').filter({ hasText: 'Harbor Bistro' }),
    ).not.toContainText('Confirmed');
    await expect(times.getByRole('listitem').nth(1)).toContainText('Confirmed');
    await expect(times.getByRole('listitem').nth(0)).not.toContainText('Confirmed');
    for (const box of await ann.page.getByRole('checkbox').all()) await expect(box).toBeDisabled();
    // ...the place and time suggestion controls are gone...
    await expect(ann.page.getByRole('heading', { name: 'Suggest a Location' })).toHaveCount(0);
    await expect(ann.page.getByRole('heading', { name: 'Suggest a Time' })).toHaveCount(0);
    // ...but RSVP stays open: people can still change their answer.
    await ann.page.getByRole('button', { name: 'Maybe', exact: true }).click();
    await expect(ann.page.getByText('Current: maybe')).toBeVisible();
  });
});

test.describe('H6 — confirming with no one else on board', () => {
  test('warns that nobody else has accepted, but does not block confirming', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const waiting = await makeActor('waiting');
    // One place and one time, so there is nothing to choose and the host can confirm at once.
    const brunchId = await createBrunch({
      host: host.user,
      locations: [fixturePlaces.sunnySide],
      times: [TIMES[0] ?? new Date()],
    });
    await addAttendee({ brunchId, host: host.user, user: waiting.user, response: 'pending' });

    await host.page.goto(`/brunch/${brunchId}/manage`);
    await expect(
      host.page.getByText('No one else has accepted yet — you can still confirm.'),
    ).toBeVisible();
    await host.page.getByRole('button', { name: 'Lock it in' }).click();

    await expect(host.page.getByRole('heading', { name: 'Confirmed', exact: true })).toBeVisible();
    await expect(host.page.getByText(fixturePlaces.sunnySide.name)).toBeVisible();
  });

  test('says nothing once somebody has accepted', async ({ makeActor }) => {
    const host = await makeActor('host');
    const going = await makeActor('going');
    const brunchId = await createBrunch({
      host: host.user,
      locations: [fixturePlaces.sunnySide],
      times: [TIMES[0] ?? new Date()],
    });
    await addAttendee({ brunchId, host: host.user, user: going.user, response: 'yes' });

    await host.page.goto(`/brunch/${brunchId}/manage`);

    await expect(host.page.getByRole('button', { name: 'Lock it in' })).toBeEnabled();
    await expect(host.page.getByText('No one else has accepted yet')).toHaveCount(0);
  });
});
