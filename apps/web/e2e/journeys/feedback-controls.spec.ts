import { RATE_LIMIT_POLICIES } from '@brunchsters/shared';
import { createBrunch, inviteToBrunch, uniqueSuffix } from '../support/factories';
import { type Actor, expect, test } from '../support/fixtures';
import { inviteRow } from '../support/invites';
import { SIGN_IN_HEADING } from '../support/pages';
import { fixturePlaces } from '../support/places';
import { createVotingBrunch } from '../support/showcase';
import { daysFromNow, datetimeLocalIn } from '../support/time';
import { TOAST_WORDS, toast, toastRegion } from '../support/toasts';
import { addAttendee, ballot, removeLocationByName } from '../support/voting';
import { BrunchWizard } from '../support/wizard';
import type { Email } from '@brunchsters/shared';

// Spec 0014 (feedback surfaces), M3: the ballots, the invite panel and the voting controls on the
// shared thunk. Where a failure shows is the control's own call: a toast for a one-tap result,
// an inline line for what the person has to fix or wait out.

const RSVP_ROUTE = '**/api/v1/brunches/*/rsvp';

const coded = (code: string, message = 'x') => ({ error: { code, message } });

test.describe('T3 — being told to slow down', () => {
  test('a control with no wait of its own (RSVP) toasts it and stays usable', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const yes = await makeActor('yes');
    const maybe = await makeActor('maybe');
    const pending = await makeActor('pending');
    const { brunchId } = await createVotingBrunch({ host, guests: { yes, maybe, pending } });
    await maybe.page.goto(`/brunch/${brunchId}`);
    const imIn = maybe.page.getByRole('button', { name: "I'm in", exact: true });

    await maybe.page.route(RSVP_ROUTE, (route) =>
      route.fulfill({
        status: 429,
        headers: { 'Retry-After': '30' },
        json: {
          ...coded('rate_limited'),
          policy: RATE_LIMIT_POLICIES.writesPerUser.name,
          retryAfterSeconds: 30,
        },
      }),
    );
    await imIn.click();

    await expect(toast(maybe.page, TOAST_WORDS.slowDown)).toBeVisible();
    await expect(imIn).toBeEnabled();
  });

  test("a refused resend is the invite row's own wait, shown inline and never also as a toast", async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const guest = `wait-${uniqueSuffix()}@example.com` as Email;
    const brunchId = await createBrunch({ host: host.user });
    await inviteToBrunch({ brunchId, host: host.user, invitees: [{ email: guest }] });
    await host.page.goto(`/brunch/${brunchId}`);

    let resendRequests = 0;
    await host.page.route('**/api/v1/invites/*/resend', (route) => {
      resendRequests += 1;
      return route.fulfill({
        status: 429,
        headers: { 'Retry-After': '120' },
        json: {
          ...coded('rate_limited'),
          policy: RATE_LIMIT_POLICIES.resendPerInvite.name,
          retryAfterSeconds: 120,
        },
      });
    });
    await inviteRow(host.page, guest).getByRole('button', { name: 'Resend' }).click();

    await expect(inviteRow(host.page, guest)).toContainText(
      'That one just went out. Give it 2 minutes.',
    );
    // The click really reached the server (a button already waiting would send nothing).
    expect(resendRequests).toBe(1);
    // A "never" needs time to be true: give a toast the moment it would have taken to appear.
    await host.page.waitForTimeout(600);
    // One look, not a retrying one: a toast that came would be gone again in a few seconds.
    expect(await toastRegion(host.page).locator('div').count()).toBe(0);
  });
});

test.describe('T7 — a ballot the host changed under the voter', () => {
  test('an option removed while the voter was looking: the vote is refused in voice, the box rolls back, and the page shows what is left', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const voter = await makeActor('voter');
    const places = [
      fixturePlaces.sunnySide,
      fixturePlaces.harborBistro,
      fixturePlaces.pacificBrunchHouse,
    ];
    const brunchId = await createBrunch({
      host: host.user,
      locations: places,
      times: [daysFromNow(10), daysFromNow(11)],
    });
    await addAttendee({ brunchId, host: host.user, user: voter.user, response: 'yes' });
    await voter.page.goto(`/brunch/${brunchId}`);
    const { locations } = ballot(voter.page);
    await expect(locations.getByRole('checkbox')).toHaveCount(3);

    // The host removes a place; the voter's page does not know yet, and ticks it.
    await removeLocationByName({ brunchId, host: host.user, place: fixturePlaces.sunnySide.name });
    await locations
      .getByRole('checkbox', { name: new RegExp(`^${fixturePlaces.sunnySide.name}`) })
      .click();

    // A real refusal from the server, worded from its code, inline beside the ballot...
    await expect(
      voter.page.getByRole('alert').filter({ hasText: 'That one just came off the table.' }),
    ).toBeVisible();
    // ...and the page asked again, so the removed place is gone and nothing stays ticked for it.
    await expect(locations.getByRole('checkbox')).toHaveCount(2);
    await expect(
      locations.getByRole('checkbox', { name: new RegExp(`^${fixturePlaces.sunnySide.name}`) }),
    ).toHaveCount(0);
    await expect(locations.getByRole('checkbox', { checked: true })).toHaveCount(0);
  });
});

test.describe('T10 — the invite panel', () => {
  test('a failed send is an inline line beside the field in voice, the typed address stays, and sending again works', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const brunchId = await createBrunch({ host: host.user });
    const guest = `typed-${uniqueSuffix()}@example.com`;
    await host.page.goto(`/brunch/${brunchId}`);
    const field = host.page.getByLabel('Invite more people');
    await field.fill(guest);

    await host.page.route(`**/api/v1/brunches/${brunchId}/invites`, (route) =>
      route.fulfill({ status: 500, json: coded('internal', 'Failed to send invites') }),
    );
    await host.page.getByRole('button', { name: 'Round up the crew' }).click();

    await expect(
      host.page.getByRole('alert').filter({ hasText: TOAST_WORDS.wentSideways }),
    ).toBeVisible();
    await expect(field).toHaveValue(guest);
    await host.page.waitForTimeout(600);
    // One look, not a retrying one: a toast that came would be gone again in a few seconds.
    expect(await toastRegion(host.page).locator('div').count()).toBe(0);

    await host.page.unroute(`**/api/v1/brunches/${brunchId}/invites`);
    await host.page.getByRole('button', { name: 'Round up the crew' }).click();
    await expect(inviteRow(host.page, guest)).toContainText('pending');
    await expect(host.page.getByText(TOAST_WORDS.wentSideways)).toHaveCount(0);
  });

  test('a failed revoke toasts and the invite stays; a resend says it went; copy says it copied, or that it could not', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const guest = `row-${uniqueSuffix()}@example.com` as Email;
    const brunchId = await createBrunch({ host: host.user });
    await inviteToBrunch({ brunchId, host: host.user, invitees: [{ email: guest }] });
    await host.page.goto(`/brunch/${brunchId}`);
    const row = inviteRow(host.page, guest);

    // Revoke fails: a toast, the invite is still listed, and the buttons are usable.
    await host.page.route('**/api/v1/invites/*', (route) =>
      route.request().method() === 'DELETE'
        ? route.fulfill({ status: 500, json: coded('internal') })
        : route.continue(),
    );
    await row.getByRole('button', { name: 'Revoke' }).click();
    await expect(toast(host.page, TOAST_WORDS.wentSideways)).toBeVisible();
    await expect(row).toBeVisible();
    await expect(row.getByRole('button', { name: 'Revoke' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await host.page.unroute('**/api/v1/invites/*');

    // A resend that goes out says so.
    await row.getByRole('button', { name: 'Resend' }).click();
    await expect(toast(host.page, TOAST_WORDS.inviteResent)).toBeVisible();

    // Copy: the browser says yes...
    await host.context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await row.getByRole('button', { name: 'Copy link' }).click();
    await expect(toast(host.page, TOAST_WORDS.linkCopied)).toBeVisible();

    // ...or no, which used to fail without a word.
    await host.page.evaluate(() => {
      navigator.clipboard.writeText = () => Promise.reject(new Error('denied'));
    });
    await row.getByRole('button', { name: /Copy link|Copied!/ }).click();
    await expect(toast(host.page, "That didn't copy. Your browser wouldn't let it.")).toBeVisible();
  });
});

test.describe('T11 — the voting controls', () => {
  test('saving a deadline says so; a refused one stays inline beside the field; closing voting that fails toasts', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const voter = await makeActor('voter');
    const brunchId = await createBrunch({
      host: host.user,
      locations: [fixturePlaces.sunnySide, fixturePlaces.harborBistro],
      times: [daysFromNow(10), daysFromNow(11)],
    });
    await addAttendee({ brunchId, host: host.user, user: voter.user, response: 'yes' });
    await host.page.goto(`/brunch/${brunchId}/manage`);
    const field = host.page.getByLabel('Voting closes by');
    const save = host.page.getByRole('button', { name: 'Save deadline' });

    // A real save: the saved value looks like what was typed, so a toast says it landed.
    await field.fill(datetimeLocalIn(daysFromNow(5, 18, 0), 'America/Chicago'));
    await save.click();
    await expect(toast(host.page, TOAST_WORDS.deadlineSaved)).toBeVisible();

    // A refusal is the person's to fix: inline, beside the field, not a toast.
    await host.page.route(`**/api/v1/brunches/${brunchId}/voting/deadline`, (route) =>
      route.fulfill({ status: 422, json: coded('invalid') }),
    );
    await save.click();
    await expect(
      host.page.getByRole('alert').filter({ hasText: "That didn't look right." }),
    ).toBeVisible();
    await host.page.unroute(`**/api/v1/brunches/${brunchId}/voting/deadline`);

    // Closing voting is one tap with nothing to fix, so a failure is a toast.
    await host.page.route(`**/api/v1/brunches/${brunchId}/voting/close`, (route) =>
      route.fulfill({ status: 500, json: coded('internal') }),
    );
    await host.page.getByRole('button', { name: 'Close voting' }).click();
    await expect(toast(host.page, TOAST_WORDS.wentSideways)).toBeVisible();
    await expect(host.page.getByRole('button', { name: 'Close voting' })).toBeEnabled();
    await expect(host.page.getByText('Voting is closed.')).toHaveCount(0);
  });
});

// M4: the remaining controls. Each recovery path has a journey: where the failure shows, that the
// control is as it was, and that the next try works.

test.describe('T12 — locking it in', () => {
  test('a refusal that means the brunch moved on is inline beside the radios, and the button is usable again', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const yes = await makeActor('yes');
    const maybe = await makeActor('maybe');
    const pending = await makeActor('pending');
    const { brunchId } = await createVotingBrunch({ host, guests: { yes, maybe, pending } });
    await host.page.goto(`/brunch/${brunchId}/manage`);
    const lockIt = host.page.getByRole('button', { name: 'Lock it in' });
    await expect(lockIt).toBeEnabled();

    await host.page.route(`**/api/v1/brunches/${brunchId}/confirm`, (route) =>
      route.fulfill({ status: 409, json: coded('already_confirmed') }),
    );
    await lockIt.click();

    await expect(
      host.page.getByRole('alert').filter({ hasText: TOAST_WORDS.alreadyConfirmed }),
    ).toBeVisible();
    await expect(lockIt).toBeEnabled();
  });
});

test.describe('T13 — managing options', () => {
  test('a failed add is inline and keeps what was typed; a failed remove is a toast and the row stays', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const guest = await makeActor('guest');
    const brunchId = await createBrunch({
      host: host.user,
      locations: [fixturePlaces.sunnySide, fixturePlaces.harborBistro],
      times: [daysFromNow(10), daysFromNow(11)],
    });
    // Active, so nothing here is held back for being a draft.
    await addAttendee({ brunchId, host: host.user, user: guest.user, response: 'yes' });
    await host.page.goto(`/brunch/${brunchId}/manage`);
    const typed = datetimeLocalIn(daysFromNow(20, 11, 0), 'America/Chicago');
    const field = host.page.getByLabel('Date and time to add');

    await host.page.route(`**/api/v1/brunches/${brunchId}/times`, (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 500, json: coded('internal') })
        : route.fallback(),
    );
    await field.fill(typed);
    await host.page.getByRole('button', { name: 'Add Time' }).click();
    await expect(
      host.page.getByRole('alert').filter({ hasText: TOAST_WORDS.wentSideways }),
    ).toBeVisible();
    await expect(field).toHaveValue(typed);
    await host.page.waitForTimeout(600);
    expect(await toastRegion(host.page).locator('div').count()).toBe(0);

    // Removing a place that fails: a toast, and the place is still listed.
    await host.page.route(`**/api/v1/brunches/${brunchId}/locations/*`, (route) =>
      route.fulfill({ status: 500, json: coded('internal') }),
    );
    const sunny = host.page.getByRole('listitem').filter({ hasText: fixturePlaces.sunnySide.name });
    await sunny.getByRole('button', { name: 'Remove' }).click();
    await expect(toast(host.page, TOAST_WORDS.wentSideways)).toBeVisible();
    await expect(sunny).toHaveCount(1);
    await expect(sunny.getByRole('button', { name: 'Remove' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});

test.describe('T14 — suggestions', () => {
  test('a failed suggestion is inline; a failed approval is a toast and the row stays, then it goes through', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const suggester = await makeActor('suggester');
    const brunchId = await createBrunch({
      host: host.user,
      locations: [fixturePlaces.sunnySide, fixturePlaces.harborBistro],
      times: [daysFromNow(10), daysFromNow(11)],
    });
    await addAttendee({ brunchId, host: host.user, user: suggester.user, response: 'yes' });
    await suggester.page.goto(`/brunch/${brunchId}`);
    const typed = datetimeLocalIn(daysFromNow(20, 11, 0), 'America/Chicago');

    // The suggestion fails: inline beside the field, what was typed is still there.
    const suggestRoute = `**/api/v1/brunches/${brunchId}/time-suggestions`;
    await suggester.page.route(suggestRoute, (route) =>
      route.fulfill({ status: 500, json: coded('internal') }),
    );
    await suggester.page.getByLabel('Suggested date and time').fill(typed);
    await suggester.page.getByRole('button', { name: 'Suggest this time' }).click();
    await expect(
      suggester.page.getByRole('alert').filter({ hasText: TOAST_WORDS.wentSideways }),
    ).toBeVisible();
    await expect(suggester.page.getByLabel('Suggested date and time')).toHaveValue(typed);

    // Try again and it goes through: it waits for the host.
    await suggester.page.unroute(suggestRoute);
    await suggester.page.getByRole('button', { name: 'Suggest this time' }).click();
    await expect(suggester.page.getByText('(awaiting host approval)')).toBeVisible();

    // The host's approval fails: a toast, the row stays, the buttons are usable.
    await host.page.goto(`/brunch/${brunchId}/manage`);
    const pendingRow = host.page
      .getByRole('listitem')
      .filter({ hasText: `suggested by ${suggester.user.name}` });
    await host.page.route('**/api/v1/time-suggestions/*/review', (route) =>
      route.fulfill({ status: 500, json: coded('internal') }),
    );
    await pendingRow.getByRole('button', { name: 'Approve' }).click();
    await expect(toast(host.page, TOAST_WORDS.wentSideways)).toBeVisible();
    await expect(pendingRow).toHaveCount(1);

    await host.page.unroute('**/api/v1/time-suggestions/*/review');
    await pendingRow.getByRole('button', { name: 'Approve' }).click();
    await expect(pendingRow).toHaveCount(0);
  });
});

test.describe('T15 — the end of the road, and hiding', () => {
  test('a failed call-off stays inside its dialog in voice, and Bring it back fails as a toast', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const guest = await makeActor('guest');
    const brunchId = await createBrunch({ host: host.user });
    await addAttendee({ brunchId, host: host.user, user: guest.user, response: 'yes' });
    await host.page.goto(`/brunch/${brunchId}/manage`);

    // The call-off fails: the dialog stays, with the line inside it, and nothing is toasted.
    await host.page.route(`**/api/v1/brunches/${brunchId}/cancel`, (route) =>
      route.fulfill({ status: 500, json: coded('internal') }),
    );
    await host.page.getByRole('button', { name: 'Call it off', exact: true }).click();
    const dialog = host.page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Call it off', exact: true }).click();
    await expect(
      dialog.getByRole('alert').filter({ hasText: TOAST_WORDS.wentSideways }),
    ).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Nope, keep it' })).toBeEnabled();
    await host.page.waitForTimeout(600);
    expect(await toastRegion(host.page).locator('div').count()).toBe(0);

    // The next try goes through, and Bring it back is the way out of it.
    await host.page.unroute(`**/api/v1/brunches/${brunchId}/cancel`);
    await dialog.getByRole('button', { name: 'Call it off', exact: true }).click();
    const bringBack = host.page.getByRole('button', { name: 'Bring it back' });
    await expect(bringBack).toBeVisible();

    await host.page.route(`**/api/v1/brunches/${brunchId}/reinstate`, (route) =>
      route.fulfill({ status: 500, json: coded('internal') }),
    );
    await bringBack.click();
    await expect(toast(host.page, TOAST_WORDS.wentSideways)).toBeVisible();
    await expect(bringBack).toBeVisible();
    await expect(bringBack).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('hiding from the brunch page: a failure toasts, and the result is said once', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const guest = await makeActor('guest');
    const brunchId = await createBrunch({ host: host.user });
    await addAttendee({ brunchId, host: host.user, user: guest.user, response: 'yes' });
    await guest.page.goto(`/brunch/${brunchId}`);
    const hide = guest.page.getByRole('button', { name: 'Hide from my dashboard' });

    await guest.page.route(`**/api/v1/brunches/${brunchId}/hidden`, (route) =>
      route.fulfill({ status: 500, json: coded('internal') }),
    );
    await hide.click();
    await expect(toast(guest.page, TOAST_WORDS.wentSideways)).toBeVisible();
    await expect(hide).toBeVisible();

    await guest.page.unroute(`**/api/v1/brunches/${brunchId}/hidden`);
    await hide.click();
    await expect(toast(guest.page, TOAST_WORDS.hidden)).toBeVisible();
  });
});

// M5: the wizard's invite response, the place search, and a session that ends mid-use.

test.describe('T4 — a session that ends while a page is open', () => {
  test('the next tap says so and sends the person to sign in, with a way back to this page', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const yes = await makeActor('yes');
    const maybe = await makeActor('maybe');
    const pending = await makeActor('pending');
    const { brunchId } = await createVotingBrunch({ host, guests: { yes, maybe, pending } });
    await maybe.page.goto(`/brunch/${brunchId}`);
    await expect(maybe.page.getByRole('heading', { name: 'You in?', exact: true })).toBeVisible();

    // The session ends: the cookie is gone, the page is still open. The next request is refused by
    // the middleware (the real 401), not by anything stubbed here.
    // (Let the page's own background requests finish first: a late one could set the cookie again.)
    await maybe.page.waitForLoadState('networkidle');
    await maybe.context.clearCookies();
    await expect.poll(async () => (await maybe.context.cookies()).length).toBe(0);
    await maybe.page.getByRole('button', { name: "I'm in", exact: true }).click();

    await expect(maybe.page).toHaveURL(
      new RegExp(`/sign-in\\?callbackUrl=${encodeURIComponent(`/brunch/${brunchId}`)}$`),
    );
    await expect(maybe.page.getByRole('heading', { name: SIGN_IN_HEADING })).toBeVisible();
  });
});

test.describe('T6 — a brunch created with invites that did not go out', () => {
  test('the host still reaches the brunch, the Invites panel says so, and sending again clears it', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const wizard = new BrunchWizard(host.page);
    const title = `Invites Fail ${uniqueSuffix()}`;
    const guest = `guest-${uniqueSuffix()}@example.com`;

    await wizard.open();
    await wizard.fillWhat({ title });
    await wizard.addPlace(fixturePlaces.sunnySide);
    await wizard.next();
    await wizard.addTime(10);
    await wizard.next();
    await wizard.addEmail(guest);

    // Only the invite batch fails; the create call is the real one.
    const invitesRoute = '**/api/v1/brunches/*/invites';
    await host.page.route(invitesRoute, (route) =>
      route.fulfill({ status: 500, json: coded('internal', 'Failed to send invites') }),
    );
    await wizard.create();

    await expect(host.page).toHaveURL(/\/brunch\/[0-9a-f-]{36}$/);
    await expect(host.page.getByRole('heading', { name: title })).toBeVisible();
    const note = host.page
      .getByRole('status')
      .filter({ hasText: "Your brunch is up, but the invites didn't go out." });
    await expect(note).toBeVisible();
    await expect(host.page.getByText('No invites sent yet.')).toBeVisible();

    // It stays until an invite goes out, and then it is over.
    await host.page.unroute(invitesRoute);
    await host.page.getByLabel('Invite more people').fill(guest);
    await host.page.getByRole('button', { name: 'Round up the crew' }).click();
    await expect(inviteRow(host.page, guest)).toContainText('pending');
    await expect(note).toHaveCount(0);
  });

  test('a batch refused for the day (429) is not called a failure: the page shows its own wait', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const wizard = new BrunchWizard(host.page);
    const title = `Invites Wait ${uniqueSuffix()}`;

    await wizard.open();
    await wizard.fillWhat({ title });
    await wizard.addPlace(fixturePlaces.sunnySide);
    await wizard.next();
    await wizard.addTime(10);
    await wizard.next();
    await wizard.addEmail(`guest-${uniqueSuffix()}@example.com`);
    await host.page.route('**/api/v1/brunches/*/invites', (route) =>
      route.fulfill({
        status: 429,
        headers: { 'Retry-After': '3600' },
        json: {
          ...coded('rate_limited'),
          policy: RATE_LIMIT_POLICIES.inviteEmailsPerHost.name,
          retryAfterSeconds: 3600,
        },
      }),
    );
    await wizard.create();

    await expect(host.page).toHaveURL(/\/brunch\/[0-9a-f-]{36}$/);
    await host.page.waitForTimeout(600);
    expect(
      await host.page.getByText("Your brunch is up, but the invites didn't go out.").count(),
    ).toBe(0);
  });
});

test.describe('T8 — searching for a place', () => {
  test('a slow answer to an earlier query never lands on top of the newest one', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const wizard = new BrunchWizard(host.page);
    await wizard.open();
    await wizard.fillWhat({ title: `Stale Search ${uniqueSuffix()}` });

    // The first query's answer is held; the second's comes at once (the context's own mock).
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const asked: string[] = [];
    await host.page.route('**/api/v1/places/search**', async (route) => {
      const query = new URL(route.request().url()).searchParams.get('q') ?? '';
      asked.push(query);
      if (query !== 'harb') return route.fallback();
      await held;
      const { placeId, name, address } = fixturePlaces.harborBistro;
      // The browser may have given up on this request already; that is the point.
      await route
        .fulfill({ status: 200, json: { places: [{ placeId, name, address }] } })
        .catch(() => undefined);
    });

    await wizard.searchBox().fill('harb');
    await expect.poll(() => asked).toContain('harb');
    await wizard.searchBox().fill('sunny');
    const sunny = host.page.getByRole('button', {
      name: `${fixturePlaces.sunnySide.name} — ${fixturePlaces.sunnySide.address}`,
    });
    await expect(sunny).toBeVisible();

    // Now the old answer arrives. It must not replace the results of what is typed.
    release();
    await host.page.waitForTimeout(800);
    await expect(sunny).toBeVisible();
    await expect(
      host.page.getByRole('button', { name: new RegExp(fixturePlaces.harborBistro.name) }),
    ).toHaveCount(0);

    // And picking the result fills the wizard from the right place.
    await sunny.click();
    await expect(wizard.selectedItem(fixturePlaces.sunnySide.name)).toBeVisible();
  });

  test('a search our end could not answer says so beside the input, and the next answer clears it', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const wizard = new BrunchWizard(host.page);
    await wizard.open();
    await wizard.fillWhat({ title: `Search Down ${uniqueSuffix()}` });

    let down = true;
    await host.page.route('**/api/v1/places/search**', (route) =>
      down ? route.fulfill({ status: 502, json: coded('unavailable') }) : route.fallback(),
    );
    await wizard.searchBox().fill('sunny');
    await expect(
      host.page.getByRole('alert').filter({ hasText: 'Our end hiccuped.' }),
    ).toBeVisible();

    down = false;
    await wizard.searchBox().fill('sunny side');
    await expect(
      host.page.getByRole('button', { name: new RegExp(fixturePlaces.sunnySide.name) }),
    ).toBeVisible();
    await expect(host.page.getByRole('alert').filter({ hasText: 'Our end hiccuped.' })).toHaveCount(
      0,
    );
  });
});

// Review follow-up: the session ending is answered the same way wherever a page sends a request,
// not only by the controls on the shared mutation hook.

async function endSession(actor: Actor): Promise<void> {
  // (Let the page's own background requests finish first: a late one could set the cookie again.)
  await actor.page.waitForLoadState('networkidle');
  await actor.context.clearCookies();
  await expect.poll(async () => (await actor.context.cookies()).length).toBe(0);
}

test.describe('T4b — a session that ends, wherever the page was about to send something', () => {
  test('a ballot tick sends the person to sign in, with a way back', async ({ makeActor }) => {
    const host = await makeActor('host');
    const voter = await makeActor('voter');
    const brunchId = await createBrunch({
      host: host.user,
      locations: [fixturePlaces.sunnySide, fixturePlaces.harborBistro],
      times: [daysFromNow(10), daysFromNow(11)],
    });
    await addAttendee({ brunchId, host: host.user, user: voter.user, response: 'yes' });
    await voter.page.goto(`/brunch/${brunchId}`);
    const box = ballot(voter.page).locations.getByRole('checkbox').first();
    await expect(box).toBeEnabled();

    await endSession(voter);
    await box.check();

    await expect(voter.page).toHaveURL(
      new RegExp(`/sign-in\\?callbackUrl=${encodeURIComponent(`/brunch/${brunchId}`)}$`),
    );
  });

  test("the wizard's create sends the person to sign in, with a way back", async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const wizard = new BrunchWizard(host.page);
    await wizard.open();
    await wizard.fillWhat({ title: `Signed Out ${uniqueSuffix()}` });
    await wizard.addPlace(fixturePlaces.sunnySide);
    await wizard.next();
    await wizard.addTime(10);
    await wizard.next();

    await endSession(host);
    await wizard.create();

    await expect(host.page).toHaveURL(
      new RegExp(`/sign-in\\?callbackUrl=${encodeURIComponent('/brunch/new')}$`),
    );
  });

  test('a place search sends the person to sign in, with a way back', async ({ makeActor }) => {
    const host = await makeActor('host');
    const wizard = new BrunchWizard(host.page);
    await wizard.open();
    await wizard.fillWhat({ title: `Signed Out Search ${uniqueSuffix()}` });
    // The real server answers this one (the context's fixtures are skipped), so it is the
    // middleware's 401 that comes back.
    await host.page.route('**/api/v1/places/search**', (route) => route.continue());

    await endSession(host);
    await wizard.searchBox().fill('sunny');

    await expect(host.page).toHaveURL(
      new RegExp(`/sign-in\\?callbackUrl=${encodeURIComponent('/brunch/new')}$`),
    );
  });
});
