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
import { mintSessionCookie } from '../support/session';
import { alignToWindow, untilRefused } from '../support/rateLimits';
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

test.describe('L1 — a refusal the page did not expect', () => {
  test('makes the send button wait; the wait is the server own, so it survives a reload and ends on the clock', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const { page } = host;
    const brunchId = await createBrunch({ host: host.user });
    const late = newEmail('too-late');

    // A browser clock that runs on its own but can be jumped, for the wait at the end.
    await page.clock.install();
    let sendRequests = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith(`/brunches/${brunchId}/invites`)) {
        sendRequests += 1;
      }
    });

    // The page opens while the brunch still has room...
    await page.goto(`/brunch/${brunchId}`);
    const send = page.getByRole('button', { name: 'Round up the crew' });
    await expect(send).not.toHaveAttribute('aria-disabled', 'true');

    // ...and the brunch whole budget (50 addresses) is used up before the host presses it. Seeded
    // through the factory: it spends the real budget exactly as the route would, but queues no
    // mail, so the shared email queue stays free for the journeys that wait on it.
    const batch = Array.from({ length: 50 }, (_, index) => ({ email: newEmail(`l1-${index}`) }));
    await inviteToBrunch({ brunchId, host: host.user, invitees: batch });

    await page.getByLabel('Invite more people').fill(late);
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

    // A reload does not lose the wait: the page asks the server, which is still counting.
    await page.reload();
    await expect(page.getByRole('button', { name: 'Round up the crew' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expect(page.getByText(INVITES_LIMITED)).toBeVisible();

    // The same in the dark palette.
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

test.describe('L1d — the page opens already waiting', () => {
  test('a host whose brunch has used its invites for the day sees the send button waiting before pressing anything', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const { page } = host;
    const brunchId = await createBrunch({ host: host.user });
    const batch = Array.from({ length: 50 }, (_, index) => ({ email: newEmail(`l1d-${index}`) }));
    await inviteToBrunch({ brunchId, host: host.user, invitees: batch });
    let sendRequests = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith(`/brunches/${brunchId}/invites`)) {
        sendRequests += 1;
      }
    });

    await page.goto(`/brunch/${brunchId}`);

    // Nothing was clicked: the server said so as the page loaded.
    const send = page.getByRole('button', { name: 'Round up the crew' });
    await expect(send).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByText(INVITES_LIMITED)).toBeVisible();
    await send.click({ force: true });
    expect(sendRequests).toBe(0);
  });
});

test.describe('L1c — the wait is the server own, so another browser sees it', () => {
  test('a host who opens the brunch in a browser that never saw the refusal still finds the button waiting', async ({
    makeActor,
    browser,
  }) => {
    const host = await makeActor('host');
    const brunchId = await createBrunch({ host: host.user });
    const batch = Array.from({ length: 50 }, (_, index) => ({ email: newEmail(`l1c-${index}`) }));
    await inviteToBrunch({ brunchId, host: host.user, invitees: batch });

    // A second browser: its own context, so no cookies, no storage and no page in common with the
    // first except the person. (Before the wait moved to the server it lived in the first browser.)
    const elsewhere = await browser.newContext();
    try {
      await elsewhere.addCookies([await mintSessionCookie(host.user)]);
      const page = await elsewhere.newPage();
      await page.goto(`/brunch/${brunchId}`);

      await expect(page.getByRole('button', { name: 'Round up the crew' })).toHaveAttribute(
        'aria-disabled',
        'true',
      );
      await expect(page.getByText(INVITES_LIMITED)).toBeVisible();
    } finally {
      await elsewhere.close();
    }
  });
});

test.describe('L2 — resending too soon', () => {
  test('a resend that just went out waits, and only that invite; the wait survives a reload and ends on the clock', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const { page } = host;
    const first = newEmail('first');
    const second = newEmail('second');
    const untouched = newEmail('untouched');
    const brunchId = await createBrunch({ host: host.user });
    await inviteToBrunch({
      brunchId,
      host: host.user,
      invitees: [{ email: first }, { email: second }, { email: untouched }],
    });
    let resendRequests = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/resend')) resendRequests += 1;
    });

    await page.clock.install();
    await page.goto(`/brunch/${brunchId}`);
    const resend = (email: string) =>
      inviteRow(page, email).getByRole('button', { name: 'Resend' });
    await expect(resend(first)).not.toHaveAttribute('aria-disabled', 'true');

    // The first resend goes out, and the invite says so at once: the server knows its cooldown has
    // started, and the page asks as it refreshes.
    await resend(first).click();
    await waitForEmails({ to: first, count: 1 });
    await expect(inviteRow(page, first).getByText(RESEND_LIMITED)).toBeVisible();
    await expect(resend(first)).toHaveAttribute('aria-disabled', 'true');
    const tokenAfterFirstResend = await getInviteToken({ brunchId, email: first });
    expect(resendRequests).toBe(1);

    // Pressing it while it waits asks the server nothing and leaves the link alone.
    await resend(first).click({ force: true });
    await expect(resend(first)).toHaveAttribute('aria-disabled', 'true');
    expect(resendRequests).toBe(1);
    expect(await getInviteToken({ brunchId, email: first })).toBe(tokenAfterFirstResend);

    // Other invites are unaffected: one that was never resent is still enabled, and a second
    // resend works and starts its own cooldown.
    await expect(resend(untouched)).not.toHaveAttribute('aria-disabled', 'true');
    await expect(inviteRow(page, untouched).getByText(RESEND_LIMITED)).toHaveCount(0);
    await resend(second).click();
    await waitForEmails({ to: second, count: 1 });
    await expect(inviteRow(page, second).getByText(RESEND_LIMITED)).toBeVisible();

    // A reload does not lose the waits, and the untouched invite is still free.
    await page.reload();
    await expect(inviteRow(page, first).getByText(RESEND_LIMITED)).toBeVisible();
    await expect(resend(first)).toHaveAttribute('aria-disabled', 'true');
    await expect(resend(second)).toHaveAttribute('aria-disabled', 'true');
    await expect(resend(untouched)).not.toHaveAttribute('aria-disabled', 'true');

    // Ten minutes later the buttons are back.
    await page.clock.fastForward(11 * 60 * 1000);
    await expect(resend(first)).not.toHaveAttribute('aria-disabled', 'true');
    await expect(resend(second)).not.toHaveAttribute('aria-disabled', 'true');
    await expect(inviteRow(page, first).getByText(RESEND_LIMITED)).toHaveCount(0);

    // One email each: nothing went out for the click on a waiting button.
    expect(await emailsTo(first)).toHaveLength(1);
    expect(await emailsTo(second)).toHaveLength(1);
  });
});

test.describe('L2b — a host who used the whole day of invites', () => {
  test('finds Resend and the send button waiting together as the page opens', async ({
    makeActor,
  }) => {
    test.slow();
    const host = await makeActor('host');
    const { page } = host;
    const guest = newEmail('resend-budget');
    const brunchId = await createBrunch({ host: host.user });
    await inviteToBrunch({ brunchId, host: host.user, invitees: [{ email: guest }] });
    // The rest of the host's 100 for the day (one is spent above), on two other brunches.
    for (const [label, count] of [
      ['one', 50],
      ['two', 49],
    ] as const) {
      const other = await createBrunch({ host: host.user, title: `Earlier ${label}` });
      const batch = Array.from({ length: count }, (_, index) => ({
        email: newEmail(`l2b-${label}-${index}`),
      }));
      await inviteToBrunch({ brunchId: other, host: host.user, invitees: batch });
    }
    let resendRequests = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/resend')) resendRequests += 1;
    });

    await page.goto(`/brunch/${brunchId}`);

    // The day's budget holds every control that emails, with the day's reason, before any click.
    await expect(inviteRow(page, guest).getByText(INVITES_LIMITED)).toBeVisible();
    await expect(inviteRow(page, guest).getByRole('button', { name: 'Resend' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expect(page.getByRole('button', { name: 'Round up the crew' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await inviteRow(page, guest).getByRole('button', { name: 'Resend' }).click({ force: true });
    expect(resendRequests).toBe(0);
  });
});

test.describe('L1b — approving a suggestion spends the same invite budget', () => {
  test('a refused approval makes Approve and the send button wait together, and declining is never held', async ({
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

    // The host opens the page while the brunch still has room...
    await host.page.goto(`/brunch/${brunchId}`);
    let reviewRequests = 0;
    host.page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        /\/api\/v1\/suggestions\/[^/]+\/review$/.test(request.url())
      ) {
        reviewRequests += 1;
      }
    });
    const row = host.page
      .getByRole('listitem')
      .filter({ hasText: 'suggested by' })
      .filter({ hasText: suggested });
    const approve = row.getByRole('button', { name: 'Approve' });
    const send = host.page.getByRole('button', { name: 'Round up the crew' });
    await expect(approve).not.toHaveAttribute('aria-disabled', 'true');

    // ...and the attendee's invite used one of the brunch's 50; the other 49 use up the rest
    // (seeded through the factory, which spends the real budget and queues no mail).
    const rest = Array.from({ length: 49 }, (_, index) => ({ email: newEmail(`l1b-${index}`) }));
    await inviteToBrunch({ brunchId, host: host.user, invitees: rest });
    await approve.click();

    // The host is told, in the suggestions panel and in the invite panel (one line each, because
    // each has a button that is now waiting), the suggestion is still waiting for them, and nothing
    // was emailed or created.
    await expect(host.page.getByText(INVITES_LIMITED)).toHaveCount(2);
    await expect(row).toBeVisible();
    expect(await getDb().brunchInvite.count({ where: { brunchId, invitedEmail: suggested } })).toBe(
      0,
    );

    // One budget, so both buttons wait together: the server told the page, and the page told both.
    await expect(approve).toHaveAttribute('aria-disabled', 'true');
    await expect(send).toHaveAttribute('aria-disabled', 'true');
    // Pressing a waiting Approve asks the server nothing.
    expect(reviewRequests).toBe(1);
    await approve.click({ force: true });
    await expect(approve).toHaveAttribute('aria-disabled', 'true');
    expect(reviewRequests).toBe(1);

    // The wait survives a reload, for both.
    await host.page.reload();
    await expect(row.getByRole('button', { name: 'Approve' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expect(host.page.getByRole('button', { name: 'Round up the crew' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    // Declining sends no email, so it is never held.
    await expect(row.getByRole('button', { name: 'Decline' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await row.getByRole('button', { name: 'Decline' }).click();
    await expect(row).toHaveCount(0);
  });
});

test.describe('L7 — the creation wizard and a refused invite batch', () => {
  test("a host who used the day's invites creates a brunch, and its page opens with the send button waiting", async ({
    makeActor,
  }) => {
    test.slow();
    const host = await makeActor('host');
    // The host's whole daily budget (100) on two other brunches, seeded through the factory.
    for (const label of ['one', 'two']) {
      const other = await createBrunch({ host: host.user, title: `Earlier ${label}` });
      const batch = Array.from({ length: 50 }, (_, index) => ({
        email: newEmail(`l7-${label}-${index}`),
      }));
      await inviteToBrunch({ brunchId: other, host: host.user, invitees: batch });
    }

    // Now a new brunch through the wizard, with one person to invite.
    const wizard = new BrunchWizard(host.page);
    await wizard.open();
    await wizard.fillWhat({ title: `Wizard refused ${uniqueSuffix()}` });
    await wizard.addPlace(fixturePlaces.sunnySide);
    await wizard.next();
    await wizard.addTime(10);
    await wizard.next();
    const invitee = newEmail('wizard-invitee');
    await wizard.addEmail(invitee);
    await wizard.create();

    // The brunch exists and its page says why nobody was invited, with the send button waiting.
    await expect(host.page).toHaveURL(/\/brunch\/[0-9a-f-]{36}$/);
    await expect(host.page.getByText(INVITES_LIMITED)).toBeVisible();
    await expect(host.page.getByRole('button', { name: 'Round up the crew' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    const brunchId = host.page.url().split('/').pop() ?? '';
    expect(await getDb().brunchInvite.count({ where: { brunchId, invitedEmail: invitee } })).toBe(
      0,
    );

    // The handoff was taken over, not left behind.
    const leftover = await host.page.evaluate((id) => {
      return window.localStorage.getItem(`brunchsters:limit-handoff:invites-send:${id}`);
    }, brunchId);
    expect(leftover).toBeNull();
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

    // The whole segment (the loop and the checks after it) inside one server window.
    await alignToWindow({ windowSeconds: 60, needSeconds: 25 });
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

    // The whole segment (the loop and the checks after it) inside one server window.
    await alignToWindow({ windowSeconds: 60, needSeconds: 25 });
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
