import { expectDashboard } from '../support/dashboard';
import { getDb } from '../support/db';
import { createBrunch, uniqueSuffix } from '../support/factories';
import { expect, test } from '../support/fixtures';
import { afterTheHold, bringBackBrunch, callOffBrunch } from '../support/lifecycle';
import { GONE_COLD, NOT_FOUND } from '../support/pages';
import { linkIn, waitForEmails } from '../support/mailbox';
import { fixturePlaces } from '../support/places';
import { alignToWindow } from '../support/rateLimits';
import { createVotingBrunch, inviteNewcomer } from '../support/showcase';
import { daysFromNow } from '../support/time';
import { addAttendee, confirmBrunch, passConfirmedTime } from '../support/voting';
import type { BrunchId } from '@brunchsters/shared';

// Journeys E1, E2, E4 to E8 of spec 0013 as a person meets them: the manage page's "End of the
// road", the read-only brunch page, the link to a brunch that was called off, Delete, Hide and the
// dashboard that stops growing. (The emails, and journeys that need several people's mail, are in
// email-notifications.spec.ts and the api-authorization journeys.) Calling a brunch off *as of* a
// moment the hold has passed is how a journey gets a state the app reaches after five minutes
// (support/lifecycle.ts); nothing in the app was changed for it.

const CALL_IT_OFF = { name: 'Call it off', exact: true } as const;

async function statusOf(brunchId: BrunchId): Promise<string | undefined> {
  const brunch = await getDb().brunch.findFirst({
    where: { id: brunchId },
    include: { status: true },
  });
  return brunch?.status.code;
}

test.describe('E1 — the host calls it off, and the page becomes read-only for everyone', () => {
  test('through a dialog whose safe answer has the focus; Escape and "Nope, keep it" change nothing', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const guest = await makeActor('guest');
    const title = `Called Off ${uniqueSuffix()}`;
    const brunchId = await createBrunch({ host: host.user, title });
    await addAttendee({ brunchId, host: host.user, user: guest.user, response: 'yes' });

    await host.page.goto(`/brunch/${brunchId}/manage`);
    await expect(host.page.getByRole('heading', { name: 'End of the road' })).toBeVisible();
    await host.page.getByRole('button', CALL_IT_OFF).click();

    const dialog = host.page.getByRole('dialog', { name: `Calling off "${title}"?` });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(
      "We'll let the 1 person who said yes, maybe, or hadn't said yet know, in a few minutes.",
    );
    // It sits in the middle of the window, not pinned to the top: the brunch page's panel spacing
    // once gave it a top margin that beat the browser's centering.
    const box = await dialog.boundingBox();
    const viewport = host.page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(
      Math.abs((box?.y ?? 0) + (box?.height ?? 0) / 2 - (viewport?.height ?? 0) / 2),
    ).toBeLessThan(4);
    // A stray Enter keeps the brunch: the safe answer has the focus.
    await expect(dialog.getByRole('button', { name: 'Nope, keep it' })).toBeFocused();

    await host.page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(await statusOf(brunchId)).toBe('active');

    await host.page.getByRole('button', CALL_IT_OFF).click();
    await dialog.getByRole('button', { name: 'Nope, keep it' }).click();
    await expect(dialog).toHaveCount(0);
    expect(await statusOf(brunchId)).toBe('active');

    // Now for real.
    await host.page.getByRole('button', CALL_IT_OFF).click();
    await dialog.getByRole('button', CALL_IT_OFF).click();
    await expect(host.page.getByRole('heading', { name: 'Called off.' })).toBeVisible();
    await expect(host.page.getByText('You called this one off.')).toBeVisible();
    await expect(host.page.getByRole('button', { name: 'Bring it back' })).toBeVisible();
    await expect(host.page.getByRole('button', { name: 'Delete this brunch' })).toBeVisible();
    await expect(host.page.getByRole('button', CALL_IT_OFF)).toHaveCount(0);
    expect(await statusOf(brunchId)).toBe('cancelled');

    // The guest's page: the news instead of the RSVP, and nothing to act on.
    await guest.page.goto(`/brunch/${brunchId}`);
    await expect(guest.page.getByRole('heading', { name: 'Called off.' })).toBeVisible();
    await expect(guest.page.getByText(`${host.user.name} called this one off.`)).toBeVisible();
    await expect(guest.page.getByText('Called off', { exact: true })).toBeVisible();
    await expect(guest.page.getByRole('heading', { name: 'You in?' })).toHaveCount(0);
    await expect(guest.page.getByRole('button', { name: "I'm in" })).toHaveCount(0);
    await expect(guest.page.getByRole('button', { name: 'Hide from my dashboard' })).toBeVisible();

    // The host's own brunch page says it too, with no invite panel to send from.
    await host.page.goto(`/brunch/${brunchId}`);
    await expect(host.page.getByRole('heading', { name: 'Called off.' })).toBeVisible();
    await expect(host.page.getByRole('button', { name: 'Round up the crew' })).toHaveCount(0);
  });

  test('a draft cannot be called off, only deleted; a confirmed brunch that already happened offers neither', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const guest = await makeActor('guest');
    const draftId = await createBrunch({ host: host.user, title: `Draft ${uniqueSuffix()}` });
    const overId = await createBrunch({
      host: host.user,
      title: `Over ${uniqueSuffix()}`,
      locations: [fixturePlaces.sunnySide],
      times: [daysFromNow(3)],
    });
    await addAttendee({ brunchId: overId, host: host.user, user: guest.user, response: 'yes' });
    await confirmBrunch({
      brunchId: overId,
      host: host.user,
      place: fixturePlaces.sunnySide.name,
      timeIndex: 0,
    });
    await passConfirmedTime(overId);

    await host.page.goto(`/brunch/${draftId}/manage`);
    await expect(host.page.getByRole('button', { name: 'Delete this draft' })).toBeVisible();
    await expect(host.page.getByRole('button', CALL_IT_OFF)).toHaveCount(0);

    await host.page.goto(`/brunch/${overId}/manage`);
    await expect(host.page.getByRole('heading', { name: 'Confirmed', exact: true })).toBeVisible();
    await expect(host.page.getByRole('heading', { name: 'End of the road' })).toHaveCount(0);
    await expect(host.page.getByRole('button', CALL_IT_OFF)).toHaveCount(0);
  });
});

test.describe('E2 — bringing it back puts everything as it was', () => {
  test('the host brings it back, and the guest finds their answer where they left it', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const guest = await makeActor('guest');
    const brunchId = await createBrunch({ host: host.user, title: `Back ${uniqueSuffix()}` });
    await addAttendee({ brunchId, host: host.user, user: guest.user, response: 'yes' });
    await callOffBrunch({ brunchId, host: host.user, at: afterTheHold(), announce: false });

    await host.page.goto(`/brunch/${brunchId}/manage`);
    await host.page.getByRole('button', { name: 'Bring it back' }).click();
    await expect(host.page.getByRole('heading', { name: 'Called off.' })).toHaveCount(0);
    await expect(host.page.getByRole('button', CALL_IT_OFF)).toBeVisible();
    expect(await statusOf(brunchId)).toBe('active');

    await guest.page.goto(`/brunch/${brunchId}`);
    await expect(guest.page.getByRole('heading', { name: 'You in?' })).toBeVisible();
    await expect(guest.page.getByText('Current: yes')).toBeAttached();
    await expect(guest.page.getByRole('heading', { name: 'Called off.' })).toHaveCount(0);
  });
});

test.describe('E3 — bringing it back after the guests were told', () => {
  test('the guest hears it is back on, and the brunch takes their answer again', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const guest = await makeActor('guest');
    const title = `Back On ${uniqueSuffix()}`;
    const brunchId = await createBrunch({ host: host.user, title });
    await addAttendee({ brunchId, host: host.user, user: guest.user, response: 'yes' });

    // Called off as of long ago through the real queue, so the guest was told.
    await callOffBrunch({ brunchId, host: host.user, at: afterTheHold() });
    await waitForEmails({ to: guest.user.email, count: 1 });
    await expect
      .poll(
        async () =>
          (await getDb().brunch.findFirst({ where: { id: brunchId } }))?.cancelNoticeSentAt ?? null,
      )
      .not.toBeNull();
    await guest.page.goto(`/brunch/${brunchId}`);
    await expect(guest.page.getByRole('heading', { name: 'Called off.' })).toBeVisible();
    await expect(guest.page.getByRole('heading', { name: 'You in?' })).toHaveCount(0);

    // The host brings it back from the page, and the guest is told it is on again.
    await host.page.goto(`/brunch/${brunchId}/manage`);
    await host.page.getByRole('button', { name: 'Bring it back' }).click();
    await expect(host.page.getByRole('button', CALL_IT_OFF)).toBeVisible();
    const [, backOn] = await waitForEmails({ to: guest.user.email, count: 2 });
    expect(backOn?.subject).toBe(`${title} is back on 🥂`);
    expect(new URL(linkIn(backOn as Parameters<typeof linkIn>[0])).pathname).toBe(
      `/brunch/${brunchId}`,
    );

    // And the brunch takes an answer again.
    await guest.page.reload();
    await expect(guest.page.getByRole('heading', { name: 'Called off.' })).toHaveCount(0);
    await guest.page.getByRole('button', { name: 'Maybe' }).click();
    await expect(guest.page.getByText('Current: maybe')).toBeAttached();
  });
});

test.describe('E4 — a link to a brunch that was called off', () => {
  test('says so, joins nobody and changes nothing, signed out or signed in', async ({
    makeActor,
    page,
  }) => {
    const host = await makeActor('host');
    const stranger = await makeActor('stranger');
    const title = `Link ${uniqueSuffix()}`;
    const brunchId = await createBrunch({ host: host.user, title });
    const link = await inviteNewcomer({ host, brunchId });
    await callOffBrunch({ brunchId, host: host.user, at: afterTheHold(), announce: false });

    // Signed out: the news, and no way to sign in to a brunch that is off.
    await page.goto(link);
    await expect(
      page.getByRole('heading', { level: 1, name: `${host.user.name} called this one off.` }),
    ).toBeVisible();
    await expect(page.getByText(`${title} is off, so there's nothing to RSVP to.`)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in with Google' })).toHaveCount(0);

    // Signed in as someone who is not in the brunch: the same news, and no attendee row appears.
    await stranger.page.goto(link);
    await expect(
      stranger.page.getByRole('heading', {
        level: 1,
        name: `${host.user.name} called this one off.`,
      }),
    ).toBeVisible();
    await expect(stranger.page.getByRole('link', { name: 'Back to your dashboard' })).toBeVisible();
    expect(
      await getDb().brunchAttendee.count({ where: { brunchId, userId: stranger.user.id } }),
    ).toBe(0);
    await stranger.page.goto('/dashboard');
    await expect(stranger.page.getByRole('link', { name: title })).toHaveCount(0);
  });
});

test.describe('E5 — deleting', () => {
  test('a draft goes at once; afterwards it is a 404 and off the dashboard', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const title = `Delete Draft ${uniqueSuffix()}`;
    const brunchId = await createBrunch({ host: host.user, title });

    await host.page.goto(`/brunch/${brunchId}/manage`);
    await host.page.getByRole('button', { name: 'Delete this draft' }).click();
    const dialog = host.page.getByRole('dialog', { name: `Delete "${title}"?` });
    await expect(dialog).toContainText("can't be undone");
    await expect(dialog.getByRole('button', { name: 'Keep it' })).toBeFocused();
    await dialog.getByRole('button', { name: 'Delete it' }).click();

    await expectDashboard(host.page);
    await expect(host.page.getByRole('link', { name: title })).toHaveCount(0);
    await host.page.goto(`/brunch/${brunchId}`);
    await expect(host.page.getByText(NOT_FOUND)).toBeVisible();
  });

  test('a called-off brunch waits until its guests have been told, then goes for everyone', async ({
    makeActor,
    page,
  }) => {
    const host = await makeActor('host');
    const guest = await makeActor('guest');
    const title = `Delete Off ${uniqueSuffix()}`;
    const brunchId = await createBrunch({ host: host.user, title });
    await addAttendee({ brunchId, host: host.user, user: guest.user, response: 'yes' });
    const link = await inviteNewcomer({ host, brunchId });

    // Called off a moment ago and nobody has been told yet: Delete is there but waiting, with the
    // reason, and pressing it does nothing.
    await callOffBrunch({ brunchId, host: host.user, at: new Date(), announce: false });
    await host.page.goto(`/brunch/${brunchId}/manage`);
    const remove = host.page.getByRole('button', { name: 'Delete this brunch' });
    await expect(remove).toHaveAttribute('aria-disabled', 'true');
    await expect(
      host.page.getByText(
        'People are still being told it was called off. Delete comes back in a few minutes.',
      ),
    ).toBeVisible();
    await remove.click({ force: true });
    await expect(host.page.getByRole('dialog')).toHaveCount(0);

    // The page's countdown ending is not the server's say-so: the guests still have not been told
    // (nothing queued them), so after the countdown the button is still waiting, because the page
    // asked the server instead of letting go.
    await host.page.clock.install();
    await host.page.reload();
    await expect(remove).toHaveAttribute('aria-disabled', 'true');
    await host.page.clock.fastForward('10:00');
    await expect(
      host.page.getByText(
        'People are still being told it was called off. Delete comes back in a few minutes.',
      ),
    ).toBeVisible();
    await expect(remove).toHaveAttribute('aria-disabled', 'true');

    // Once the queue has told them (here: called off as of long ago, through the real queue),
    // Delete is available.
    await bringBackBrunch({ brunchId, host: host.user, announce: false });
    await callOffBrunch({ brunchId, host: host.user, at: afterTheHold(30) });
    await expect
      .poll(
        async () =>
          (await getDb().brunch.findFirst({ where: { id: brunchId } }))?.cancelNoticeSentAt ?? null,
      )
      .not.toBeNull();

    await host.page.reload();
    const ready = host.page.getByRole('button', { name: 'Delete this brunch' });
    await expect(ready).not.toHaveAttribute('aria-disabled', 'true');
    await ready.click();
    await host.page
      .getByRole('dialog', { name: `Delete "${title}"?` })
      .getByRole('button', { name: 'Delete it' })
      .click();
    await expectDashboard(host.page);

    for (const person of [host, guest]) {
      await person.page.goto(`/brunch/${brunchId}`);
      await expect(person.page.getByText(NOT_FOUND)).toBeVisible();
      await person.page.goto('/dashboard');
      await expectDashboard(person.page);
      await expect(person.page.getByRole('link', { name: title })).toHaveCount(0);
    }

    // The host's manage page and an old invite link say exactly what a made-up id says.
    await host.page.goto(`/brunch/${brunchId}/manage`);
    await expect(host.page.getByText(NOT_FOUND)).toBeVisible();
    await page.goto(link);
    await expect(page.getByText(GONE_COLD)).toBeVisible();
  });
});

test.describe('E6 — hiding a brunch from your own dashboard', () => {
  test('from the page, the card and the list; it is only yours, and a phone row has it too', async ({
    makeActor,
  }) => {
    // Page, card, list, Hidden list and a phone in one journey: about 30 seconds in dev mode.
    test.slow();
    const host = await makeActor('host');
    const guest = await makeActor('guest');
    const title = `Tidy ${uniqueSuffix()}`;
    const brunchId = await createBrunch({ host: host.user, title });
    await addAttendee({ brunchId, host: host.user, user: guest.user, response: 'yes' });

    // The next-up card carries a Hide button on a wide screen.
    await guest.page.goto('/dashboard');
    await expectDashboard(guest.page);
    await guest.page.getByRole('button', { name: `Hide ${title}` }).click();
    await expect(guest.page.getByRole('link', { name: `Open ${title}` })).toHaveCount(0);
    const hiddenLink = guest.page.getByRole('link', { name: 'Hidden (1)' });
    await expect(hiddenLink).toBeVisible();

    // Only the guest's dashboard changed.
    await host.page.goto('/dashboard');
    await expect(host.page.getByRole('link', { name: `Open ${title}` })).toBeVisible();

    // The Hidden list brings it back.
    await hiddenLink.click();
    await expect(guest.page.getByRole('heading', { name: 'Hidden', exact: true })).toBeVisible();
    await guest.page.getByRole('button', { name: `Unhide ${title}` }).click();
    await expect(guest.page.getByRole('link', { name: `Open ${title}` })).toBeVisible();
    await expect(guest.page.getByRole('link', { name: /^Hidden \(/ })).toHaveCount(0);

    // From the brunch page: the page stays, says so, and offers Unhide.
    await guest.page.goto(`/brunch/${brunchId}`);
    await guest.page.getByRole('button', { name: 'Hide from my dashboard' }).click();
    await expect(
      guest.page.getByText('Hidden from your dashboard. Nobody else sees a change.'),
    ).toBeVisible();
    await expect(guest.page.getByRole('button', { name: 'Unhide', exact: true })).toBeVisible();
    await guest.page.goto('/dashboard');
    await expect(guest.page.getByRole('link', { name: `Open ${title}` })).toHaveCount(0);
    await expect(guest.page.getByRole('link', { name: 'Hidden (1)' })).toBeVisible();

    // A phone's rows carry the eye too.
    await guest.page.goto(`/brunch/${brunchId}`);
    await guest.page.getByRole('button', { name: 'Unhide', exact: true }).click();
    // Wait for it to land (the control flips back) before leaving, or the request is cut off.
    await expect(guest.page.getByRole('button', { name: 'Hide from my dashboard' })).toBeVisible();
    await guest.page.setViewportSize({ width: 390, height: 844 });
    await guest.page.goto('/dashboard');
    await expectDashboard(guest.page);
    // The brunch is on the dashboard (so the missing button means something)...
    await expect(guest.page.getByRole('link', { name: `Open ${title}` })).toBeVisible();
    // ...and, on a phone, it has its own Hide button, which works.
    await guest.page.getByRole('button', { name: `Hide ${title}` }).click();
    await expect(guest.page.getByRole('link', { name: `Open ${title}` })).toHaveCount(0);
    await expect(guest.page.getByRole('link', { name: 'Hidden (1)' })).toBeVisible();
  });

  test('a hidden brunch leaves the "vote waiting" count, and comes back with it', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const yes = await makeActor('yes');
    const maybe = await makeActor('maybe');
    const pending = await makeActor('pending');
    const { title } = await createVotingBrunch({ host, guests: { yes, maybe, pending } });
    const waiting = maybe.page.getByText('1 vote waiting');

    await maybe.page.goto('/dashboard');
    await expectDashboard(maybe.page);
    await expect(waiting).toBeVisible();

    await maybe.page.getByRole('button', { name: `Hide ${title}` }).click();
    await expect(waiting).toHaveCount(0);
    await maybe.page.getByRole('link', { name: 'Hidden (1)' }).click();
    await maybe.page.getByRole('button', { name: `Unhide ${title}` }).click();
    // Wait for it to land (the row leaves the Hidden list) before leaving, or the request is cut off.
    await expect(maybe.page.getByRole('button', { name: `Unhide ${title}` })).toHaveCount(0);
    await maybe.page.goto('/dashboard');
    await expectDashboard(maybe.page);
    await expect(waiting).toBeVisible();
  });

  test("a row's eye sits above the row's own link, so pressing it hides instead of opening", async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const guest = await makeActor('guest');
    const kept = `Kept ${uniqueSuffix()}`;
    const tidied = `Tidied ${uniqueSuffix()}`;
    for (const title of [kept, tidied]) {
      const brunchId = await createBrunch({ host: host.user, title });
      await addAttendee({ brunchId, host: host.user, user: guest.user, response: 'yes' });
    }

    // One of the two is the next-up card; the other is a list row, whose title link stretches over
    // the whole row (the eye inside a list item is the row's).
    await guest.page.goto('/dashboard');
    await expectDashboard(guest.page);
    const rowEye = guest.page.getByRole('listitem').getByRole('button', { name: /^Hide / });
    await expect(rowEye).toHaveCount(1);
    await rowEye.click();

    // It hid that brunch; it did not follow the row's link into it.
    await expect(rowEye).toHaveCount(0);
    await expect(guest.page).toHaveURL(/\/dashboard$/);
    await expect(guest.page.getByRole('link', { name: 'Hidden (1)' })).toBeVisible();
    await expect(
      guest.page.getByRole('link', { name: new RegExp(`^Open (${kept}|${tidied})$`) }),
    ).toBeVisible();
  });

  test('a person who hid everything still finds the Hidden list', async ({ makeActor }) => {
    const host = await makeActor('host');
    const guest = await makeActor('guest');
    const title = `Only One ${uniqueSuffix()}`;
    const brunchId = await createBrunch({ host: host.user, title });
    await addAttendee({ brunchId, host: host.user, user: guest.user, response: 'yes' });

    await guest.page.goto(`/brunch/${brunchId}`);
    await guest.page.getByRole('button', { name: 'Hide from my dashboard' }).click();
    await expect(guest.page.getByRole('button', { name: 'Unhide', exact: true })).toBeVisible();

    await guest.page.goto('/dashboard');
    await expect(guest.page.getByText('No upcoming brunches.')).toBeVisible();
    await expect(guest.page.getByRole('link', { name: 'Hidden (1)' })).toBeVisible();
    // Not the first-visit welcome: they have a brunch, they just put it away.
    await expect(guest.page.getByText("The table's set. Now invite some people.")).toHaveCount(0);
  });
});

test.describe('E7 — the dashboard stops growing', () => {
  test('Past shows the five newest, then all of them on request', async ({ makeActor }) => {
    const host = await makeActor('host');
    const guest = await makeActor('guest');
    for (let index = 1; index <= 7; index += 1) {
      const brunchId = await createBrunch({
        host: host.user,
        title: `Long Ago ${index} ${uniqueSuffix()}`,
        locations: [fixturePlaces.sunnySide],
        times: [daysFromNow(3)],
      });
      await addAttendee({ brunchId, host: host.user, user: guest.user, response: 'yes' });
      await confirmBrunch({
        brunchId,
        host: host.user,
        place: fixturePlaces.sunnySide.name,
        timeIndex: 0,
      });
      await passConfirmedTime(brunchId);
    }

    await host.page.goto('/dashboard');
    await expect(host.page.getByRole('heading', { name: 'Past', exact: true })).toBeVisible();
    await expect(host.page.getByRole('listitem')).toHaveCount(5);
    await host.page.getByRole('link', { name: 'Show all (7)' }).click();
    await expect(host.page.getByRole('listitem')).toHaveCount(7);
    await host.page.getByRole('link', { name: 'Show fewer' }).click();
    await expect(host.page.getByRole('listitem')).toHaveCount(5);
  });

  test('a called-off brunch sits in Past, worded "Called off"', async ({ makeActor }) => {
    const host = await makeActor('host');
    const title = `Off And Past ${uniqueSuffix()}`;
    const brunchId = await createBrunch({ host: host.user, title });
    const guest = await makeActor('guest');
    await addAttendee({ brunchId, host: host.user, user: guest.user, response: 'yes' });
    await callOffBrunch({ brunchId, host: host.user, at: afterTheHold(), announce: false });

    await host.page.goto('/dashboard');
    const row = host.page.getByRole('listitem').filter({ hasText: title });
    await expect(row).toContainText('Called off');
    await expect(host.page.getByRole('heading', { name: 'Past', exact: true })).toBeVisible();
  });
});

test.describe('E8 — a host who has called off a lot of brunches today is asked to wait', () => {
  test('the button says so, whether the page knew or found out when it was pressed', async ({
    makeActor,
  }) => {
    // The day's budget is one server window (a UTC day): start away from midnight.
    test.setTimeout(120_000);
    await alignToWindow({ windowSeconds: 86_400, needSeconds: 120 });
    const host = await makeActor('host');
    const guest = await makeActor('guest');
    const active = async (label: string): Promise<BrunchId> => {
      const brunchId = await createBrunch({
        host: host.user,
        title: `${label} ${uniqueSuffix()}`,
      });
      await addAttendee({ brunchId, host: host.user, user: guest.user, response: 'yes' });
      return brunchId;
    };
    const target = await active('Target');
    // Five cancellations used (the daily limit is six), through the real counter.
    for (let index = 1; index <= 5; index += 1) {
      await callOffBrunch({
        brunchId: await active(`Spent ${index}`),
        host: host.user,
        at: afterTheHold(index),
        announce: false,
      });
    }

    // The page loads with one left; another tab uses it before this one is pressed.
    await host.page.goto(`/brunch/${target}/manage`);
    await expect(host.page.getByRole('button', CALL_IT_OFF)).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await callOffBrunch({
      brunchId: await active('Last one'),
      host: host.user,
      at: afterTheHold(9),
      announce: false,
    });

    await host.page.getByRole('button', CALL_IT_OFF).click();
    await host.page
      .getByRole('dialog', { name: /^Calling off / })
      .getByRole('button', CALL_IT_OFF)
      .click();
    const waiting = host.page.getByText(
      /That's a lot of called-off brunches for one day\. Try again in .+\./,
    );
    await expect(waiting).toBeVisible();
    await expect(host.page.getByRole('button', CALL_IT_OFF)).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(await statusOf(target)).toBe('active');

    // The wait is the server's: a fresh load shows it before anything is pressed, and pressing
    // the waiting button opens no dialog.
    await host.page.reload();
    await expect(waiting).toBeVisible();
    await host.page.getByRole('button', CALL_IT_OFF).click({ force: true });
    await expect(host.page.getByRole('dialog')).toHaveCount(0);
  });
});
