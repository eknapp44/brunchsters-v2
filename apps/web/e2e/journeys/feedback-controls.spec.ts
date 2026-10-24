import { RATE_LIMIT_POLICIES } from '@brunchsters/shared';
import { createBrunch, inviteToBrunch, uniqueSuffix } from '../support/factories';
import { expect, test } from '../support/fixtures';
import { inviteRow } from '../support/invites';
import { fixturePlaces } from '../support/places';
import { createVotingBrunch } from '../support/showcase';
import { daysFromNow, datetimeLocalIn } from '../support/time';
import { TOAST_WORDS, toast, toastRegion } from '../support/toasts';
import { addAttendee, ballot, removeLocationByName } from '../support/voting';
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
