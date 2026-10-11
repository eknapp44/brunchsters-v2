import { createBrunch } from '../support/factories';
import { expect, test } from '../support/fixtures';
import { fixturePlaces } from '../support/places';
import { daysFromNow } from '../support/time';
import { addAttendee, ballot, confirmBrunch } from '../support/voting';

// Journey V6 (spec 0005 "Timezone display during voting", PLANNING §9.3). Times are shown in the
// viewer's own zone; when candidate places are in another zone, a subline gives the time there.
// The browser is pinned to America/Chicago in playwright.config.ts.

const VIEWER_ZONE = 'America/Chicago';
const TIMES = [daysFromNow(10), daysFromNow(11)];

// The same format the page uses (locale en-US, medium date, short time), in an explicit zone so
// the expectation does not depend on the machine running the tests.
function formatIn(date: Date, timeZone: string): string {
  return date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone });
}

test.describe('V6 — timezones during voting', () => {
  test('shows the place’s local time beside each time when a candidate place is in another zone', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const guest = await makeActor('guest');
    // Sunny Side is in the viewer's zone, Harbor Bistro (New York) is not. Places are listed by
    // name, so Harbor Bistro is the one the subline refers to.
    const brunchId = await createBrunch({
      host: host.user,
      locations: [fixturePlaces.sunnySide, fixturePlaces.harborBistro],
      times: TIMES,
    });
    await addAttendee({ brunchId, host: host.user, user: guest.user, response: 'yes' });

    await guest.page.goto(`/brunch/${brunchId}`);

    const rows = ballot(guest.page).times.getByRole('listitem');
    for (const [index, moment] of TIMES.entries()) {
      await expect(rows.nth(index)).toContainText(formatIn(moment, VIEWER_ZONE));
      await expect(rows.nth(index)).toContainText(
        `(at Harbor Bistro's time: ${formatIn(moment, 'America/New_York')})`,
      );
    }
  });

  test('adds nothing when every candidate place is in the viewer’s own zone', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const guest = await makeActor('guest');
    const brunchId = await createBrunch({
      host: host.user,
      locations: [fixturePlaces.sunnySide],
      times: TIMES,
    });
    await addAttendee({ brunchId, host: host.user, user: guest.user, response: 'yes' });

    await guest.page.goto(`/brunch/${brunchId}`);

    const rows = ballot(guest.page).times.getByRole('listitem');
    await expect(rows.nth(0)).toContainText(formatIn(TIMES[0] ?? new Date(), VIEWER_ZONE));
    await expect(ballot(guest.page).times).not.toContainText('(at ');
  });

  test('confirming never shifts the times someone saw while voting', async ({ makeActor }) => {
    const host = await makeActor('host');
    const guest = await makeActor('guest');
    const brunchId = await createBrunch({
      host: host.user,
      locations: [fixturePlaces.harborBistro, fixturePlaces.pacificBrunchHouse],
      times: TIMES,
    });
    await addAttendee({ brunchId, host: host.user, user: guest.user, response: 'yes' });

    await guest.page.goto(`/brunch/${brunchId}`);
    const rows = ballot(guest.page).times.getByRole('listitem');
    const before = await rows.allInnerTexts();
    // While voting, the subline refers to the first candidate place (Harbor Bistro, New York).
    await expect(rows.nth(0)).toContainText("(at Harbor Bistro's time:");
    for (const [index, moment] of TIMES.entries()) {
      await expect(rows.nth(index)).toContainText(formatIn(moment, VIEWER_ZONE));
    }

    // The host picks the Los Angeles place and the first time.
    await confirmBrunch({
      brunchId,
      host: host.user,
      place: fixturePlaces.pacificBrunchHouse.name,
      timeIndex: 0,
    });
    await guest.page.reload();

    // What the guest was shown in their own zone has not moved by an hour or a day...
    for (const [index, moment] of TIMES.entries()) {
      await expect(rows.nth(index)).toContainText(formatIn(moment, VIEWER_ZONE));
    }
    // ...the subline now refers to the place that was confirmed, in that place's zone...
    await expect(rows.nth(0)).toContainText(
      `(at Pacific Brunch House's time: ${formatIn(TIMES[0] ?? new Date(), 'America/Los_Angeles')})`,
    );
    await expect(ballot(guest.page).times).not.toContainText("Harbor Bistro's time");
    // ...and the confirmed time says so.
    await expect(rows.nth(0)).toContainText('Confirmed');
    expect(before).toHaveLength(2);
  });
});
