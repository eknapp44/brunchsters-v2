import { GONE_COLD } from '../support/pages';
import { normalizeEmail, type Email } from '@brunchsters/shared';
import { createBrunch, inviteToBrunch, uniqueSuffix } from '../support/factories';
import { expect, test, type Actor } from '../support/fixtures';
import { inviteRow } from '../support/invites';
import {
  emailsTo,
  expectNoEmails,
  linkIn,
  waitForEmails,
  type SentEmail,
} from '../support/mailbox';
import { fixturePlaces } from '../support/places';
import { daysFromNow } from '../support/time';
import { getDb } from '../support/db';
import {
  afterTheHold,
  announceCancellation,
  bringBackBrunch,
  callOffBrunch,
} from '../support/lifecycle';
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

// Journeys N5 to N7 (spec 0013): the called-off and back-on emails through the real queue and the
// real functions. The real hold is five minutes, which a journey cannot wait out and the app must
// not let it skip, so each journey calls the brunch off *as of* a moment the hold has already
// passed (support/lifecycle.ts): the function measures the hold from that moment and finds nothing
// left to wait for. The "nobody is told" journeys end with a second brunch that does produce an
// email, so the quiet is observed after the queue has demonstrably got to it, never by sleeping.

async function noticeFixture(makeActor: (name: string) => Promise<Actor>) {
  const host = await makeActor('host');
  const ann = await makeActor('ann');
  const maybe = await makeActor('maybe');
  const decliner = await makeActor('decliner');
  const silent = newEmail('silent');
  return { host, ann, maybe, decliner, silent };
}

test.describe('N5 — calling a brunch off tells the right people', () => {
  test('the yes, the maybe and someone with no account hear it; the host and the person who declined do not', async ({
    makeActor,
  }) => {
    const { host, ann, maybe, decliner, silent } = await noticeFixture(makeActor);
    const title = `Called Off Brunch ${uniqueSuffix()}`;
    const brunchId = await createBrunch({ host: host.user, title });
    // The decliner is invited first, so an email wrongly sent to them would be written before the
    // last legitimate one and be visible by the time that one arrives.
    await addAttendee({ brunchId, host: host.user, user: decliner.user, response: 'no' });
    await addAttendee({ brunchId, host: host.user, user: ann.user, response: 'yes' });
    await addAttendee({ brunchId, host: host.user, user: maybe.user, response: 'maybe' });
    await inviteToBrunch({ brunchId, host: host.user, invitees: [{ email: silent }] });

    await callOffBrunch({ brunchId, host: host.user, at: afterTheHold() });

    const annEmail = only(await waitForEmails({ to: ann.user.email, count: 1 }));
    const maybeEmail = only(await waitForEmails({ to: maybe.user.email, count: 1 }));
    const silentEmail = only(await waitForEmails({ to: silent, count: 1 }));
    expect(await emailsTo(decliner.user.email)).toHaveLength(0);
    expect(await emailsTo(host.user.email)).toHaveLength(0);

    for (const email of [annEmail, maybeEmail, silentEmail]) {
      expect(email.subject).toBe(`${host.user.name} called off ${title}`);
      expect(email.html).toContain('Called off.');
    }
    // Members are sent to the brunch; the person with no account to their invite page.
    expect(new URL(linkIn(annEmail)).pathname).toBe(`/brunch/${brunchId}`);
    expect(new URL(linkIn(silentEmail)).pathname).toMatch(/^\/invite\//);

    // The notice is recorded as sent, which is what lets a bring-back know people were told.
    await expect
      .poll(
        async () =>
          (await getDb().brunch.findFirst({ where: { id: brunchId } }))?.cancelNoticeSentAt ?? null,
      )
      .not.toBeNull();
  });
});

test.describe('N6 — a brunch brought back inside the hold tells nobody anything', () => {
  test('no called-off email, and no "back on" email either', async ({ makeActor }) => {
    const { host, ann } = await noticeFixture(makeActor);
    const quietTitle = `Changed My Mind ${uniqueSuffix()}`;
    const quiet = await createBrunch({ host: host.user, title: quietTitle });
    await addAttendee({ brunchId: quiet, host: host.user, user: ann.user, response: 'yes' });

    // Called off, and brought back before the hold was over. The called-off event still arrives
    // later (it is what the queue delivers when the run wakes), and finds the brunch open again.
    const cancelledAt = await callOffBrunch({
      brunchId: quiet,
      host: host.user,
      at: afterTheHold(),
      announce: false,
    });
    await bringBackBrunch({ brunchId: quiet, host: host.user });
    await announceCancellation({ brunchId: quiet, cancelledAt });

    // A second brunch of the same people that really is called off: when its email has arrived the
    // queue has got past the first brunch's events, and the first one produced nothing.
    const realTitle = `Really Off ${uniqueSuffix()}`;
    const real = await createBrunch({ host: host.user, title: realTitle });
    await addAttendee({ brunchId: real, host: host.user, user: ann.user, response: 'yes' });
    await callOffBrunch({ brunchId: real, host: host.user, at: afterTheHold() });

    const emails = await waitForEmails({ to: ann.user.email, count: 1 });
    expect(emails.map((email) => email.subject)).toEqual([
      `${host.user.name} called off ${realTitle}`,
    ]);
    expect(emails.some((email) => email.html.includes(quietTitle))).toBe(false);
    expect(await emailsTo(host.user.email)).toHaveLength(0);
  });
});

test.describe('N7 — bringing a called-off brunch back corrects what people were told', () => {
  test('the people who were told it was off hear it is back on, and a second cancellation tells them again', async ({
    makeActor,
  }) => {
    const { host, ann, decliner } = await noticeFixture(makeActor);
    const title = `Back On ${uniqueSuffix()}`;
    const brunchId = await createBrunch({ host: host.user, title });
    await addAttendee({ brunchId, host: host.user, user: decliner.user, response: 'no' });
    await addAttendee({ brunchId, host: host.user, user: ann.user, response: 'yes' });

    // Called off, and the notice goes out.
    await callOffBrunch({ brunchId, host: host.user, at: afterTheHold() });
    await waitForEmails({ to: ann.user.email, count: 1 });
    await expect
      .poll(
        async () =>
          (await getDb().brunch.findFirst({ where: { id: brunchId } }))?.cancelNoticeSentAt ?? null,
      )
      .not.toBeNull();

    // Brought back: the same person is told, and the link is the brunch.
    await bringBackBrunch({ brunchId, host: host.user });
    const [calledOff, backOn] = await waitForEmails({ to: ann.user.email, count: 2 });
    if (calledOff === undefined || backOn === undefined) throw new Error('Expected two emails');
    expect(calledOff.subject).toBe(`${host.user.name} called off ${title}`);
    expect(backOn.subject).toBe(`${title} is back on 🥂`);
    expect(new URL(linkIn(backOn)).pathname).toBe(`/brunch/${brunchId}`);
    expect(backOn.idempotencyKey).not.toBe(calledOff.idempotencyKey);

    // Called off a second time: a different cancellation, so a different email, not a replay.
    await callOffBrunch({ brunchId, host: host.user, at: afterTheHold(30) });
    const third = (await waitForEmails({ to: ann.user.email, count: 3 }))[2];
    expect(third?.subject).toBe(`${host.user.name} called off ${title}`);
    expect(third?.idempotencyKey).not.toBe(calledOff.idempotencyKey);

    // The host did it and the decliner opted out: neither heard anything, at any point.
    expect(await emailsTo(host.user.email)).toHaveLength(0);
    expect(await emailsTo(decliner.user.email)).toHaveLength(0);
  });
});

test.describe('N8 — the hold on a called-off notice is real', () => {
  test('called off just now, nothing is sent while the host can still change their mind', async ({
    makeActor,
  }) => {
    const { host, ann } = await noticeFixture(makeActor);
    const brunchId = await createBrunch({ host: host.user, title: `Hold ${uniqueSuffix()}` });
    await addAttendee({ brunchId, host: host.user, user: ann.user, response: 'yes' });

    // The same call as N5 but as of now: the five-minute hold has barely begun. N5's email arrives
    // within a couple of seconds, so a function that did not wait would have sent by now.
    await callOffBrunch({ brunchId, host: host.user });

    await expectNoEmails({ to: ann.user.email, forMs: 6_000 });
    expect(
      (await getDb().brunch.findFirst({ where: { id: brunchId } }))?.cancelNoticeSentAt,
    ).toBeNull();

    // Changing their mind now costs nobody anything: the run is left sleeping and will find the
    // brunch open again.
    await bringBackBrunch({ brunchId, host: host.user });
    expect(await emailsTo(ann.user.email)).toHaveLength(0);
  });
});

test.describe('N4 — the queue endpoint', () => {
  test('is reachable without a session and has its five functions registered', async ({
    request,
  }) => {
    const response = await request.get('/api/inngest');

    // Not the app's own 401 ({ error }) from the session gate: the request got through
    // middleware to the Inngest SDK, which answers its introspection call.
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { function_count?: number; mode?: string };
    // The invite, confirmed, called-off and back-on email functions and the daily rate-limit
    // prune (specs 0012 and 0013).
    expect(body.function_count).toBe(5);
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
