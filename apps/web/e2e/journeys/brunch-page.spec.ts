import type { Locator, Page } from '@playwright/test';
import { createBrunch, uniqueSuffix } from '../support/factories';
import { expect, test } from '../support/fixtures';
import { NOT_FOUND } from '../support/pages';
import { fixturePlaces } from '../support/places';
import { createConfirmedBrunch, createVotingBrunch, inviteNewcomer } from '../support/showcase';
import { TOAST_WORDS, toast } from '../support/toasts';
import { addAttendee, ballot, castVotes } from '../support/voting';

// Spec 0011 (design fidelity), the brunch page (M3): who sees whom in "Who's coming" (P5), the
// "You in?" card, the quiet vote bars and the "leading" tag (P6), the confirmed state (P7), and
// the page at phone and desktop width (P11).

const MISSING_BRUNCH = '00000000-0000-4000-8000-000000000000';

function roster(page: Page): Locator {
  return page.getByRole('group', { name: "Who's coming" });
}

test.describe('P5 — who sees whom on the brunch page', () => {
  test('the host sees everyone; a member sees First L. for yes and maybe and numbers for the rest; an outsider gets the same 404 as a made-up id', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const yes = await makeActor('yes');
    const maybe = await makeActor('maybe');
    const no = await makeActor('no');
    const silent = await makeActor('silent');
    const outsider = await makeActor('outsider');
    const brunchId = await createBrunch({ host: host.user, title: `Roster ${uniqueSuffix()}` });
    await addAttendee({ brunchId, host: host.user, user: yes.user, response: 'yes' });
    await addAttendee({ brunchId, host: host.user, user: maybe.user, response: 'maybe' });
    await addAttendee({ brunchId, host: host.user, user: no.user, response: 'no' });
    await addAttendee({ brunchId, host: host.user, user: silent.user, response: 'pending' });
    // someone with no account yet: only an address
    const newcomerLink = await inviteNewcomer({ host, brunchId });
    expect(newcomerLink).toContain('/invite/');

    // The host: every person by full name, and the person with no account by address.
    await host.page.goto(`/brunch/${brunchId}`);
    const hostRoster = roster(host.page);
    await expect(hostRoster.locator(':scope > div')).toHaveCount(6);
    for (const person of [yes, maybe, no, silent]) {
      await expect(hostRoster).toContainText(person.user.name);
    }
    await expect(hostRoster).toContainText('@example.com');
    await expect(hostRoster.getByText("Can't make it")).toHaveCount(1);
    await expect(hostRoster.getByText("Hasn't said yet")).toHaveCount(2);
    await expect(host.page.getByText('3 yes · 1 maybe')).toHaveCount(0); // host is "yes" too: 2 yes
    await expect(host.page.getByText('2 yes · 1 maybe')).toBeVisible();

    // A member: three people (themself, the host, the maybe) and nothing about the others.
    await yes.page.goto(`/brunch/${brunchId}`);
    const memberRoster = roster(yes.page);
    await expect(memberRoster.locator(':scope > div')).toHaveCount(3);
    await expect(memberRoster).toContainText('You');
    await expect(memberRoster.getByText('Yes')).toHaveCount(2);
    await expect(memberRoster.getByText('Maybe')).toHaveCount(1);
    await expect(yes.page.getByText("1 can't make it · 2 haven't said yet")).toBeVisible();
    const page = await yes.page.content();
    for (const hidden of [no.user.name, silent.user.name, host.user.email, no.user.email]) {
      expect(page).not.toContain(hidden);
    }

    // An outsider: the real brunch and a made-up id answer identically, down to the words.
    // (wait for the 404 to be on screen before reading it: the text is empty until it paints)
    const notFound = outsider.page.getByRole('heading', { level: 1, name: NOT_FOUND });
    const real = await outsider.page.goto(`/brunch/${brunchId}`);
    await expect(notFound).toBeVisible();
    const realText = await outsider.page.locator('body').innerText();
    const made = await outsider.page.goto(`/brunch/${MISSING_BRUNCH}`);
    await expect(notFound).toBeVisible();
    const madeText = await outsider.page.locator('body').innerText();
    expect(real?.status()).toBe(404);
    expect(made?.status()).toBe(404);
    expect(realText).toBe(madeText);
  });
});

test.describe('P6 — the "You in?" card, the quiet bars and the leading tag', () => {
  test("answers with I'm in, Maybe or Can't, and keeps the card when saving fails", async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const yes = await makeActor('yes');
    const maybe = await makeActor('maybe');
    const pending = await makeActor('pending');
    const voting = await createVotingBrunch({ host, guests: { yes, maybe, pending } });

    await maybe.page.goto(`/brunch/${voting.brunchId}`);
    await expect(maybe.page.getByRole('heading', { name: 'You in?', exact: true })).toBeVisible();
    // The emoji are decoration: the buttons are named by their words alone.
    const imIn = maybe.page.getByRole('button', { name: "I'm in", exact: true });
    const mayBe = maybe.page.getByRole('button', { name: 'Maybe', exact: true });
    const cant = maybe.page.getByRole('button', { name: "Can't", exact: true });
    await expect(imIn).toBeVisible();
    await expect(mayBe).toBeVisible();
    await expect(cant).toBeVisible();
    await expect(maybe.page.getByText('Current: maybe')).toBeVisible();

    await cant.click();
    await expect(maybe.page.getByText('Current: no')).toBeVisible();
    await imIn.click();
    await expect(maybe.page.getByText('Current: yes')).toBeVisible();

    // A failed save keeps the card, says so in a toast (spec 0014), and the answer is unchanged.
    await maybe.page.route('**/api/v1/brunches/*/rsvp', (route) =>
      route.fulfill({ status: 500, body: '{}' }),
    );
    await mayBe.click();
    await expect(toast(maybe.page, TOAST_WORDS.wentSideways)).toBeVisible();
    await expect(maybe.page.getByText('Current: yes')).toBeVisible();
    await expect(imIn).toBeVisible();
    await expect(cant).toBeVisible();
  });

  test('draws a quiet bar per row, names a leader only when one option is strictly ahead, and hides the bar on a selected row', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const yes = await makeActor('yes');
    const maybe = await makeActor('maybe');
    const pending = await makeActor('pending');
    // The "yes" has voted for Sunny Side Cafe and the first time.
    const { brunchId } = await createVotingBrunch({ host, guests: { yes, maybe, pending } });

    // Someone who has not voted sees the bars: full for the leader, empty for the other.
    await maybe.page.goto(`/brunch/${brunchId}`);
    const places = ballot(maybe.page).locations;
    await expect(places.locator('label > span[aria-hidden="true"]')).toHaveCount(2);
    const sunnyRow = places.locator('label').filter({ hasText: 'Sunny Side Cafe' });
    const harborRow = places.locator('label').filter({ hasText: 'Harbor Bistro' });
    const sunnyBar = await sunnyRow.locator('> span[aria-hidden="true"]').boundingBox();
    const sunnyBox = await sunnyRow.boundingBox();
    const harborBar = await harborRow.locator('> span[aria-hidden="true"]').boundingBox();
    if (sunnyBar === null || sunnyBox === null) throw new Error('the leading row has no bar');
    expect(sunnyBar.width).toBeGreaterThan(sunnyBox.width * 0.9); // the top option fills its row
    expect(harborBar?.width ?? 0).toBe(0); // no votes, no bar
    await expect(places.getByText('leading')).toHaveCount(1);
    await expect(sunnyRow).toContainText('leading');

    // The viewer's own selected row hides its bar (the yes voted for Sunny Side Cafe).
    await yes.page.goto(`/brunch/${brunchId}`);
    const yesSunnyRow = ballot(yes.page).locations.locator('label').filter({
      hasText: 'Sunny Side Cafe',
    });
    await expect(yesSunnyRow.getByRole('checkbox')).toBeChecked();
    await expect(yesSunnyRow.locator('> span[aria-hidden="true"]')).toBeHidden();

    // A tie names nobody: the maybe votes for the other place and the other time.
    await castVotes({
      brunchId,
      voter: maybe.user,
      places: [fixturePlaces.harborBistro.name],
      times: [1],
    });
    await maybe.page.reload();
    await expect(ballot(maybe.page).locations.getByText('leading')).toHaveCount(0);
    await expect(ballot(maybe.page).times.getByText('leading')).toHaveCount(0);

    // A third vote breaks the tie for the first place again.
    await castVotes({ brunchId, voter: host.user, places: [fixturePlaces.harborBistro.name] });
    await maybe.page.reload();
    await expect(ballot(maybe.page).locations.getByText('leading')).toHaveCount(1);
    await expect(
      ballot(maybe.page).locations.locator('label').filter({ hasText: 'Harbor Bistro' }),
    ).toContainText('leading');
  });
});

test.describe('P7 — a confirmed brunch', () => {
  test('says Brunch on., locks in the place and the time, and keeps the status badge as the only "Confirmed"', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const guest = await makeActor('guest');
    await createConfirmedBrunch({ host, guest });

    for (const person of [host, guest]) {
      await person.page.goto('/dashboard');
      await person.page.getByRole('link', { name: /^Open / }).click();

      await expect(
        person.page.getByRole('heading', { name: 'Brunch on.', exact: true }),
      ).toBeVisible();
      await expect(person.page.getByText(/ (are|is) in\.$|You're in\.$/)).toBeVisible();
      await expect(person.page.getByText('Locked in')).toHaveCount(2); // the place and the time
      // the winner leads each card, in words
      await expect(person.page.getByText(fixturePlaces.sunnySide.name).first()).toBeVisible();
      await expect(person.page.getByText(/ · \d{1,2}:\d{2} [AP]M [A-Z]{2,5}$/)).toBeVisible();
      // the exact-text rule: "Confirmed" is the status badge and nothing else says it alone
      await expect(person.page.getByText('Confirmed', { exact: true })).toHaveCount(1);
    }
    // each person is "You" in the banner's line
    await expect(host.page.getByText(/^You & .+ are in\.$/)).toBeVisible();
  });
});

test.describe('P11 — the invitee page at phone width and at desktop width', () => {
  test('on a phone: the order is RSVP, Where, When, Who, then suggestions; helper lines and repeated chips are left out; nothing scrolls sideways', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const yes = await makeActor('yes');
    const maybe = await makeActor('maybe');
    const pending = await makeActor('pending');
    const { brunchId } = await createVotingBrunch({ host, guests: { yes, maybe, pending } });
    await maybe.page.setViewportSize({ width: 390, height: 844 });
    await maybe.page.goto(`/brunch/${brunchId}`);

    const y = async (name: string): Promise<number> => {
      const heading = maybe.page.getByRole('heading', { name, exact: true });
      // wait for it to be on screen: a position read the instant the page loads can find nothing
      await expect(heading).toBeVisible();
      const box = await heading.boundingBox();
      if (box === null) throw new Error(`No heading "${name}" on screen`);
      return box.y;
    };
    const order = [
      await y('You in?'),
      await y('Where to?'),
      await y('When?'),
      await y("Who's coming"),
    ];
    expect(order, 'RSVP, Where, When, Who').toEqual([...order].sort((a, b) => a - b));

    // left out on a phone: the helper line, and the per-card "closes in" chip (the header has one)
    await expect(maybe.page.getByText('Pick any you like')).toHaveCount(2);
    await expect(maybe.page.getByText('Pick any you like').first()).toBeHidden();
    await expect(maybe.page.getByText(/^Closes in/).filter({ visible: true })).toHaveCount(0);
    await expect(maybe.page.getByText(/^Votes coming in · closes in/)).toBeVisible();

    const { scrollWidth, clientWidth } = await maybe.page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth, 'the brunch page scrolls sideways').toBeLessThanOrEqual(clientWidth);
    await expect(maybe.page.getByRole('button', { name: "I'm in", exact: true })).toBeInViewport();
  });

  test('on a desktop: the helper line and the card chips show, in two columns', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const yes = await makeActor('yes');
    const maybe = await makeActor('maybe');
    const pending = await makeActor('pending');
    const { brunchId } = await createVotingBrunch({ host, guests: { yes, maybe, pending } });
    await maybe.page.setViewportSize({ width: 1280, height: 900 });
    await maybe.page.goto(`/brunch/${brunchId}`);

    await expect(maybe.page.getByText('Pick any you like').first()).toBeVisible();
    await expect(maybe.page.getByText(/^Closes in/).first()).toBeVisible();
    const where = await maybe.page
      .getByRole('heading', { name: 'Where to?', exact: true })
      .boundingBox();
    const who = await maybe.page
      .getByRole('heading', { name: "Who's coming", exact: true })
      .boundingBox();
    if (where === null || who === null) throw new Error('headings are not on screen');
    expect(who.x, "Who's coming sits beside Where to?").toBeGreaterThan(where.x + 250);
  });
});
