import { createBrunch } from '../support/factories';
import { expect, test } from '../support/fixtures';
import { fixturePlaces } from '../support/places';
import { daysFromNow } from '../support/time';
import { addAttendee, ballot, castVotes } from '../support/voting';
import type { Page } from '@playwright/test';

// Journey B11 (spec 0015 M8): a page that is open learns what others did when the person comes back
// to it, and says so politely; it never replaces a ballot that is mid-save, and the person's own vote
// is not announced to them. The page clock moves past the 15-second gap (nothing waits for real
// time); "it asked" is a count of the page requests the framework sends, not a guess.

const TWO_PLACES = [fixturePlaces.sunnySide, fixturePlaces.harborBistro];
const TWO_TIMES = [daysFromNow(10), daysFromNow(11)];

// The page asking the server for itself again is a request that carries _rsc. Next also sends _rsc
// requests to prefetch the pages its links lead to, whenever the browser is idle (so more of them,
// and later, on a slow machine): those are marked with `next-router-prefetch` and are not refreshes.
// Counting them made this journey fail in CI, so only requests without that mark count, and every
// _rsc request is listed in a failure message.
function countRefreshes(page: Page): {
  readonly count: () => number;
  readonly all: () => string;
} {
  const seen: { readonly url: string; readonly prefetch: boolean }[] = [];
  page.on('request', (request) => {
    if (!request.url().includes('_rsc=')) return;
    seen.push({
      url: new URL(request.url()).pathname,
      prefetch: request.headers()['next-router-prefetch'] !== undefined,
    });
  });
  return {
    count: () => seen.filter((request) => !request.prefetch).length,
    all: () => JSON.stringify(seen),
  };
}

// The person comes back to the tab, after a while.
async function comeBack(page: Page): Promise<void> {
  await page.clock.fastForward(20_000);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
}

const announcement = (page: Page) =>
  page.locator('[aria-live="polite"]').filter({ hasText: 'Votes changed' });

test.describe('B11 — an open page catches up when the person comes back', () => {
  test('what others did appears on return and is announced; the own vote is not', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const viewer = await makeActor('viewer');
    const other = await makeActor('other');
    const brunchId = await createBrunch({
      host: host.user,
      locations: TWO_PLACES,
      times: TWO_TIMES,
    });
    await addAttendee({ brunchId, host: host.user, user: viewer.user, response: 'maybe' });
    await addAttendee({ brunchId, host: host.user, user: other.user, response: 'yes' });

    await viewer.page.clock.install();
    const refreshes = countRefreshes(viewer.page);
    await viewer.page.goto(`/brunch/${brunchId}`);
    const { locations } = ballot(viewer.page);
    const harbor = locations.getByRole('checkbox', { name: /^Harbor Bistro/ });
    await expect(harbor).toHaveAccessibleName(/\b0 votes\b/);

    // The person's own vote moves a count and says nothing to them.
    await harbor.check();
    await expect(harbor).toHaveAccessibleName(/\b1 vote\b/);
    expect(await announcement(viewer.page).count()).toBe(0);

    // Someone else votes. Nothing changes on the open page until the person comes back to it.
    await castVotes({ brunchId, voter: other.user, places: ['Harbor Bistro'] });
    await expect(harbor).toHaveAccessibleName(/\b1 vote\b/);

    // The keyboard stays where it was: the page is replaced in place, never under the person's focus.
    await harbor.focus();
    const before = refreshes.count();
    await comeBack(viewer.page);
    await expect(harbor).toHaveAccessibleName(/\b2 votes\b/);
    expect(refreshes.count(), refreshes.all()).toBeGreaterThan(before);
    await expect(harbor).toBeFocused();
    await expect(announcement(viewer.page)).toContainText('Harbor Bistro: 2 votes');

    // It is said once and then taken away, so it is not read again later in browse mode.
    await viewer.page.clock.fastForward(11_000);
    await expect(announcement(viewer.page)).toHaveCount(0);
  });

  test('never over a ballot that did not save, and not before the short gap is over', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const viewer = await makeActor('viewer');
    const other = await makeActor('other');
    const brunchId = await createBrunch({
      host: host.user,
      locations: TWO_PLACES,
      times: TWO_TIMES,
    });
    await addAttendee({ brunchId, host: host.user, user: viewer.user, response: 'maybe' });
    await addAttendee({ brunchId, host: host.user, user: other.user, response: 'yes' });

    await viewer.page.clock.install();
    const refreshes = countRefreshes(viewer.page);
    await viewer.page.goto(`/brunch/${brunchId}`);
    const { locations } = ballot(viewer.page);
    const sunny = locations.getByRole('checkbox', { name: /^Sunny Side Cafe/ });
    const harbor = locations.getByRole('checkbox', { name: /^Harbor Bistro/ });
    await expect(harbor).toHaveAccessibleName(/\b0 votes\b/);

    // Coming back at once (inside the gap) asks for nothing: the same stimulus, too soon.
    await castVotes({ brunchId, voter: other.user, places: ['Harbor Bistro'] });
    const atStart = refreshes.count();
    await viewer.page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await viewer.page.waitForTimeout(500);
    expect(refreshes.count(), refreshes.all()).toBe(atStart);
    await expect(harbor).toHaveAccessibleName(/\b0 votes\b/);

    // A save that fails stays beside the boxes. Coming back now must not replace the page under it.
    await viewer.page.route('**/api/v1/brunches/*/votes/locations', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'internal', message: 'x' } }),
      }),
    );
    await sunny.check();
    await expect(viewer.page.getByText('Something went sideways on our end.')).toBeVisible();
    const beforeBlocked = refreshes.count();
    await comeBack(viewer.page);
    await viewer.page.waitForTimeout(500);
    expect(refreshes.count(), refreshes.all()).toBe(beforeBlocked);
    await expect(harbor).toHaveAccessibleName(/\b0 votes\b/);
    await expect(viewer.page.getByText('Something went sideways on our end.')).toBeVisible();
  });
});
