import type { Email } from '@brunchsters/shared';
import { request as playwrightRequest } from '@playwright/test';
import { expectNoA11yViolations, useColorScheme } from '../support/a11y';
import { getDb } from '../support/db';
import { baseUrl } from '../support/env';
import {
  createBrunch,
  getInviteToken,
  inviteToBrunch,
  respondToInvite,
  uniqueSuffix,
} from '../support/factories';
import { expect, test } from '../support/fixtures';
import { inviteRow } from '../support/invites';
import { emailsTo, waitForEmails } from '../support/mailbox';
import { fixturePlaces } from '../support/places';
import { untilRefused } from '../support/rateLimits';
import { addAttendee } from '../support/voting';
import { BrunchWizard } from '../support/wizard';

// Journeys L1 to L4 and L6 — the limits of spec 0012 (L5 is in api-authorization.spec.ts) (ADR 0013), as a host meets them. The
// counters are real and per person, so each journey makes its own host and brunch and spends the
// real budget; nothing in the app is lowered or bypassed for a test. The server's windows cannot
// be moved from here, so the browser's clock is: it proves the control comes back, while the
// server's own reset is proved in the limiter's integration test.

const newEmail = (label: string): Email => `${label}-${uniqueSuffix()}@example.com` as Email;

const INVITES_LIMITED = /Easy there, that's a lot of invites for one day\. Try again in .+\./;
const RESEND_LIMITED = /That one just went out\. Give it (a minute|\d+ minutes)\./;

// A day is longer than any window.
const A_DAY_AND_A_BIT_MS = 25 * 60 * 60 * 1000;

test.describe('L1 — too many invites in a day', () => {
  test('the send button waits with a friendly line, keeps the wait over a reload, and comes back', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const { page } = host;
    const brunchId = await createBrunch({ host: host.user });
    const late = newEmail('too-late');

    // The whole per-brunch budget (50 addresses). Seeded through the factory: it spends the real
    // budget exactly as the route would, but queues no mail, so the shared email queue stays free
    // for the journeys that wait on it.
    const batch = Array.from({ length: 50 }, (_, index) => ({ email: newEmail(`l1-${index}`) }));
    await inviteToBrunch({ brunchId, host: host.user, invitees: batch });

    // A browser clock that runs on its own but can be jumped, for the wait at the end.
    await page.clock.install();
    let sendRequests = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith(`/brunches/${brunchId}/invites`)) {
        sendRequests += 1;
      }
    });
    await page.goto(`/brunch/${brunchId}`);

    await page.getByLabel('Invite more people').fill(late);
    const send = page.getByRole('button', { name: 'Round up the crew' });
    await send.click();

    // The refusal: the friendly line, a button that waits, the address still typed, nothing created.
    await expect(page.getByText(INVITES_LIMITED)).toBeVisible();
    await expect(send).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByLabel('Invite more people')).toHaveValue(late);
    expect(await getDb().brunchInvite.count({ where: { brunchId, invitedEmail: late } })).toBe(0);
    expect(sendRequests).toBe(1);

    // Clicking a waiting button asks the server nothing. (`force`: Playwright treats an
    // `aria-disabled` button as not clickable and would wait forever; a person can still press it.)
    await send.click({ force: true });
    await expect(send).toHaveAttribute('aria-disabled', 'true');
    expect(sendRequests).toBe(1);

    // Readable in the light palette while it shows (the dark one is checked after the reload below:
    // switching live would measure buttons halfway through their color transition).
    await expectNoA11yViolations(page, 'the invite panel while the send is limited (light)');

    // A refresh does not lose the wait.
    await page.reload();
    await expect(page.getByRole('button', { name: 'Round up the crew' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expect(page.getByText(INVITES_LIMITED)).toBeVisible();

    // The same in the dark palette: the wait is still there when the page loads that way.
    await useColorScheme(page, 'dark');
    await page.reload();
    await expect(page.getByText(INVITES_LIMITED)).toBeVisible();
    await expectNoA11yViolations(page, 'the invite panel while the send is limited (dark)');

    // When the wait is over the button is back and the line is gone.
    await page.clock.fastForward(A_DAY_AND_A_BIT_MS);
    await expect(page.getByRole('button', { name: 'Round up the crew' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expect(page.getByText(INVITES_LIMITED)).toHaveCount(0);
    expect(await emailsTo(late)).toHaveLength(0);
  });
});

test.describe('L2 — resending too soon', () => {
  test('only that invite waits; a refused resend leaves its link alone; the wait survives a reload', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const { page } = host;
    const first = newEmail('first');
    const second = newEmail('second');
    const brunchId = await createBrunch({ host: host.user });
    await inviteToBrunch({
      brunchId,
      host: host.user,
      invitees: [{ email: first }, { email: second }],
    });

    await page.clock.install();
    await page.goto(`/brunch/${brunchId}`);
    const resendFirst = inviteRow(page, first).getByRole('button', { name: 'Resend' });
    const resendSecond = inviteRow(page, second).getByRole('button', { name: 'Resend' });

    // The first resend goes out.
    await resendFirst.click();
    await waitForEmails({ to: first, count: 1 });
    const tokenAfterFirstResend = await getInviteToken({ brunchId, email: first });

    // The second, straight after, is refused: this invite waits, with the reason beside it.
    await resendFirst.click();
    await expect(inviteRow(page, first).getByText(RESEND_LIMITED)).toBeVisible();
    await expect(resendFirst).toHaveAttribute('aria-disabled', 'true');
    // Pressing it while it waits does nothing more (no second request, no change of link).
    await resendFirst.click({ force: true });
    // The refusal did not re-token the invite, so the link in the email that went out still works.
    expect(await getInviteToken({ brunchId, email: first })).toBe(tokenAfterFirstResend);

    // Another invite on the same brunch is unaffected.
    await expect(resendSecond).not.toHaveAttribute('aria-disabled', 'true');
    await expect(inviteRow(page, second).getByText(RESEND_LIMITED)).toHaveCount(0);
    await resendSecond.click();
    await waitForEmails({ to: second, count: 1 });

    // A refresh does not lose the wait, and only that invite still has it.
    await page.reload();
    await expect(inviteRow(page, first).getByText(RESEND_LIMITED)).toBeVisible();
    await expect(inviteRow(page, first).getByRole('button', { name: 'Resend' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expect(
      inviteRow(page, second).getByRole('button', { name: 'Resend' }),
    ).not.toHaveAttribute('aria-disabled', 'true');

    // Ten minutes later the button is back.
    await page.clock.fastForward(11 * 60 * 1000);
    await expect(
      inviteRow(page, first).getByRole('button', { name: 'Resend' }),
    ).not.toHaveAttribute('aria-disabled', 'true');
    await expect(inviteRow(page, first).getByText(RESEND_LIMITED)).toHaveCount(0);

    // One email each: nothing went out for the refused click.
    expect(await emailsTo(first)).toHaveLength(1);
    expect(await emailsTo(second)).toHaveLength(1);
  });
});

test.describe('L1b — approving a suggestion spends the same invite budget', () => {
  test('a host who has used the brunch’s invites for the day cannot approve one more address', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const attendee = await makeActor('attendee');
    const brunchId = await createBrunch({ host: host.user });
    await inviteToBrunch({ brunchId, host: host.user, invitees: [attendee.user] });
    await respondToInvite({ brunchId, user: attendee.user, response: 'yes' });
    const suggested = newEmail('suggested');

    await attendee.page.goto(`/brunch/${brunchId}`);
    await attendee.page.getByLabel('Suggest someone').fill(suggested);
    await attendee.page.getByRole('button', { name: 'Suggest this person' }).click();
    await expect(attendee.page.getByLabel('Suggest someone')).toHaveValue('');

    // The attendee's invite used one of the brunch's 50; the other 49 use up the rest (seeded
    // through the factory, which spends the real budget and queues no mail).
    const rest = Array.from({ length: 49 }, (_, index) => ({ email: newEmail(`l1b-${index}`) }));
    await inviteToBrunch({ brunchId, host: host.user, invitees: rest });

    await host.page.goto(`/brunch/${brunchId}`);
    const row = host.page
      .getByRole('listitem')
      .filter({ hasText: 'suggested by' })
      .filter({ hasText: suggested });
    await row.getByRole('button', { name: 'Approve' }).click();

    // The host is told, the suggestion is still waiting for them, and nothing was emailed or created.
    await expect(host.page.getByText(INVITES_LIMITED)).toBeVisible();
    await expect(row).toBeVisible();
    expect(await getDb().brunchInvite.count({ where: { brunchId, invitedEmail: suggested } })).toBe(
      0,
    );

    // Declining sends nothing, so it is still allowed.
    await row.getByRole('button', { name: 'Decline' }).click();
    await expect(row).toHaveCount(0);
  });
});

test.describe('L3 — place search', () => {
  test('too many searches in a minute are refused with Retry-After, and the input says so without losing its results', async ({
    makeActor,
  }) => {
    // Dozens of requests in a row, and each route is compiled on first use in dev mode.
    test.slow();
    const host = await makeActor('host');

    // Straight at the server. The e2e server has no Google key, so under budget a search is the
    // existing 502 "unavailable"; what matters is the refusal after the 30th, before Google.
    const { refused } = await untilRefused({
      limit: 30,
      attempt: () => host.context.request.get('/api/v1/places/search?q=cafe'),
      expectedUntilThen: (response) => expect(response.status()).toBe(502),
    });
    expect(Number(refused.headers()['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(await refused.json()).toMatchObject({
      error: 'Too many requests',
      policy: 'place-search',
    });

    // The real input, with the browser told to answer the next search as the server would.
    const wizard = new BrunchWizard(host.page);
    await wizard.open();
    await wizard.fillWhat({ title: `Place limit ${uniqueSuffix()}` });
    await wizard.searchBox().fill('sunny');
    const result = host.page.getByRole('button', {
      name: `${fixturePlaces.sunnySide.name} — ${fixturePlaces.sunnySide.address}`,
    });
    await expect(result).toBeVisible();

    await host.page.route(/\/api\/v1\/places\/search/, async (route) => {
      await route.fulfill({
        status: 429,
        headers: { 'Retry-After': '3' },
        json: { error: 'Too many requests', policy: 'place-search', retryAfterSeconds: 3 },
      });
    });
    await wizard.searchBox().fill('sunny s');

    await expect(host.page.getByText('Slow down a sec, then try again.')).toBeVisible();
    await expect(result).toBeVisible();
    await expect(wizard.searchBox()).toBeEnabled();
    // The line goes by itself once the wait is over.
    await expect(host.page.getByText('Slow down a sec, then try again.')).toHaveCount(0, {
      timeout: 10_000,
    });
  });
});

test.describe('L4 — writes', () => {
  test('a person who writes too fast is refused with Retry-After; someone else is not', async ({
    makeActor,
  }) => {
    // More than sixty requests in a row; each route is compiled on first use in dev mode.
    test.slow();
    const host = await makeActor('host');
    const fast = await makeActor('fast');
    const calm = await makeActor('calm');
    const brunchId = await createBrunch({ host: host.user });
    await addAttendee({ brunchId, host: host.user, user: fast.user, response: 'yes' });
    await addAttendee({ brunchId, host: host.user, user: calm.user, response: 'yes' });
    const rsvp = (who: typeof fast) =>
      who.context.request.post(`/api/v1/brunches/${brunchId}/rsvp`, { data: { response: 'yes' } });

    const { refused } = await untilRefused({
      limit: 60,
      attempt: () => rsvp(fast),
      expectedUntilThen: (response) => expect(response.status()).toBe(200),
    });
    expect(Number(refused.headers()['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(await refused.json()).toMatchObject({ error: 'Too many requests', policy: 'writes' });

    // The budget is the person's own: a second member is not slowed down.
    expect((await rsvp(calm)).status()).toBe(200);
    // And the refusal holds: the person is still told the same thing.
    expect((await rsvp(fast)).status()).toBe(429);
  });
});

test.describe('L6 — invite tokens', () => {
  test('an address that asks too often is refused, a real token included, and another address is not', async ({
    makeActor,
  }) => {
    // Dozens of requests in a row, and each route is compiled on first use in dev mode.
    test.slow();
    const host = await makeActor('host');
    const brunchId = await createBrunch({ host: host.user });
    const guest = `l6-${uniqueSuffix()}@example.com` as Email;
    await inviteToBrunch({ brunchId, host: host.user, invitees: [{ email: guest }] });
    const realToken = await getInviteToken({ brunchId, email: guest });

    // Each caller names its own address, as the host in front of the app would.
    const from = (address: string) =>
      playwrightRequest.newContext({
        baseURL: baseUrl,
        extraHTTPHeaders: { 'x-forwarded-for': address },
      });
    const busy = await from(`l6-busy-${uniqueSuffix()}`);
    const other = await from(`l6-other-${uniqueSuffix()}`);

    const { refused } = await untilRefused({
      limit: 30,
      attempt: (index) => busy.get(`/api/v1/invites/token/not-a-token-${index}`),
      expectedUntilThen: (response) => expect(response.status()).toBe(404),
    });
    expect(Number(refused.headers()['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(await refused.json()).toMatchObject({ policy: 'invite-token' });

    // While it is limited, even a real token gets nothing from that address, and it cannot answer
    // an invite either (the address is checked before the person is).
    expect((await busy.get(`/api/v1/invites/token/${realToken}`)).status()).toBe(429);
    expect(
      (
        await busy.post(`/api/v1/invites/token/${realToken}/respond`, {
          data: { response: 'yes' },
        })
      ).status(),
    ).toBe(429);

    // Another address is untouched: the real token still shows its preview.
    const preview = await other.get(`/api/v1/invites/token/${realToken}`);
    expect(preview.status()).toBe(200);
    expect(await preview.json()).toMatchObject({ hostName: host.user.name });

    await busy.dispose();
    await other.dispose();
  });
});
