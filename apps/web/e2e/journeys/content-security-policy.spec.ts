import { randomUUID } from 'node:crypto';
import type { Email } from '@brunchsters/shared';
import type { Page } from '@playwright/test';
import { COLOR_SCHEMES, useColorScheme, type ColorScheme } from '../support/a11y';
import { expectDashboard } from '../support/dashboard';
import { createBrunch, getInviteToken, inviteToBrunch, uniqueSuffix } from '../support/factories';
import { expect, test } from '../support/fixtures';
import {
  expectInvitePreview,
  expectLandingPage,
  expectSignInPage,
  GONE_COLD,
  HOST_ONLY,
  NOT_FOUND,
} from '../support/pages';
import { fixturePlaces } from '../support/places';
import { daysFromNow } from '../support/time';
import { addAttendee, ballot, manageOptions } from '../support/voting';
import { BrunchWizard } from '../support/wizard';

// S3 — the Content-Security-Policy raises no complaint anywhere a person goes (spec 0012 M5,
// ADR 0014). The policy is report-only here: the browser says what it would have blocked and
// blocks nothing, so this journey is what proves the policy is right before it is enforced (M6).
// A violation shows up twice, as a `securitypolicyviolation` event and as a console message, and
// both are collected. It runs in the dev server and on the production build; the policy differs
// (development allows what the dev server needs), so CI's run is the strict one.

type Watcher = { readonly check: (where: string) => Promise<void> };

// Records violations on every page this page loads. Call before the first navigation.
async function watchForViolations(page: Page): Promise<Watcher> {
  await page.addInitScript(() => {
    const recorded: string[] = [];
    (window as unknown as { __cspViolations: string[] }).__cspViolations = recorded;
    document.addEventListener('securitypolicyviolation', (event) => {
      recorded.push(
        `${event.violatedDirective} blocked ${event.blockedURI === '' ? 'an inline resource' : event.blockedURI} (${event.sourceFile}:${event.lineNumber}) ${event.sample}`,
      );
    });
  });
  const consoleReports: string[] = [];
  page.on('console', (message) => {
    if (/content.security.policy/i.test(message.text())) consoleReports.push(message.text());
  });

  return {
    check: async (where) => {
      // Let the page finish its own scripts (streamed data, hydration) before asking.
      await page.waitForLoadState('networkidle');
      const events = await page.evaluate(
        () => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? [],
      );
      expect([...events, ...consoleReports], `CSP complaints on ${where}`).toEqual([]);
    },
  };
}

async function visit(page: Page, watcher: Watcher, path: string, ready: () => Promise<void>) {
  await page.goto(path);
  await ready();
  await watcher.check(path);
}

test.describe('S3 — the Content-Security-Policy and the screens', () => {
  for (const scheme of COLOR_SCHEMES) {
    test(`signed-out pages raise no complaint (${scheme})`, async ({ page, makeActor }) => {
      const host = await makeActor('host');
      const title = `Csp Preview ${uniqueSuffix()}`;
      const brunchId = await createBrunch({ host: host.user, title });
      const guest = `csp-${uniqueSuffix()}@example.com`;
      await inviteToBrunch({ brunchId, host: host.user, invitees: [{ email: guest }] });
      const token = await getInviteToken({ brunchId, email: guest as Email });

      await useColorScheme(page, scheme);
      const watcher = await watchForViolations(page);

      await visit(page, watcher, '/', () => expectLandingPage(page));
      await visit(page, watcher, '/sign-in', () => expectSignInPage(page));
      await visit(page, watcher, `/invite/${token}`, () =>
        expectInvitePreview(page, { title, hostName: host.user.name }),
      );
      await visit(page, watcher, '/invite/not-a-real-token', async () => {
        await expect(page.getByRole('heading', { name: GONE_COLD })).toBeVisible();
      });
      // A signed-out visitor to an address that needs a session is sent to sign in, and the
      // redirect carries the policy too.
      await visit(page, watcher, '/dashboard', () => expectSignInPage(page));
    });

    test(`a host and a guest move through the app without a complaint (${scheme})`, async ({
      makeActor,
    }) => {
      // Many screens in a row, each compiled on first use in dev mode.
      test.slow();
      const host = await makeActor('host');
      const guest = await makeActor('guest');
      const title = `Csp Brunch ${uniqueSuffix()}`;
      const brunchId = await createBrunch({
        host: host.user,
        title,
        locations: [fixturePlaces.sunnySide, fixturePlaces.harborBistro],
        times: [daysFromNow(10), daysFromNow(11)],
      });
      await addAttendee({ brunchId, host: host.user, user: guest.user, response: 'yes' });

      for (const actor of [host, guest]) await useColorScheme(actor.page, scheme as ColorScheme);
      const hostWatch = await watchForViolations(host.page);
      const guestWatch = await watchForViolations(guest.page);

      await visit(host.page, hostWatch, '/dashboard', () => expectDashboard(host.page));
      await visit(host.page, hostWatch, `/brunch/${brunchId}`, async () => {
        await expect(host.page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      });
      await visit(host.page, hostWatch, `/brunch/${brunchId}/manage`, async () => {
        await expect(manageOptions(host.page).locations).toBeVisible();
      });

      // The creation wizard, every step: the most script-heavy screen.
      const wizard = new BrunchWizard(host.page);
      await wizard.open();
      await hostWatch.check('/brunch/new (step 1)');
      await wizard.fillWhat({ title: `Csp Wizard ${uniqueSuffix()}` });
      await wizard.addPlace(fixturePlaces.sunnySide);
      await hostWatch.check('/brunch/new (step 2)');
      await wizard.next();
      await wizard.addTime(10);
      await hostWatch.check('/brunch/new (step 3)');
      await wizard.next();
      await wizard.addEmail(`csp-wizard-${uniqueSuffix()}@example.com`);
      await hostWatch.check('/brunch/new (step 4)');

      // The guest: the page with ballots, an RSVP change, and the host-only page they may not open.
      await visit(guest.page, guestWatch, `/brunch/${brunchId}`, async () => {
        await expect(ballot(guest.page).locations).toBeVisible();
      });
      await guest.page.getByRole('button', { name: 'Maybe' }).click();
      await expect(guest.page.getByText('Current: maybe')).toBeVisible();
      await guestWatch.check('the RSVP change');
      // The page anyone gets for a brunch they may not see.
      await visit(guest.page, guestWatch, `/brunch/${randomUUID()}`, async () => {
        await expect(guest.page.getByText(NOT_FOUND)).toBeVisible();
      });
      await visit(guest.page, guestWatch, `/brunch/${brunchId}/manage`, async () => {
        await expect(guest.page.getByRole('heading', { name: HOST_ONLY })).toBeVisible();
      });

      // Signing out is a form post to this site, then the landing page.
      await visit(host.page, hostWatch, '/dashboard', () => expectDashboard(host.page));
      await host.page.getByRole('button', { name: 'Sign out' }).click();
      await expect(host.page).toHaveURL('/');
      await expectLandingPage(host.page);
      await hostWatch.check('signing out');
    });
  }
});
