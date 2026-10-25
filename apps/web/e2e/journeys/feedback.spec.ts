import type { Page } from '@playwright/test';
import type { BrunchId } from '@brunchsters/shared';
import {
  COLOR_SCHEMES,
  expectNoA11yViolations,
  useColorScheme,
  type ColorScheme,
} from '../support/a11y';
import { type Actor, expect, test } from '../support/fixtures';
import { callOffBrunch } from '../support/lifecycle';
import { createVotingBrunch } from '../support/showcase';
import { TOAST_WORDS, toast, toastRegion } from '../support/toasts';

// Spec 0014 (feedback surfaces), M2: a one-tap action answers in a toast, in the app's voice, and
// the control is as it was. RSVP is the first control on the shared mutation thunk.

const RSVP_ROUTE = '**/api/v1/brunches/*/rsvp';

async function openAsMaybe(makeActor: (label: string) => Promise<Actor>): Promise<{
  readonly page: Page;
  readonly brunchId: BrunchId;
  readonly host: Actor;
}> {
  const host = await makeActor('host');
  const yes = await makeActor('yes');
  const maybe = await makeActor('maybe');
  const pending = await makeActor('pending');
  const { brunchId } = await createVotingBrunch({ host, guests: { yes, maybe, pending } });
  await maybe.page.goto(`/brunch/${brunchId}`);
  await expect(maybe.page.getByRole('heading', { name: 'You in?', exact: true })).toBeVisible();
  return { page: maybe.page, brunchId, host };
}

// axe measures a button halfway through its color transition as low contrast, so it waits for them.
async function settleTransitions(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.allSettled(document.getAnimations().map((animation) => animation.finished)),
  );
}

test.describe('T1 — a failed RSVP tells you so in a toast, and tapping again works', () => {
  test('the toast is in voice (never "Failed to"), the buttons are as they were, and the next tap goes through', async ({
    makeActor,
  }) => {
    const { page } = await openAsMaybe(makeActor);
    const imIn = page.getByRole('button', { name: "I'm in", exact: true });
    const cant = page.getByRole('button', { name: "Can't", exact: true });
    await expect(page.getByText('Current: maybe')).toBeVisible();

    await page.route(RSVP_ROUTE, (route) =>
      route.fulfill({
        status: 500,
        json: { error: { code: 'internal', message: 'Failed to update RSVP' } },
      }),
    );
    await imIn.click();

    await expect(toast(page, TOAST_WORDS.wentSideways)).toBeVisible();
    await expect(page.getByText('Failed to')).toHaveCount(0);
    // As it was: the answer is unchanged and nothing is stuck disabled.
    await expect(page.getByText('Current: maybe')).toBeVisible();
    await expect(imIn).toBeEnabled();
    await expect(cant).toBeEnabled();

    // Once the problem clears the same tap goes through.
    await page.unroute(RSVP_ROUTE);
    await imIn.click();
    await expect(page.getByText('Current: yes')).toBeVisible();
    await expect(toast(page, TOAST_WORDS.imIn)).toBeVisible();
  });

  test('a real refusal from the server reads as its code: a brunch called off after the page loaded', async ({
    makeActor,
  }) => {
    const { page, brunchId, host } = await openAsMaybe(makeActor);

    await callOffBrunch({ brunchId, host: host.user, announce: false });
    await page.getByRole('button', { name: "I'm in", exact: true }).click();

    await expect(toast(page, TOAST_WORDS.calledOff)).toBeVisible();
    await expect(page.getByText('This brunch was called off')).toHaveCount(0);
  });

  test('being offline says so', async ({ makeActor }) => {
    const { page } = await openAsMaybe(makeActor);

    await page.route(RSVP_ROUTE, (route) => route.abort('internetdisconnected'));
    await page.getByRole('button', { name: 'Maybe', exact: true }).click();

    await expect(toast(page, "Looks like you're offline.")).toBeVisible();
    await expect(page.getByRole('button', { name: 'Maybe', exact: true })).toBeEnabled();
  });
});

test.describe('T2 — the toast region', () => {
  test('is a polite status region from the first paint, never takes focus, and a toast goes away by itself', async ({
    makeActor,
  }) => {
    const { page } = await openAsMaybe(makeActor);
    const region = toastRegion(page);
    // There before anything is announced, and empty.
    await expect(region).toHaveCount(1);
    await expect(region).toHaveAttribute('aria-live', 'polite');
    await expect(region.locator('div')).toHaveCount(0);

    const cant = page.getByRole('button', { name: "Can't", exact: true });
    await cant.focus();
    await cant.click();
    const shown = toast(page, TOAST_WORDS.cantMakeIt);
    await expect(shown).toBeVisible();
    // Focus stayed on the control that was tapped: a toast is news, not a question.
    await expect(cant).toBeFocused();

    // A success goes by itself after about four seconds.
    await expect(shown).toBeHidden({ timeout: 10_000 });
    await expect(region.locator('div')).toHaveCount(0);
  });

  test('a toast stays while it has focus, and goes when it is dismissed', async ({ makeActor }) => {
    const { page } = await openAsMaybe(makeActor);
    await page.getByRole('button', { name: "Can't", exact: true }).click();
    const shown = toast(page, TOAST_WORDS.cantMakeIt);
    await expect(shown).toBeVisible();

    // Holding it (focus here, hover for a mouse) pauses the timer: it is still there well after
    // the four seconds it would have had.
    const dismiss = shown.getByRole('button', { name: 'Dismiss' });
    await dismiss.focus();
    await page.waitForTimeout(5_500);
    await expect(shown).toBeVisible();

    await dismiss.click();
    await expect(shown).toBeHidden();
  });

  test('with reduced motion nothing animates', async ({ makeActor }) => {
    const { page } = await openAsMaybe(makeActor);
    await page.emulateMedia({ reducedMotion: 'reduce' });

    await page.getByRole('button', { name: "Can't", exact: true }).click();
    const shown = toast(page, TOAST_WORDS.cantMakeIt);
    await expect(shown).toBeVisible();

    expect(await shown.evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
  });

  test('fits the window: clear of the bottom edge, no sideways scroll, a dismiss button of at least 44px', async ({
    makeActor,
  }) => {
    const { page } = await openAsMaybe(makeActor);
    await page.route(RSVP_ROUTE, (route) =>
      route.fulfill({ status: 500, json: { error: { code: 'internal', message: 'x' } } }),
    );
    await page.getByRole('button', { name: "I'm in", exact: true }).click();
    const shown = toast(page, TOAST_WORDS.wentSideways);
    await expect(shown).toBeVisible();

    // Measured once the toast has finished sliding in, or a fractional position skews it.
    await settleTransitions(page);
    const box = await shown.boundingBox();
    const viewport = page.viewportSize();
    if (box === null || viewport === null) throw new Error('no box to measure');
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    const dismiss = await shown.getByRole('button', { name: 'Dismiss' }).boundingBox();
    expect(Math.round(dismiss?.height ?? 0)).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });

  for (const scheme of COLOR_SCHEMES) {
    test(`passes axe with a success toast and an error toast showing, in ${scheme} mode`, async ({
      makeActor,
    }) => {
      const { page } = await openAsMaybe(makeActor);
      await useColorScheme(page, scheme satisfies ColorScheme);
      await page.reload();
      await expect(page.getByRole('heading', { name: 'You in?', exact: true })).toBeVisible();

      // A success, held (focus) so it is still up while axe runs.
      await page.getByRole('button', { name: "Can't", exact: true }).click();
      const success = toast(page, TOAST_WORDS.cantMakeIt);
      await expect(success).toBeVisible();
      await success.getByRole('button', { name: 'Dismiss' }).focus();
      // The page refresh that follows the save swaps which button is primary, a color transition
      // that must finish before axe measures it: wait for the refreshed answer, then for the motion.
      await expect(page.getByText('Current: no')).toBeVisible();
      await settleTransitions(page);
      await expectNoA11yViolations(page, `the brunch page with a success toast (${scheme})`);
      await success.getByRole('button', { name: 'Dismiss' }).click();

      // A failure.
      await page.route(RSVP_ROUTE, (route) =>
        route.fulfill({ status: 500, json: { error: { code: 'internal', message: 'x' } } }),
      );
      await page.getByRole('button', { name: "I'm in", exact: true }).click();
      const failure = toast(page, TOAST_WORDS.wentSideways);
      await expect(failure).toBeVisible();
      await failure.getByRole('button', { name: 'Dismiss' }).focus();
      await settleTransitions(page);
      await expectNoA11yViolations(page, `the brunch page with an error toast (${scheme})`);
    });
  }
});
