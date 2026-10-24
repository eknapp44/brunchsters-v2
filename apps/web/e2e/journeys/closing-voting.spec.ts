import { getDb } from '../support/db';
import { createBrunch } from '../support/factories';
import { expect, test } from '../support/fixtures';
import { fixturePlaces } from '../support/places';
import { daysFromNow, datetimeLocalIn } from '../support/time';
import { addAttendee, ballot, castVotes, listOptions, passVotingDeadline } from '../support/voting';

// Journeys H2 and H7 (spec 0005 "Host closes voting", PLANNING §9.7).

const TWO_PLACES = [fixturePlaces.sunnySide, fixturePlaces.harborBistro];
const TIMES = [daysFromNow(10), daysFromNow(11)];
const NUDGE = 'Most of the crew has voted';

test.describe('H2 — the nudge to close voting', () => {
  test('appears once at least three are eligible and two thirds of them have voted', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const ann = await makeActor('ann');
    const bob = await makeActor('bob');
    const brunchId = await createBrunch({ host: host.user, locations: TWO_PLACES, times: TIMES });
    // The host counts as eligible, so host + two going attendees = three.
    await addAttendee({ brunchId, host: host.user, user: ann.user, response: 'yes' });
    await addAttendee({ brunchId, host: host.user, user: bob.user, response: 'yes' });

    await host.page.goto(`/brunch/${brunchId}/manage`);
    await expect(host.page.getByText(NUDGE)).toHaveCount(0);

    // One of three voted: not enough.
    await castVotes({
      brunchId,
      voter: ann.user,
      places: [fixturePlaces.sunnySide.name],
      times: [0],
    });
    await host.page.reload();
    await expect(host.page.getByText(NUDGE)).toHaveCount(0);

    // Two of three (about 67%): the nudge appears. It is advice only, so voting is still open.
    await castVotes({
      brunchId,
      voter: bob.user,
      places: [fixturePlaces.sunnySide.name],
      times: [0],
    });
    await host.page.reload();
    await expect(host.page.getByText(NUDGE)).toBeVisible();
    await expect(host.page.getByRole('button', { name: 'Close voting' })).toBeEnabled();
  });

  test('never appears with fewer than three eligible, however many have voted', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const ann = await makeActor('ann');
    const brunchId = await createBrunch({ host: host.user, locations: TWO_PLACES, times: TIMES });
    await addAttendee({ brunchId, host: host.user, user: ann.user, response: 'yes' });
    for (const voter of [host.user, ann.user]) {
      await castVotes({ brunchId, voter, places: [fixturePlaces.sunnySide.name], times: [0] });
    }

    await host.page.goto(`/brunch/${brunchId}/manage`);

    await expect(host.page.getByRole('heading', { name: 'Voting', exact: true })).toBeVisible();
    await expect(host.page.getByText(NUDGE)).toHaveCount(0);
  });
});

test.describe('H2 — setting a deadline and closing voting', () => {
  test('a saved deadline persists and can be cleared; closing ends voting for everyone', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const ann = await makeActor('ann');
    const brunchId = await createBrunch({ host: host.user, locations: TWO_PLACES, times: TIMES });
    await addAttendee({ brunchId, host: host.user, user: ann.user, response: 'yes' });
    const db = getDb();

    // Set a deadline: it is saved, and still there after a reload.
    const deadline = daysFromNow(5, 18, 0);
    await host.page.goto(`/brunch/${brunchId}/manage`);
    const deadlineInput = host.page.getByLabel('Voting closes by');
    await deadlineInput.fill(datetimeLocalIn(deadline, 'America/Chicago'));
    await host.page.getByRole('button', { name: 'Save deadline' }).click();
    await expect
      .poll(async () =>
        (await db.brunch.findFirst({ where: { id: brunchId } }))?.votingDeadline?.getTime(),
      )
      .toBe(deadline.getTime());
    await host.page.reload();
    await expect(deadlineInput).toHaveValue(datetimeLocalIn(deadline, 'America/Chicago'));

    // Clear it again.
    await deadlineInput.fill('');
    await host.page.getByRole('button', { name: 'Save deadline' }).click();
    await expect
      .poll(async () => (await db.brunch.findFirst({ where: { id: brunchId } }))?.votingDeadline)
      .toBeNull();

    // Voting is open for the attendee until the host closes it.
    await ann.page.goto(`/brunch/${brunchId}`);
    const annLocations = ballot(ann.page).locations;
    await expect(annLocations.getByRole('checkbox').first()).toBeEnabled();

    await host.page.getByRole('button', { name: 'Close voting' }).click();
    await expect(host.page.getByText('Voting is closed.')).toBeVisible();
    await expect(host.page.getByRole('button', { name: 'Close voting' })).toHaveCount(0);
    await expect(host.page.getByRole('button', { name: 'Save deadline' })).toHaveCount(0);

    // The attendee's ballot is now read-only...
    await ann.page.reload();
    await expect(annLocations).toContainText('Voting is closed.');
    for (const box of await ann.page.getByRole('checkbox').all()) await expect(box).toBeDisabled();

    // ...and a vote sent anyway (a stale tab, a script) is refused by the server.
    const options = await listOptions(brunchId);
    const late = await ann.context.request.put(`/api/v1/brunches/${brunchId}/votes/locations`, {
      data: { optionIds: [options.locations[0]?.id] },
    });
    expect(late.status()).toBe(409);
    expect(await late.json()).toMatchObject({ error: { code: 'voting_closed' } });
    expect((await db.brunch.findFirst({ where: { id: brunchId } }))?.votingClosedAt).not.toBeNull();
  });
});

test.describe('H7 — a deadline that passes closes voting by itself', () => {
  test('attendees and the host see voting closed although nobody closed it', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const ann = await makeActor('ann');
    const brunchId = await createBrunch({
      host: host.user,
      locations: TWO_PLACES,
      times: TIMES,
      votingDeadline: daysFromNow(2),
    });
    await addAttendee({ brunchId, host: host.user, user: ann.user, response: 'yes' });

    // Before the deadline the ballot is open.
    await ann.page.goto(`/brunch/${brunchId}`);
    await expect(ballot(ann.page).locations.getByRole('checkbox').first()).toBeEnabled();

    await passVotingDeadline(brunchId);

    await ann.page.reload();
    await expect(ballot(ann.page).locations).toContainText('Voting is closed.');
    await expect(ballot(ann.page).times).toContainText('Voting is closed.');
    for (const box of await ann.page.getByRole('checkbox').all()) await expect(box).toBeDisabled();

    await host.page.goto(`/brunch/${brunchId}/manage`);
    await expect(host.page.getByText('Voting is closed.')).toBeVisible();
    await expect(host.page.getByRole('button', { name: 'Close voting' })).toHaveCount(0);

    // Derived, not stored: nobody acted, and the server refuses a late vote all the same.
    expect(
      (await getDb().brunch.findFirst({ where: { id: brunchId } }))?.votingClosedAt,
    ).toBeNull();
    const options = await listOptions(brunchId);
    const late = await ann.context.request.put(`/api/v1/brunches/${brunchId}/votes/times`, {
      data: { optionIds: [options.times[0]?.id] },
    });
    expect(late.status()).toBe(409);
  });
});

test.describe('H8 — a deadline typed before the page has finished loading', () => {
  test('is kept, and saving it saves it', async ({ makeActor }) => {
    const host = await makeActor('host');
    const brunchId = await createBrunch({ host: host.user, locations: TWO_PLACES, times: TIMES });

    // Hold the page's scripts back, so the server-rendered form is on screen and usable well
    // before React has taken it over: what a person with a slow phone sees.
    await host.page.route('**/_next/static/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await route.continue();
    });
    await host.page.goto(`/brunch/${brunchId}/manage`, { waitUntil: 'commit' });

    const deadline = daysFromNow(5, 18, 0);
    const typed = datetimeLocalIn(deadline, 'America/Chicago');
    const deadlineInput = host.page.getByLabel('Voting closes by');
    await deadlineInput.fill(typed);

    // Wait until React owns the page (it marks the nodes it has taken over), then let its
    // first effects run: they must not wipe what was typed.
    const saveButton = host.page.getByRole('button', { name: 'Save deadline' });
    await expect
      .poll(() =>
        saveButton.evaluate((node) =>
          Object.keys(node).some((key) => key.startsWith('__reactProps')),
        ),
      )
      .toBe(true);
    await expect(deadlineInput).toHaveValue(typed);

    await saveButton.click();
    await expect
      .poll(async () =>
        (await getDb().brunch.findFirst({ where: { id: brunchId } }))?.votingDeadline?.getTime(),
      )
      .toBe(deadline.getTime());
  });
});
