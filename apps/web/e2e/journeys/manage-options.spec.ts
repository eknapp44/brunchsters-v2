import { getDb } from '../support/db';
import { createBrunch, uniqueSuffix } from '../support/factories';
import { expect, test } from '../support/fixtures';
import { fixturePlaces } from '../support/places';
import { daysFromNow, datetimeLocalIn } from '../support/time';
import { addAttendee, ballot, castVotes } from '../support/voting';

// Journeys H1, H4 and H5 (spec 0005 "Host manages the ballot", "Where the screens live").

const TWO_PLACES = [fixturePlaces.sunnySide, fixturePlaces.harborBistro];
const TIMES = [daysFromNow(10), daysFromNow(11)];

test.describe('H4 — only the host gets the manage screen', () => {
  test('an attendee gets a 404, and only the host is offered the link', async ({ makeActor }) => {
    const host = await makeActor('host');
    const attendee = await makeActor('attendee');
    const brunchId = await createBrunch({ host: host.user, locations: TWO_PLACES, times: TIMES });
    await addAttendee({ brunchId, host: host.user, user: attendee.user, response: 'yes' });

    await host.page.goto(`/brunch/${brunchId}`);
    await expect(host.page.getByRole('link', { name: 'Manage brunch' })).toBeVisible();
    await attendee.page.goto(`/brunch/${brunchId}`);
    await expect(attendee.page.getByRole('link', { name: 'Manage brunch' })).toHaveCount(0);

    const denied = await attendee.page.goto(`/brunch/${brunchId}/manage`);
    expect(denied?.status()).toBe(404);
    await expect(attendee.page.getByText('This page could not be found.')).toBeVisible();

    const allowed = await host.page.goto(`/brunch/${brunchId}/manage`);
    expect(allowed?.status()).toBe(200);
  });
});

test.describe('H1 — the host edits the options', () => {
  test('adding a place reaches voters; removing a voted-for place drops its votes', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const voter = await makeActor('voter');
    const brunchId = await createBrunch({ host: host.user, locations: TWO_PLACES, times: TIMES });
    await addAttendee({ brunchId, host: host.user, user: voter.user, response: 'yes' });
    await castVotes({ brunchId, voter: voter.user, places: [fixturePlaces.sunnySide.name] });
    const pacific = fixturePlaces.pacificBrunchHouse;

    await host.page.goto(`/brunch/${brunchId}/manage`);
    const { locations } = ballot(host.page);
    const row = (name: string) => locations.getByRole('listitem').filter({ hasText: name });
    // Each option shows its vote count.
    await expect(row(fixturePlaces.sunnySide.name)).toContainText('(1 vote)');
    await expect(row(fixturePlaces.harborBistro.name)).toContainText('(0 votes)');

    // Add a place the same way the wizard does: search, pick.
    await host.page.getByRole('textbox', { name: 'Search for a place' }).fill('pacific');
    await host.page.getByRole('button', { name: `${pacific.name} — ${pacific.address}` }).click();
    await expect(row(pacific.name)).toContainText('(0 votes)');

    // The voter sees it on their ballot.
    await voter.page.goto(`/brunch/${brunchId}`);
    const voterLocations = ballot(voter.page).locations;
    await expect(voterLocations.getByRole('checkbox')).toHaveCount(3);
    await expect(
      voterLocations.getByRole('checkbox', { name: new RegExp(`^${pacific.name}`) }),
    ).toBeVisible();

    // Remove the place they voted for: it leaves the host's list, and its vote goes with it.
    await row(fixturePlaces.sunnySide.name).getByRole('button', { name: 'Remove' }).click();
    await expect(row(fixturePlaces.sunnySide.name)).toHaveCount(0);

    await voter.page.reload();
    await expect(voterLocations.getByRole('checkbox')).toHaveCount(2);
    await expect(voterLocations).not.toContainText(fixturePlaces.sunnySide.name);
    for (const box of await voterLocations.getByRole('checkbox').all()) {
      await expect(box).not.toBeChecked();
      await expect(box).toHaveAccessibleName(/\(0 votes\)/);
    }
  });

  test('adding a time reaches voters; removing a voted-for time drops its votes', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const voter = await makeActor('voter');
    const brunchId = await createBrunch({ host: host.user, locations: TWO_PLACES, times: TIMES });
    await addAttendee({ brunchId, host: host.user, user: voter.user, response: 'yes' });
    await castVotes({ brunchId, voter: voter.user, times: [0] });

    await host.page.goto(`/brunch/${brunchId}/manage`);
    // The manage screen keeps places and times in one section, so find the time rows by their
    // clock text rather than by a section heading.
    const times = host.page.getByRole('listitem').filter({ hasText: /\d{1,2}:\d{2}\s?[AP]M/ });
    await expect(times).toHaveCount(2);
    await expect(times.nth(0)).toContainText('(1 vote)');

    await host.page
      .getByLabel('Date and time to add')
      .fill(datetimeLocalIn(daysFromNow(12), 'America/Chicago'));
    await host.page.getByRole('button', { name: 'Add Time' }).click();
    await expect(times).toHaveCount(3);

    await voter.page.goto(`/brunch/${brunchId}`);
    const voterTimes = ballot(voter.page).times;
    await expect(voterTimes.getByRole('checkbox')).toHaveCount(3);
    await expect(voterTimes.getByRole('checkbox').first()).toBeChecked();

    // Remove the first (voted-for) time: the list shrinks, and with it the voter's vote.
    await times.nth(0).getByRole('button', { name: 'Remove' }).click();
    await expect(times).toHaveCount(2);
    await voter.page.reload();
    await expect(voterTimes.getByRole('checkbox')).toHaveCount(2);
    for (const box of await voterTimes.getByRole('checkbox').all()) {
      await expect(box).not.toBeChecked();
    }
  });
});

test.describe('H5 — historic bug: removing the option selected for confirming', () => {
  test('the confirm control falls back to what is left and stays usable', async ({ makeActor }) => {
    const host = await makeActor('host');
    const voter = await makeActor('voter');
    const brunchId = await createBrunch({
      host: host.user,
      locations: TWO_PLACES,
      times: [TIMES[0] ?? new Date()],
    });
    await addAttendee({ brunchId, host: host.user, user: voter.user, response: 'yes' });
    // Sunny Side leads, so it is the one preselected for confirming.
    await castVotes({ brunchId, voter: voter.user, places: [fixturePlaces.sunnySide.name] });

    await host.page.goto(`/brunch/${brunchId}/manage`);
    const confirm = host.page.locator('section').filter({
      has: host.page.getByRole('heading', { name: 'Confirm', exact: true }),
    });
    const sunny = confirm.getByRole('radio', { name: /^Sunny Side Cafe/ });
    const harbor = confirm.getByRole('radio', { name: /^Harbor Bistro/ });
    await expect(sunny).toBeChecked();

    // Post-M8 bug: after removing the selected option the radio showed nothing checked, yet
    // the Confirm button stayed clickable and would have submitted a vanished option.
    await ballot(host.page)
      .locations.getByRole('listitem')
      .filter({ hasText: fixturePlaces.sunnySide.name })
      .getByRole('button', { name: 'Remove' })
      .click();
    await expect(sunny).toHaveCount(0);
    await expect(harbor).toBeChecked();
    const confirmButton = confirm.getByRole('button', { name: 'Confirm brunch' });
    await expect(confirmButton).toBeEnabled();

    await confirmButton.click();
    await expect(host.page.getByRole('heading', { name: 'Confirmed', exact: true })).toBeVisible();
    await expect(host.page.getByText(fixturePlaces.harborBistro.name)).toBeVisible();
    // (Not getByRole('alert'): Next.js keeps an empty alert region for route announcements.)
    await expect(host.page.getByText('Failed to confirm the brunch')).toHaveCount(0);
  });
});

test.describe('H8 — managing a draft brunch', () => {
  test('explains that an invite comes first, offers nothing that would fail, and unlocks once one is sent', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const guestEmail = `guest-${uniqueSuffix()}@example.com`;
    // No invites yet: the state a brunch is left in when the wizard's last step is skipped.
    const brunchId = await createBrunch({
      host: host.user,
      locations: [fixturePlaces.sunnySide],
      times: [TIMES[0] ?? new Date()],
    });
    const heading = host.page.getByRole('heading', { name: 'Send an invite first' });
    const search = host.page.getByRole('textbox', { name: 'Search for a place' });
    const confirmButton = host.page.getByRole('button', { name: 'Confirm brunch' });

    await host.page.goto(`/brunch/${brunchId}/manage`);

    // It says why, instead of letting every click end in a generic "Failed to …".
    await expect(heading).toBeVisible();
    await expect(host.page.getByText('This brunch is still a draft.')).toBeVisible();
    await expect(search).toBeDisabled();
    await expect(host.page.getByLabel('Date and time to add')).toBeDisabled();
    await expect(host.page.getByRole('button', { name: 'Add Time' })).toBeDisabled();
    const removeButtons = host.page.getByRole('button', { name: 'Remove' });
    await expect(removeButtons).toHaveCount(2);
    for (const remove of await removeButtons.all()) await expect(remove).toBeDisabled();
    await expect(confirmButton).toBeDisabled();
    // Closing voting would start the brunch with voting already over, so that is off too; setting
    // a deadline is fine and stays available.
    const closeButton = host.page.getByRole('button', { name: 'Close voting now' });
    await expect(closeButton).toBeDisabled();
    await expect(host.page.getByRole('button', { name: 'Save deadline' })).toBeEnabled();
    // It is a rule, not just a disabled button: the server refuses too, and nothing changes.
    const closed = await host.context.request.post(`/api/v1/brunches/${brunchId}/voting/close`);
    expect(closed.status()).toBe(409);
    expect(await closed.json()).toEqual({ error: 'Brunch is not open for voting' });
    expect(
      (await getDb().brunch.findFirst({ where: { id: brunchId } }))?.votingClosedAt,
    ).toBeNull();
    // The old screen also claimed "you can still confirm", which the next click contradicted.
    await expect(host.page.getByText('No one else has accepted yet')).toHaveCount(0);
    await expect(host.page.getByRole('alert').filter({ hasText: 'Failed' })).toHaveCount(0);

    // The link goes to where invites are sent; the first one activates the brunch.
    await host.page.getByRole('link', { name: 'Invite people from the brunch page' }).click();
    await expect(host.page).toHaveURL(`/brunch/${brunchId}`);
    await host.page.getByLabel('Invite more people').fill(guestEmail);
    await host.page.getByRole('button', { name: 'Send Invite' }).click();
    await expect(host.page.getByText('Active', { exact: true })).toBeVisible();

    // Back on the manage screen everything is available, and confirming works.
    await host.page.goto(`/brunch/${brunchId}/manage`);
    await expect(heading).toHaveCount(0);
    await expect(search).toBeEnabled();
    await expect(host.page.getByRole('button', { name: 'Add Time' })).toBeEnabled();
    await expect(confirmButton).toBeEnabled();
    await expect(closeButton).toBeEnabled();
    await confirmButton.click();
    await expect(host.page.getByRole('heading', { name: 'Confirmed', exact: true })).toBeVisible();
  });
});
