import { expectDashboard } from '../support/dashboard';
import type { Locator, Page } from '@playwright/test';
import { createBrunch } from '../support/factories';
import { bell, MARK_ALL_READ, inboxRow } from '../support/inbox';
import { giveNotification } from '../support/notifications';
import { TOAST_WORDS, toast } from '../support/toasts';
import { expect, test } from '../support/fixtures';
import { createVotingBrunch } from '../support/showcase';
import { BrunchWizard } from '../support/wizard';

// Journey D4 (spec 0009): the main paths work with the keyboard alone, every stop along the way
// shows where the focus is, and nothing animates when the person asked for less motion.
// Runs on the desktop project only: a keyboard and a touch screen are different tests.

type FocusStop = { readonly drawn: boolean; readonly what: string };

// Where the focus is now, and whether the page draws it: an outline, or a ring on ::after (the
// dashboard's cards are links stretched over the whole card, which draw the ring there).
async function currentFocus(page: Page): Promise<FocusStop> {
  return page.evaluate(() => {
    const element = document.activeElement;
    if (element === null || element === document.body) {
      return { drawn: false, what: 'nothing has focus' };
    }
    const outlined = (style: CSSStyleDeclaration): boolean =>
      style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
    const own = getComputedStyle(element);
    const after = getComputedStyle(element, '::after');
    const text = (element.textContent ?? '').trim() || element.getAttribute('aria-label') || '';
    return {
      drawn: outlined(own) || (after.content !== 'none' && outlined(after)),
      what: `<${element.tagName.toLowerCase()}> ${text.slice(0, 40)}`,
    };
  });
}

// Presses Tab until `target` has focus, checking that every stop on the way (and the target)
// shows a focus indicator. Fails, naming the stops passed, if the target is not reached.
async function tabTo(page: Page, target: Locator, maxPresses = 15): Promise<void> {
  const passed: string[] = [];
  for (let press = 0; press < maxPresses; press += 1) {
    await page.keyboard.press('Tab');
    const stop = await currentFocus(page);
    expect(
      stop.drawn,
      `no focus indicator on ${stop.what} (stops so far: ${passed.join(' > ')})`,
    ).toBe(true);
    passed.push(stop.what);
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error(`Never reached the target by keyboard. Stops: ${passed.join(' > ')}`);
}

test.describe('D4 — the keyboard alone', () => {
  test('the dashboard: reach Plan a Brunch and a brunch card, and open them', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const title = 'Keyboard Brunch';
    const brunchId = await createBrunch({ host: host.user, title });
    await host.page.goto('/dashboard');
    await expect(host.page.getByRole('link', { name: title })).toBeVisible();

    await tabTo(host.page, host.page.getByRole('link', { name: 'Plan a Brunch' }));
    await tabTo(host.page, host.page.getByRole('link', { name: title }));
    await host.page.keyboard.press('Enter');
    await expect(host.page).toHaveURL(`/brunch/${brunchId}`);
  });

  test('the bell and the inbox: reach the bell, open it, mark all read, and keep the focus (spec 0015)', async ({
    makeActor,
  }) => {
    const ann = await makeActor('ann');
    await giveNotification({ user: ann.user });
    await ann.page.goto('/dashboard');
    await expect(bell(ann.page)).toHaveAccessibleName('Notifications, 1 unread');

    await tabTo(ann.page, bell(ann.page));
    await ann.page.keyboard.press('Enter');
    await expect(ann.page).toHaveURL('/notifications');
    await expect(inboxRow(ann.page, 'called off')).toBeVisible();

    // Pressing it leaves nothing to mark; the focus must stay on the button, not fall to the page.
    const markAll = ann.page.getByRole('button', { name: MARK_ALL_READ });
    await tabTo(ann.page, markAll);
    await ann.page.keyboard.press('Enter');
    // Wait for the request to be over (the toast), not just for the number to drop: the button is
    // `aria-disabled` while it is out, which would make this pass whatever it does afterwards.
    await expect(toast(ann.page, TOAST_WORDS.allCaughtUp)).toBeVisible();
    await expect(bell(ann.page)).toHaveAccessibleName('Notifications');
    await expect(markAll).toHaveAttribute('aria-disabled', 'true');
    await expect(markAll).toBeFocused();
  });

  test('the settings switches: reach one by keyboard, see where the focus is, and flip it (spec 0015)', async ({
    makeActor,
  }) => {
    const ann = await makeActor('ann');
    await ann.page.goto('/settings/notifications');
    const first = ann.page.getByRole('switch', { name: 'Someone invites you, in the app' });
    await expect(first).toBeVisible();

    // The real input is invisible and the ring is drawn on the track beside it, so look there: a
    // focus that cannot be seen is a keyboard user lost on the page.
    for (let press = 0; press < 12; press += 1) {
      await ann.page.keyboard.press('Tab');
      if (await first.evaluate((element) => element === document.activeElement)) break;
    }
    await expect(first).toBeFocused();
    const ring = await first.evaluate((input) => {
      const track = input.nextElementSibling;
      if (track === null) return 'no track';
      const style = getComputedStyle(track);
      return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0 ? 'drawn' : 'none';
    });
    expect(ring, 'the focus ring on the switch track').toBe('drawn');

    await ann.page.keyboard.press('Space');
    await expect(first).not.toBeChecked();
    await expect(first).toBeFocused();
  });

  test('the wizard: fill in the first step and move on', async ({ makeActor }) => {
    const host = await makeActor('host');
    const wizard = new BrunchWizard(host.page);
    await wizard.open();

    await tabTo(host.page, host.page.getByLabel('Title'));
    await host.page.keyboard.type('Typed Without A Mouse');
    await tabTo(host.page, host.page.getByLabel('Description'));
    await tabTo(host.page, host.page.getByRole('button', { name: 'Continue', exact: true }));
    await host.page.keyboard.press('Enter');
    await expect(
      host.page.getByRole('progressbar', { name: 'Brunch planning progress' }),
    ).toHaveAttribute('aria-valuetext', 'Step 2 of 4: Where');
  });

  test('the brunch page: answer the RSVP', async ({ makeActor }) => {
    const host = await makeActor('host');
    const yes = await makeActor('yes');
    const maybe = await makeActor('maybe');
    const pending = await makeActor('pending');
    const voting = await createVotingBrunch({ host, guests: { yes, maybe, pending } });
    await yes.page.goto(`/brunch/${voting.brunchId}`);
    await expect(yes.page.getByText('Current: yes')).toBeVisible();

    await tabTo(yes.page, yes.page.getByRole('button', { name: "Can't", exact: true }));
    await yes.page.keyboard.press('Space');
    await expect(yes.page.getByText('Current: no')).toBeVisible();
  });
});

// "reduce" is what the operating system's "reduce motion" setting sends. Every transition and
// animation must be effectively instant (the base styles shrink them to 0.001ms).
async function longestMotion(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => {
    const seconds = (list: string): number =>
      Math.max(
        0,
        ...list.split(',').map((value) => {
          const trimmed = value.trim();
          return trimmed.endsWith('ms') ? parseFloat(trimmed) / 1000 : parseFloat(trimmed);
        }),
      );
    return Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .map((element) => {
        const style = getComputedStyle(element);
        return {
          element,
          longest: Math.max(seconds(style.transitionDuration), seconds(style.animationDuration)),
        };
      })
      .filter(({ longest }) => longest > 0.01)
      .map(
        ({ element, longest }) =>
          `<${element.tagName.toLowerCase()} class="${String(element.className).slice(0, 40)}"> ${longest}s`,
      );
  });
}

test.describe('D4 — reduced motion', () => {
  test('nothing on the main screens transitions or animates', async ({ makeActor }) => {
    const host = await makeActor('host');
    const yes = await makeActor('yes');
    const maybe = await makeActor('maybe');
    const pending = await makeActor('pending');
    const voting = await createVotingBrunch({ host, guests: { yes, maybe, pending } });
    await host.page.emulateMedia({ reducedMotion: 'reduce' });

    await host.page.goto('/dashboard');
    await expectDashboard(host.page);
    expect(await longestMotion(host.page), 'motion on the dashboard').toEqual([]);

    const wizard = new BrunchWizard(host.page);
    await wizard.open();
    await host.page.getByLabel('Title').fill('Calm Brunch');
    await wizard.next();
    expect(await longestMotion(host.page), 'motion in the wizard').toEqual([]);

    await host.page.goto(`/brunch/${voting.brunchId}`);
    await expect(host.page.getByRole('heading', { name: voting.title })).toBeVisible();
    expect(await longestMotion(host.page), 'motion on the brunch page').toEqual([]);

    await host.page.goto(`/brunch/${voting.brunchId}/manage`);
    await expect(host.page.getByRole('heading', { name: 'Confirm', exact: true })).toBeVisible();
    expect(await longestMotion(host.page), 'motion on the manage page').toEqual([]);
  });

  test('the same screens do animate when motion is allowed (the check can see motion)', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    await host.page.emulateMedia({ reducedMotion: 'no-preference' });
    const wizard = new BrunchWizard(host.page);
    await wizard.open();
    expect((await longestMotion(host.page)).length).toBeGreaterThan(0);
  });
});
