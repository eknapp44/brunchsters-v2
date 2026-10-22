import { createBrunch, uniqueSuffix } from '../support/factories';
import { expect, test } from '../support/fixtures';
import {
  expectInvitePreview,
  expectLandingPage,
  expectSignInPage,
  GONE_COLD,
  GONE_COLD_HELP,
  NOT_FOUND,
} from '../support/pages';
import { fixturePlaces } from '../support/places';
import { inviteNewcomer } from '../support/showcase';
import { addAttendee } from '../support/voting';

// Spec 0011 (design fidelity), the front door and its edges (M5): the landing page and what it
// does and does not say (P9), the 404 that every unreachable address shares (P9), and the invite
// preview a friend sees from a link (P10).

const MISSING_BRUNCH = '00000000-0000-4000-8000-000000000000';

test.describe('P9 — the landing page', () => {
  test('welcomes a visitor, leads to sign-in three ways, and promises only what the app does', async ({
    page,
  }) => {
    await page.goto('/');
    await expectLandingPage(page);

    // "See how" jumps to the three steps on the same page.
    await page.getByRole('link', { name: 'See how' }).click();
    await expect(page).toHaveURL(/#how$/);
    await expect(
      page.getByRole('heading', { level: 2, name: 'Three taps. Brunch on.' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { level: 3 })).toHaveCount(3);

    // Nothing the app cannot do yet: the prototype's copy says all of these.
    const words = (await page.locator('body').innerText()).toLowerCase();
    for (const unbuilt of [
      'apple',
      'plus-one',
      'dietary',
      'reminder',
      'privacy',
      'terms',
      'free',
    ]) {
      expect(words, `the landing page must not mention "${unbuilt}"`).not.toContain(unbuilt);
    }

    // The primary button, and the small "Already in? Sign in" link, both go to sign-in.
    await page.getByRole('link', { name: 'Round up the crew' }).click();
    await expect(page).toHaveURL('/sign-in');
    await expectSignInPage(page);
    await page.goto('/');
    await page.getByRole('link', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL('/sign-in');
  });

  test('a signed-in visitor is offered the dashboard, and signing out lands back here', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    await host.page.goto('/');
    await expect(host.page.getByRole('link', { name: 'Go to dashboard' })).toBeVisible();
    await expect(host.page.getByRole('link', { name: 'Round up the crew' })).toHaveCount(0);
    await expect(host.page.getByRole('link', { name: 'Sign in', exact: true })).toHaveCount(0);

    await host.page.goto('/dashboard');
    await host.page.getByRole('button', { name: 'Sign out' }).click();
    await expect(host.page).toHaveURL('/');
    await expectLandingPage(host.page);
  });
});

test.describe('S1 — security headers', () => {
  test('every page carries the basic protections, and an invite link never leaks its token in a Referer', async ({
    request,
  }) => {
    const home = await request.get('/');
    expect(home.headers()['x-content-type-options']).toBe('nosniff');
    expect(home.headers()['x-frame-options']).toBe('DENY');
    expect(home.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(home.headers()['permissions-policy']).toContain('camera=()');
    expect(home.headers()['x-powered-by']).toBeUndefined();

    const invite = await request.get('/invite/not-a-real-token');
    expect(invite.headers()['referrer-policy']).toBe('no-referrer');
    expect(invite.headers()['x-content-type-options']).toBe('nosniff');
  });
});

test.describe('P9 — sign-in only goes back to this site', () => {
  test('carries a path on this site through sign-in and drops anything that would leave it', async ({
    page,
  }) => {
    const target = page.locator('input[name="callbackUrl"]');

    await page.goto('/sign-in?callbackUrl=/invite/abc123');
    await expect(target).toHaveValue('/invite/abc123');

    for (const hostile of ['https://evil.test/steal', '//evil.test', '/\\evil.test']) {
      await page.goto(`/sign-in?callbackUrl=${encodeURIComponent(hostile)}`);
      await expect(target, hostile).toHaveValue('/dashboard');
    }
  });
});

test.describe('P9 — the 404', () => {
  test('every address nobody can open says exactly the same thing, and never says why', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const outsider = await makeActor('outsider');
    const brunchId = await createBrunch({ host: host.user, title: `Secret ${uniqueSuffix()}` });

    const addresses = [
      `/brunch/${brunchId}`, // real, and the outsider is not in it
      `/brunch/${MISSING_BRUNCH}`, // a made-up id
      '/brunch/not-an-id', // malformed
      '/no-such-page', // not a brunch address at all
    ];
    const texts: string[] = [];
    for (const address of addresses) {
      const response = await outsider.page.goto(address);
      expect(response?.status(), `${address} is a 404`).toBe(404);
      await expect(outsider.page.getByRole('heading', { level: 1, name: NOT_FOUND })).toBeVisible();
      // the page's own words never mention what was looked for
      const main = (await outsider.page.getByRole('main').innerText()).toLowerCase();
      for (const giveaway of ['brunch', 'private', 'permission', 'allowed', 'exist']) {
        expect(main, `${address}: the 404 must not say "${giveaway}"`).not.toContain(giveaway);
      }
      texts.push(await outsider.page.getByRole('main').innerText());
    }
    expect(new Set(texts).size, 'all four 404s read identically').toBe(1);

    await outsider.page.getByRole('link', { name: 'Back home' }).click();
    await expect(outsider.page).toHaveURL('/');
  });
});

test.describe('P10 — the invite preview', () => {
  test('shows who asked, the title and the description, and nothing else about the brunch', async ({
    makeActor,
    page,
  }) => {
    const host = await makeActor('host');
    const friend = await makeActor('friend');
    const title = `Preview ${uniqueSuffix()}`;
    const brunchId = await createBrunch({
      host: host.user,
      title,
      description: 'Sunday vibes, low-key, bring whoever',
      locations: [fixturePlaces.sunnySide, fixturePlaces.harborBistro],
    });
    await addAttendee({ brunchId, host: host.user, user: friend.user, response: 'yes' });
    const link = await inviteNewcomer({ host, brunchId });

    await page.goto(link);
    await expectInvitePreview(page, { title, hostName: host.user.name });
    await expect(page.getByText('“Sunday vibes, low-key, bring whoever”')).toBeVisible();
    await expect(page.getByText('Sign in to RSVP and vote.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in with Google' })).toBeVisible();

    // Constitution 29: the preview is minimal. No place, no other person, no status.
    const body = await page.locator('body').innerText();
    for (const secret of [
      fixturePlaces.sunnySide.name,
      fixturePlaces.harborBistro.name,
      friend.user.name,
      friend.user.email,
      'Active',
    ]) {
      expect(body, `the preview must not show "${secret}"`).not.toContain(secret);
    }
  });

  test('leaves the quote out when the brunch has no description', async ({ makeActor, page }) => {
    const host = await makeActor('host');
    const title = `No description ${uniqueSuffix()}`;
    const brunchId = await createBrunch({ host: host.user, title });
    const link = await inviteNewcomer({ host, brunchId });

    await page.goto(link);
    await expectInvitePreview(page, { title, hostName: host.user.name });
    await expect(page.getByText(/^[“"]/)).toHaveCount(0);
  });

  test('an invite that cannot be used says so in the same words however it failed', async ({
    page,
  }) => {
    await page.goto('/invite/not-a-real-token');
    await expect(page.getByRole('heading', { level: 1, name: GONE_COLD })).toBeVisible();
    await expect(page.getByText(GONE_COLD_HELP)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in with Google' })).toHaveCount(0);
  });
});
