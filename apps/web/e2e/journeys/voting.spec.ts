import { createBrunch } from '../support/factories';
import { expect, test } from '../support/fixtures';
import { fixturePlaces } from '../support/places';
import { daysFromNow } from '../support/time';
import { addAttendee, ballot, castVotes, removeLocationByName } from '../support/voting';

// Journeys V1, V2, V3 and V5 (spec 0005 "Attendee votes").

const TWO_PLACES = [fixturePlaces.sunnySide, fixturePlaces.harborBistro];
const TWO_TIMES = [daysFromNow(10), daysFromNow(11)];

test.describe('V1 — an attendee votes', () => {
  test('checks options, revises, and cannot submit an empty ballot', async ({ makeActor }) => {
    const host = await makeActor('host');
    // "Maybe" can vote too: it is not only a "yes" privilege.
    const voter = await makeActor('voter');
    const brunchId = await createBrunch({
      host: host.user,
      locations: TWO_PLACES,
      times: TWO_TIMES,
    });
    await addAttendee({ brunchId, host: host.user, user: voter.user, response: 'maybe' });

    const saves: string[] = [];
    voter.page.on('request', (request) => {
      if (request.method() === 'PUT') saves.push(request.url());
    });
    await voter.page.goto(`/brunch/${brunchId}`);
    const { locations, times } = ballot(voter.page);
    // Places list in name order, times chronologically: stable, so these names are safe.
    const harbor = locations.getByRole('checkbox', { name: /^Harbor Bistro/ });
    const sunny = locations.getByRole('checkbox', { name: /^Sunny Side Cafe/ });
    await expect(harbor).toHaveAccessibleName(/\b0 votes\b/);
    await expect(sunny).toHaveAccessibleName(/\b0 votes\b/);

    // Check one: the ballot saves and the count refreshes.
    await sunny.check();
    await expect(sunny).toHaveAccessibleName(/\b1 vote\b/);
    expect(saves).toHaveLength(1);

    // Add a second, then revise by dropping the first — each change saves the whole ballot.
    await harbor.check();
    await expect(harbor).toHaveAccessibleName(/\b1 vote\b/);
    await sunny.uncheck();
    await expect(sunny).toHaveAccessibleName(/\b0 votes\b/);
    await expect(harbor).toBeChecked();
    expect(saves).toHaveLength(3);

    // Unchecking the last option explains itself, points at the suggestion control, and
    // sends nothing: an empty ballot is never submitted.
    await harbor.uncheck();
    const warning = voter.page.getByRole('alert').filter({ hasText: 'withdraws your vote' });
    await expect(warning).toContainText("won't be saved until you check at least one option");
    await expect(warning).toContainText('suggest a different one below');
    expect(saves).toHaveLength(3);
    // Because nothing was sent, the earlier vote is still the one on record.
    await voter.page.reload();
    await expect(harbor).toBeChecked();
    await expect(harbor).toHaveAccessibleName(/\b1 vote\b/);

    // Times work the same way, and the choices persist across a reload.
    const firstTime = times.getByRole('checkbox').first();
    await firstTime.check();
    await expect(firstTime).toHaveAccessibleName(/\b1 vote\b/);
    await voter.page.reload();
    await expect(firstTime).toBeChecked();
    await expect(times.getByRole('checkbox').nth(1)).not.toBeChecked();
  });
});

test.describe('V2 — attendees who cannot vote', () => {
  test('"no" and "invited" see the ballot and counts read-only, and regain the vote by saying yes', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const declined = await makeActor('declined');
    const waiting = await makeActor('waiting');
    const brunchId = await createBrunch({
      host: host.user,
      locations: TWO_PLACES,
      times: TWO_TIMES,
    });
    await addAttendee({ brunchId, host: host.user, user: declined.user, response: 'no' });
    await addAttendee({ brunchId, host: host.user, user: waiting.user, response: 'pending' });
    // A vote already on the board, so "counts are visible" is meaningful.
    await castVotes({ brunchId, voter: host.user, places: [fixturePlaces.sunnySide.name] });

    for (const member of [declined, waiting]) {
      await member.page.goto(`/brunch/${brunchId}`);
      const { locations, times } = ballot(member.page);
      await expect(locations.getByRole('checkbox')).toHaveCount(2);
      for (const box of await locations.getByRole('checkbox').all())
        await expect(box).toBeDisabled();
      for (const box of await times.getByRole('checkbox').all()) await expect(box).toBeDisabled();
      await expect(
        locations.getByRole('checkbox', { name: /^Sunny Side Cafe/ }),
      ).toHaveAccessibleName(/\b1 vote\b/);
      await expect(locations).toContainText('Your RSVP does not allow voting.');
      await expect(times).toContainText('Your RSVP does not allow voting.');
    }

    // Changing their answer to yes hands the ballot back.
    await declined.page.getByRole('button', { name: 'yes', exact: true }).click();
    await expect(declined.page.getByText('Current: yes')).toBeVisible();
    const { locations } = ballot(declined.page);
    await expect(locations).not.toContainText('Your RSVP does not allow voting.');
    const harbor = locations.getByRole('checkbox', { name: /^Harbor Bistro/ });
    await expect(harbor).toBeEnabled();
    await harbor.check();
    await expect(harbor).toHaveAccessibleName(/\b1 vote\b/);

    // The one who never answered is still locked out.
    await waiting.page.reload();
    await expect(ballot(waiting.page).locations.getByRole('checkbox').first()).toBeDisabled();
  });
});

test.describe('V3 — who can see how people voted', () => {
  test('the host sees voter names (alphabetically); other attendees see only counts', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    // Named so alphabetical order is "ann" before "bob" whatever order they voted in.
    const bob = await makeActor('bob');
    const ann = await makeActor('ann');
    const brunchId = await createBrunch({
      host: host.user,
      locations: TWO_PLACES,
      times: TWO_TIMES,
    });
    await addAttendee({ brunchId, host: host.user, user: bob.user, response: 'yes' });
    await addAttendee({ brunchId, host: host.user, user: ann.user, response: 'yes' });
    await castVotes({
      brunchId,
      voter: bob.user,
      places: [fixturePlaces.sunnySide.name],
      times: [0],
    });
    await castVotes({
      brunchId,
      voter: ann.user,
      places: [fixturePlaces.sunnySide.name],
      times: [0],
    });

    await host.page.goto(`/brunch/${brunchId}`);
    const hostView = ballot(host.page);
    const sunnyForHost = hostView.locations.getByRole('checkbox', { name: /^Sunny Side Cafe/ });
    await expect(sunnyForHost).toHaveAccessibleName(/\b2 votes\b/);
    await expect(sunnyForHost).toHaveAccessibleName(
      new RegExp(`voted by ${ann.user.name}, ${bob.user.name}`),
    );
    await expect(hostView.times.getByRole('checkbox').first()).toHaveAccessibleName(
      new RegExp(`voted by ${ann.user.name}, ${bob.user.name}`),
    );
    // Nobody voted for Harbor: no "voted by" at all.
    await expect(
      hostView.locations.getByRole('checkbox', { name: /^Harbor Bistro/ }),
    ).not.toHaveAccessibleName(/voted by/);

    // A fellow attendee gets the same counts, and none of the names.
    await bob.page.goto(`/brunch/${brunchId}`);
    const bobView = ballot(bob.page);
    await expect(
      bobView.locations.getByRole('checkbox', { name: /^Sunny Side Cafe/ }),
    ).toHaveAccessibleName(/\b2 votes\b/);
    await expect(bob.page.getByText('voted by')).toHaveCount(0);
    await expect(bob.page.getByText(ann.user.name)).toHaveCount(0);
  });
});

test.describe('V5 — only a real choice is a ballot', () => {
  test('a kind with one option is shown, not voted on', async ({ makeActor }) => {
    const host = await makeActor('host');
    const guest = await makeActor('guest');
    // Two places and two times to start, with the host voting for a place...
    const brunchId = await createBrunch({
      host: host.user,
      locations: TWO_PLACES,
      times: TWO_TIMES,
    });
    await addAttendee({ brunchId, host: host.user, user: guest.user, response: 'yes' });
    await castVotes({ brunchId, voter: host.user, places: [fixturePlaces.sunnySide.name] });
    // ...then the host removes the other place. The place is now decided, the time is a vote.
    // The earlier vote is kept in storage but must no longer be shown (spec 0005).
    await removeLocationByName({
      brunchId,
      host: host.user,
      place: fixturePlaces.harborBistro.name,
    });

    await guest.page.goto(`/brunch/${brunchId}`);
    const { locations, times } = ballot(guest.page);
    await expect(locations.getByRole('checkbox')).toHaveCount(0);
    await expect(locations).toContainText(fixturePlaces.sunnySide.name);
    await expect(locations).toContainText(fixturePlaces.sunnySide.address);
    await expect(locations).not.toContainText('vote');
    await expect(times.getByRole('checkbox')).toHaveCount(2);

    // And the other way round: two places, no time yet.
    const noTimes = await createBrunch({ host: host.user, locations: TWO_PLACES, times: [] });
    await addAttendee({ brunchId: noTimes, host: host.user, user: guest.user, response: 'yes' });
    await guest.page.goto(`/brunch/${noTimes}`);
    const second = ballot(guest.page);
    await expect(second.times).toContainText('No times yet.');
    await expect(second.times.getByRole('checkbox')).toHaveCount(0);
    await expect(second.locations.getByRole('checkbox')).toHaveCount(2);
  });
});
