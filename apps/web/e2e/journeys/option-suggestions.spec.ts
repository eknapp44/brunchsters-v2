import { createBrunch } from '../support/factories';
import { expect, test } from '../support/fixtures';
import { fixturePlaces } from '../support/places';
import { daysFromNow, toDatetimeLocalValue } from '../support/time';
import { addAttendee, ballot } from '../support/voting';

// Journey V4 (spec 0005 "Attendee suggests a location or time"): a suggestion is private and
// inert until the host approves it, and only then becomes something people can vote for.

test.describe('V4 — suggesting a place', () => {
  test('stays pending and private, then becomes a votable option once the host approves', async ({
    makeActor,
  }) => {
    // Three people and several screens in a row; each route is compiled on first use in dev mode,
    // which on a cold start (right after a route changed) can pass the default 30 seconds.
    test.slow();
    const host = await makeActor('host');
    const suggester = await makeActor('suggester');
    const voter = await makeActor('voter');
    // One place (so it is decided, not a vote) and two times.
    const brunchId = await createBrunch({
      host: host.user,
      locations: [fixturePlaces.sunnySide],
      times: [daysFromNow(10), daysFromNow(11)],
    });
    await addAttendee({ brunchId, host: host.user, user: suggester.user, response: 'yes' });
    await addAttendee({ brunchId, host: host.user, user: voter.user, response: 'yes' });
    const pacific = fixturePlaces.pacificBrunchHouse;

    // The suggester searches and picks a place (through the intercepted Places API).
    await suggester.page.goto(`/brunch/${brunchId}`);
    await expect(ballot(suggester.page).locations.getByRole('checkbox')).toHaveCount(0);
    await suggester.page.getByRole('textbox', { name: 'Search for a place' }).fill('pacific');
    await suggester.page
      .getByRole('button', { name: `${pacific.name} — ${pacific.address}` })
      .click();

    // They see it, marked pending; it is not on the ballot and nothing about the decision changed.
    const pendingForSuggester = suggester.page
      .getByRole('listitem')
      .filter({ hasText: '(awaiting host approval)' });
    await expect(pendingForSuggester).toContainText(pacific.name);
    await expect(ballot(suggester.page).locations.getByRole('checkbox')).toHaveCount(0);

    // Nobody else sees it: not the other attendee...
    await voter.page.goto(`/brunch/${brunchId}`);
    await expect(voter.page.getByText(pacific.name)).toHaveCount(0);
    await expect(ballot(voter.page).locations.getByRole('checkbox')).toHaveCount(0);

    // ...but the host does, on the manage screen, and approves it.
    await host.page.goto(`/brunch/${brunchId}/manage`);
    await expect(host.page.getByRole('heading', { name: 'Pending Suggestions' })).toBeVisible();
    const pendingForHost = host.page
      .getByRole('listitem')
      .filter({ hasText: `suggested by ${suggester.user.name}` });
    await expect(pendingForHost).toContainText(pacific.name);
    await pendingForHost.getByRole('button', { name: 'Approve' }).click();
    await expect(pendingForHost).toHaveCount(0);

    // Two places is now a vote: the ballot appears (new place first, by name), and an
    // eligible voter can vote for the approved place.
    await voter.page.reload();
    const { locations } = ballot(voter.page);
    await expect(locations.getByRole('checkbox')).toHaveCount(2);
    const approved = locations.getByRole('checkbox', { name: new RegExp(`^${pacific.name}`) });
    await approved.check();
    await expect(approved).toHaveAccessibleName(/\b1 vote\b/);

    // The suggester's "awaiting approval" note is gone: it is a real option now.
    await suggester.page.reload();
    await expect(suggester.page.getByText('(awaiting host approval)')).toHaveCount(0);
    await expect(ballot(suggester.page).locations.getByRole('checkbox')).toHaveCount(2);
  });
});

test.describe('V4 — suggesting a time', () => {
  test('stays pending and private, then becomes a votable option once the host approves', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const suggester = await makeActor('suggester');
    const voter = await makeActor('voter');
    // Two places (a vote) and one time (decided).
    const brunchId = await createBrunch({
      host: host.user,
      locations: [fixturePlaces.sunnySide, fixturePlaces.harborBistro],
      times: [daysFromNow(10)],
    });
    await addAttendee({ brunchId, host: host.user, user: suggester.user, response: 'yes' });
    await addAttendee({ brunchId, host: host.user, user: voter.user, response: 'yes' });

    await suggester.page.goto(`/brunch/${brunchId}`);
    await expect(ballot(suggester.page).times.getByRole('checkbox')).toHaveCount(0);
    await suggester.page
      .getByLabel('Suggested date and time')
      .fill(toDatetimeLocalValue(daysFromNow(15, 9, 0)));
    await suggester.page.getByRole('button', { name: 'Suggest this time' }).click();

    const pendingForSuggester = suggester.page
      .getByRole('listitem')
      .filter({ hasText: '(awaiting host approval)' });
    await expect(pendingForSuggester).toBeVisible();
    await expect(ballot(suggester.page).times.getByRole('checkbox')).toHaveCount(0);

    await voter.page.goto(`/brunch/${brunchId}`);
    await expect(voter.page.getByText('(awaiting host approval)')).toHaveCount(0);

    await host.page.goto(`/brunch/${brunchId}/manage`);
    const pendingForHost = host.page
      .getByRole('listitem')
      .filter({ hasText: `suggested by ${suggester.user.name}` });
    await expect(pendingForHost).toBeVisible();
    await pendingForHost.getByRole('button', { name: 'Approve' }).click();
    await expect(pendingForHost).toHaveCount(0);

    await voter.page.reload();
    const { times } = ballot(voter.page);
    await expect(times.getByRole('checkbox')).toHaveCount(2);
    // Chronological: the suggested time (day 15) is the second row.
    const approved = times.getByRole('checkbox').nth(1);
    await approved.check();
    await expect(approved).toHaveAccessibleName(/\b1 vote\b/);
  });
});
