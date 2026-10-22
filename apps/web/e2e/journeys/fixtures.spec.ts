import { createBrunch, inviteToBrunch, respondToInvite } from '../support/factories';
import { expect, test } from '../support/fixtures';
import { fixturePlaces } from '../support/places';

// Infrastructure checks, not user journeys: they prove the harness itself is trustworthy.
// If one of these fails, distrust every other result until it is fixed.

test.describe('data isolation', () => {
  // Parallel on purpose: both tests create a brunch with the same title at the same time.
  test.describe.configure({ mode: 'parallel' });

  for (const label of ['first', 'second']) {
    test(`a user only sees their own brunches (${label})`, async ({ makeActor }) => {
      const host = await makeActor(`host-${label}`);
      await createBrunch({ host: host.user, title: 'Shared Title Brunch' });

      await host.page.goto('/dashboard');

      // Exactly one: nothing from the other parallel test leaked in. Seeing the brunch at
      // all also proves the server reads the e2e database the fixtures wrote to.
      await expect(host.page.getByRole('link', { name: 'Shared Title Brunch' })).toHaveCount(1);
    });
  }
});

test.describe('multi-actor fixtures', () => {
  test('two actors keep separate sessions and see the same brunch', async ({ makeActor }) => {
    const host = await makeActor('host');
    const guest = await makeActor('guest');
    const brunchId = await createBrunch({ host: host.user, title: 'Two Identity Brunch' });
    await inviteToBrunch({ brunchId, host: host.user, invitees: [guest.user] });
    await respondToInvite({ brunchId, user: guest.user, response: 'yes' });

    await host.page.goto('/dashboard');
    await guest.page.goto('/dashboard');

    await expect(host.page.getByText(host.user.name)).toBeVisible();
    await expect(guest.page.getByText(guest.user.name)).toBeVisible();
    // Separate sessions: each browser's account area is its own person. (The host does see the
    // guest in the brunch's roster, by design, so this checks the account area, not the page.)
    const hostAccount = host.page.getByRole('navigation', { name: 'Account' });
    await expect(hostAccount).toContainText(host.user.name);
    await expect(hostAccount).not.toContainText(guest.user.name);
    // The invite went through the real services: active brunch, both people going.
    await expect(guest.page.getByRole('link', { name: 'Two Identity Brunch' })).toBeVisible();
    await expect(guest.page.getByText('2 going')).toBeVisible();
  });
});

test.describe('places interception', () => {
  test('search and details are answered from fixtures', async ({ makeActor }) => {
    const { page, places } = await makeActor('searcher');
    await page.goto('/dashboard');

    const results = await page.evaluate(async () => {
      const search = await fetch('/api/v1/places/search?q=sunny');
      const tooShort = await fetch('/api/v1/places/search?q=su');
      const details = await fetch('/api/v1/places/e2e-place-sunny-side');
      const missing = await fetch('/api/v1/places/nope');
      return {
        searchBody: (await search.json()) as unknown,
        tooShortStatus: tooShort.status,
        detailsBody: (await details.json()) as unknown,
        missingStatus: missing.status,
      };
    });

    expect(results.searchBody).toEqual({
      places: [
        {
          placeId: fixturePlaces.sunnySide.placeId,
          name: fixturePlaces.sunnySide.name,
          address: fixturePlaces.sunnySide.address,
        },
      ],
    });
    expect(results.tooShortStatus).toBe(400);
    expect(results.detailsBody).toEqual(fixturePlaces.sunnySide);
    expect(results.missingStatus).toBe(404);
    expect(places.searchQueries()).toEqual(['sunny', 'su']);
    expect(places.detailPlaceIds()).toEqual([fixturePlaces.sunnySide.placeId, 'nope']);
  });

  test('a request that is not intercepted cannot reach Google', async ({ makeActor }) => {
    const { context } = await makeActor('unmocked');

    // APIRequestContext bypasses page routing, so this hits the real route handler. The e2e
    // server has an empty GOOGLE_PLACES_API_KEY, so it must fail instead of calling out.
    const response = await context.request.get('/api/v1/places/search?q=cafe');

    expect(response.status()).toBe(502);
  });
});
