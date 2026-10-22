import { GONE_COLD } from '../support/pages';
import { normalizeEmail, type Email } from '@brunchsters/shared';
import { createBrunch, inviteToBrunch, uniqueSuffix } from '../support/factories';
import { expect, test } from '../support/fixtures';
import { inviteRow } from '../support/invites';
import { emailsTo, linkIn, waitForEmails, type SentEmail } from '../support/mailbox';
import { fixturePlaces } from '../support/places';
import { daysFromNow } from '../support/time';
import { addAttendee } from '../support/voting';

// Journeys N1-N4 (spec 0008): the invite and brunch-confirmed emails, through the real Inngest
// dev server and the real handlers. Emails land in a folder instead of being sent (ADR 0009);
// every wait is for something to arrive, never a sleep.

const newEmail = (label: string): Email => normalizeEmail(`${label}-${uniqueSuffix()}@example.com`);

// The wall-clock time in a zone, written independently of the app's own formatter.
function wallClock(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone,
  }).format(date);
}

test.describe('N1 — an invite email brings the invitee in', () => {
  test('the host invites an address; one email arrives and its link lands the invitee on the brunch', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const guest = await makeActor('guest');
    const title = `Emailed Brunch ${uniqueSuffix()}`;
    const brunchId = await createBrunch({ host: host.user, title });

    await host.page.goto(`/brunch/${brunchId}`);
    await host.page.getByLabel('Invite more people').fill(guest.user.email);
    await host.page.getByRole('button', { name: 'Round up the crew' }).click();
    await expect(inviteRow(host.page, guest.user.email)).toContainText('pending');

    const email = only(await waitForEmails({ to: guest.user.email, count: 1 }));
    expect(email.subject).toBe(`${host.user.name} wants you at brunch 🥂`);
    expect(email.html).toContain(title);

    // Following the emailed link is the same as following a copied one: the invitee is in.
    await guest.page.goto(linkIn(email));
    await expect(guest.page).toHaveURL(`/brunch/${brunchId}`);
    await expect(guest.page.getByRole('heading', { name: title })).toBeVisible();
    await expect(guest.page.getByText('Current: yes')).toBeVisible();

    await host.page.reload();
    await expect(inviteRow(host.page, guest.user.email)).toContainText('yes');
    expect(await emailsTo(guest.user.email)).toHaveLength(1);
  });

  test('someone with no account gets the email too, and its link is their preview page', async ({
    makeActor,
    page,
  }) => {
    const host = await makeActor('host');
    const newcomer = newEmail('newcomer');
    const title = `Newcomer Brunch ${uniqueSuffix()}`;
    const brunchId = await createBrunch({ host: host.user, title });

    await host.page.goto(`/brunch/${brunchId}`);
    await host.page.getByLabel('Invite more people').fill(newcomer);
    await host.page.getByRole('button', { name: 'Round up the crew' }).click();
    await expect(inviteRow(host.page, newcomer)).toContainText('pending');

    const email = only(await waitForEmails({ to: newcomer, count: 1 }));

    await page.goto(linkIn(email));
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.getByText(`${host.user.name} wants you at brunch`)).toBeVisible();
  });
});

test.describe('N2 — a resend retires the old email’s link', () => {
  test('the second email works, the first no longer does', async ({ makeActor, page }) => {
    const host = await makeActor('host');
    const invitee = newEmail('resent');
    const title = `Resent Brunch ${uniqueSuffix()}`;
    const brunchId = await createBrunch({ host: host.user, title });

    await host.page.goto(`/brunch/${brunchId}`);
    await host.page.getByLabel('Invite more people').fill(invitee);
    await host.page.getByRole('button', { name: 'Round up the crew' }).click();
    await expect(inviteRow(host.page, invitee)).toContainText('pending');
    await waitForEmails({ to: invitee, count: 1 });

    await inviteRow(host.page, invitee).getByRole('button', { name: 'Resend' }).click();
    const [first, second] = await waitForEmails({ to: invitee, count: 2 });
    if (first === undefined || second === undefined) throw new Error('Expected two emails');

    // A new token means a new link, and a new idempotency key so the second send is not
    // swallowed as a duplicate of the first.
    expect(linkIn(second)).not.toBe(linkIn(first));
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);

    await page.goto(linkIn(first));
    await expect(page.getByRole('heading', { name: GONE_COLD })).toBeVisible();
    await expect(page.getByText(title)).toHaveCount(0);

    await page.goto(linkIn(second));
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  });
});

test.describe('N3 — confirming the brunch tells the right people', () => {
  test('the host, a yes and someone with no account hear it; the person who declined does not', async ({
    makeActor,
    page,
  }) => {
    const host = await makeActor('host');
    const ann = await makeActor('ann');
    const decliner = await makeActor('decliner');
    const silent = newEmail('silent');
    const title = `Confirmed Brunch ${uniqueSuffix()}`;
    const when = daysFromNow(10);
    const place = fixturePlaces.pacificBrunchHouse;
    const brunchId = await createBrunch({
      host: host.user,
      title,
      locations: [place],
      times: [when],
    });
    // The decliner is invited first, so an email wrongly sent to them would be written before
    // the last legitimate one and be visible by the time that one arrives.
    await addAttendee({ brunchId, host: host.user, user: decliner.user, response: 'no' });
    await addAttendee({ brunchId, host: host.user, user: ann.user, response: 'yes' });
    await inviteToBrunch({ brunchId, host: host.user, invitees: [{ email: silent }] });

    await host.page.goto(`/brunch/${brunchId}/manage`);
    await host.page.getByRole('button', { name: 'Lock it in' }).click();
    await expect(host.page.getByRole('heading', { name: 'Confirmed', exact: true })).toBeVisible();

    // The silent invitee is emailed last, so once theirs is here the others have been sent.
    const silentEmail = only(await waitForEmails({ to: silent, count: 1 }));
    const hostEmail = only(await waitForEmails({ to: host.user.email, count: 1 }));
    const annEmail = only(await waitForEmails({ to: ann.user.email, count: 1 }));
    expect(await emailsTo(decliner.user.email)).toHaveLength(0);

    // The place, its address and the time in the *place's* zone, whatever zone anyone is in.
    for (const email of [silentEmail, hostEmail, annEmail]) {
      expect(email.subject).toBe(`Brunch on. 💕 ${title}`);
      expect(email.html).toContain(place.name);
      expect(email.html).toContain(place.address);
      expect(email.html).toContain(wallClock(when, place.timezone));
    }

    // Members are sent to the brunch; the person with no account to their invite page.
    expect(new URL(linkIn(hostEmail)).pathname).toBe(`/brunch/${brunchId}`);
    expect(new URL(linkIn(silentEmail)).pathname).toMatch(/^\/invite\//);
    await ann.page.goto(linkIn(annEmail));
    await expect(ann.page).toHaveURL(`/brunch/${brunchId}`);
    await expect(ann.page.getByText('Confirmed', { exact: true })).toBeVisible();

    // That invite page still works after confirming.
    await page.goto(linkIn(silentEmail));
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  });
});

test.describe('N4 — the queue endpoint', () => {
  test('is reachable without a session and has its three functions registered', async ({
    request,
  }) => {
    const response = await request.get('/api/inngest');

    // Not the app's own 401 ({ error }) from the session gate: the request got through
    // middleware to the Inngest SDK, which answers its introspection call.
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { function_count?: number; mode?: string };
    // The two email functions and the daily rate-limit prune (spec 0012).
    expect(body.function_count).toBe(3);
    expect(body.mode).toBe('dev');
  });
});

// Exactly one email: more than one means a duplicate was sent.
function only(emails: readonly SentEmail[]): SentEmail {
  const [email, ...rest] = emails;
  if (email === undefined || rest.length > 0) {
    throw new Error(`Expected exactly one email, found ${emails.length}`);
  }
  return email;
}
