import { formatPersonName } from '@brunchsters/shared';
import type { Locator, Page } from '@playwright/test';
import { createBrunch, uniqueSuffix } from '../support/factories';
import { expect, test } from '../support/fixtures';
import { fixturePlaces } from '../support/places';
import { createConfirmedBrunch, createVotingBrunch } from '../support/showcase';
import {
  addAttendee,
  castVotes,
  closeVoting,
  confirmBrunch,
  passConfirmedTime,
} from '../support/voting';

type BoundingBox = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

// Spec 0011 (design fidelity), the dashboard: the time-aware greeting (P1), the next-up card and
// who is coming (P2), the "vote waiting" pill (P3), a confirmed brunch whose time has passed
// (P4), and the phone layout (P11). Journeys for the brunch page, the wizard and the front door
// are added with their milestones.

const firstWord = (name: string): string => name.split(' ')[0] ?? name;

async function onScreen(locator: Locator, what: string): Promise<BoundingBox> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error(`${what} has no box: it is not on screen`);
  return box;
}

function rosterOf(page: Page) {
  return page.getByRole('group', { name: "Who's coming" });
}

test.describe('P1 — the greeting follows the browser clock', () => {
  test('says Morning, Afternoon, Evening or Hey, with the date where the person is', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const name = firstWord(host.user.name);
    const hydrationProblems: string[] = [];
    host.page.on('console', (message) => {
      if (/hydrat/i.test(message.text())) hydrationProblems.push(message.text());
    });

    // The browser runs in Chicago (playwright.config.ts), where this is still Wednesday the 21st
    // at 11:30 pm, although it is already Thursday in UTC, which is what the server runs in.
    const moments: readonly { readonly at: string; readonly word: string }[] = [
      { at: '2026-10-21T08:00:00-05:00', word: 'Morning' },
      { at: '2026-10-21T14:00:00-05:00', word: 'Afternoon' },
      { at: '2026-10-21T19:00:00-05:00', word: 'Evening' },
      { at: '2026-10-21T23:30:00-05:00', word: 'Hey' },
      { at: '2026-10-21T04:30:00-05:00', word: 'Hey' },
    ];
    for (const moment of moments) {
      await host.page.clock.setFixedTime(new Date(moment.at));
      await host.page.goto('/dashboard');
      await expect(
        host.page.getByRole('heading', { level: 1, name: `${moment.word}, ${name}` }),
      ).toBeVisible();
      await expect(host.page.getByText('Wednesday, October 21')).toBeVisible();
    }
    expect(hydrationProblems, 'the greeting must not cause a hydration warning').toEqual([]);
  });
});

test.describe('P2 — the next-up card and who is coming', () => {
  test('puts the soonest confirmed brunch in the card, and shows each person what they may see', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const yes = await makeActor('yes');
    const maybe = await makeActor('maybe');
    const no = await makeActor('no');
    const pending = await makeActor('pending');
    const title = `Next Up ${uniqueSuffix()}`;
    const brunchId = await createBrunch({ host: host.user, title });
    await addAttendee({ brunchId, host: host.user, user: yes.user, response: 'yes' });
    await addAttendee({ brunchId, host: host.user, user: maybe.user, response: 'maybe' });
    await addAttendee({ brunchId, host: host.user, user: no.user, response: 'no' });
    await addAttendee({ brunchId, host: host.user, user: pending.user, response: 'pending' });
    await confirmBrunch({
      brunchId,
      host: host.user,
      place: fixturePlaces.sunnySide.name,
      timeIndex: 0,
    });
    // A newer brunch that is only voting: confirmed and still to come wins the card.
    const newer = await createVotingBrunch({
      host,
      guests: { yes, maybe, pending },
      title: `Newer Voting ${uniqueSuffix()}`,
    });

    // The host: the card, not repeated in the list, with everyone by full name and state.
    await host.page.goto('/dashboard');
    await expect(host.page.getByRole('heading', { level: 2, name: title })).toBeVisible();
    await expect(host.page.getByRole('listitem').filter({ hasText: title })).toHaveCount(0);
    await expect(host.page.getByRole('listitem').filter({ hasText: newer.title })).toHaveCount(1);
    const hostRoster = rosterOf(host.page);
    for (const person of [yes, maybe, no, pending]) {
      await expect(hostRoster).toContainText(person.user.name);
    }
    await expect(hostRoster).toContainText("hasn't said yet");
    await expect(hostRoster).toContainText("can't make it");

    // A member who said yes: "First L." for the yes and the maybe, and only numbers for the rest.
    await yes.page.goto('/dashboard');
    const memberRoster = rosterOf(yes.page);
    await expect(memberRoster).toContainText(
      formatPersonName({ fullName: maybe.user.name, audience: 'member' }),
    );
    await expect(memberRoster).toContainText(
      formatPersonName({ fullName: host.user.name, audience: 'member' }),
    );
    await expect(memberRoster).toContainText('You');
    await expect(yes.page.getByText("1 can't make it · 1 haven't said yet")).toBeVisible();
    // Exactly three people are named (the viewer, the host, the maybe): the "no" and the person
    // who has not answered are not in the group at all, in any form. (Test names all start with
    // "E2E", so a "First L." could collide between people; counting rows does not.)
    await expect(memberRoster.locator(':scope > div')).toHaveCount(3);
    await expect(memberRoster.getByText('Going')).toHaveCount(2);
    await expect(memberRoster.getByText('maybe', { exact: true })).toHaveCount(1);
    // Nothing on the page, visible or not, carries a full name or an address of anyone hidden
    // from this member (surnames and emails are unique per test person).
    const page = await yes.page.content();
    for (const hidden of [no.user.name, pending.user.name, pending.user.email, host.user.email]) {
      expect(page).not.toContain(hidden);
    }
  });
});

test.describe('P3 — a vote waiting on you', () => {
  test('shows for each person who can vote and has not, and clears when they vote or voting closes', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const yes = await makeActor('yes');
    const maybe = await makeActor('maybe');
    const pending = await makeActor('pending');
    // The "yes" has already voted on both lists (createVotingBrunch does that).
    const { brunchId } = await createVotingBrunch({ host, guests: { yes, maybe, pending } });
    const waiting = (page: Page) => page.getByText('1 vote waiting');

    await host.page.goto('/dashboard');
    await expect(waiting(host.page)).toBeVisible(); // the host votes too
    await maybe.page.goto('/dashboard');
    await expect(waiting(maybe.page)).toBeVisible(); // a maybe has a say
    await yes.page.goto('/dashboard');
    await expect(yes.page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(waiting(yes.page)).toHaveCount(0); // already voted
    await pending.page.goto('/dashboard');
    await expect(pending.page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(waiting(pending.page)).toHaveCount(0); // has not answered, so no say yet

    await castVotes({
      brunchId,
      voter: maybe.user,
      places: [fixturePlaces.sunnySide.name],
      times: [0],
    });
    await maybe.page.reload();
    await expect(maybe.page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(waiting(maybe.page)).toHaveCount(0);

    await closeVoting({ brunchId, host: host.user });
    await host.page.reload();
    await expect(host.page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(waiting(host.page)).toHaveCount(0);
  });
});

test.describe('P4 — a confirmed brunch whose time has passed', () => {
  test('moves from the card to Past for everyone in it, and stays "Confirmed"', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const guest = await makeActor('guest');
    const { brunchId, title } = await createConfirmedBrunch({ host, guest });

    // Before: it is the next-up card, and there is nothing in Past.
    await host.page.goto('/dashboard');
    await expect(host.page.getByRole('heading', { level: 2, name: title })).toBeVisible();
    await expect(host.page.getByRole('heading', { name: 'Past' })).toHaveCount(0);

    await passConfirmedTime(brunchId);

    for (const person of [host, guest]) {
      await person.page.goto('/dashboard');
      // No card any more: the brunch is a row under Past, still labelled with its status.
      await expect(person.page.getByRole('heading', { level: 2, name: title })).toHaveCount(0);
      await expect(person.page.getByRole('heading', { name: 'Past' })).toBeVisible();
      const row = person.page.getByRole('listitem').filter({ hasText: title });
      await expect(row).toHaveCount(1);
      await expect(row).toContainText('Confirmed');
      await expect(person.page.getByText('No upcoming brunches.')).toBeVisible();
    }
  });
});

test.describe('P11 — the dashboard at phone width and at desktop width', () => {
  async function dashboardWithFiveGoing(
    makeActor: Parameters<Parameters<typeof test>[2]>[0]['makeActor'],
  ) {
    const host = await makeActor('host');
    const brunchId = await createBrunch({ host: host.user, title: `Phone Next ${uniqueSuffix()}` });
    for (const label of ['a', 'b', 'c', 'd']) {
      const guest = await makeActor(`guest-${label}`);
      await addAttendee({ brunchId, host: host.user, user: guest.user, response: 'yes' });
    }
    await confirmBrunch({
      brunchId,
      host: host.user,
      place: fixturePlaces.sunnySide.name,
      timeIndex: 0,
    });
    await createBrunch({ host: host.user, title: 'Phone Draft Brunch' });
    return host;
  }

  test('on a phone: rows stack, the roster shows three names and how many more, nothing scrolls sideways', async ({
    makeActor,
  }) => {
    const host = await dashboardWithFiveGoing(makeActor);
    await host.page.setViewportSize({ width: 390, height: 844 });
    await host.page.goto('/dashboard');

    const row = host.page.getByRole('listitem').filter({ hasText: 'Phone Draft Brunch' });
    const tile = row.getByRole('img', { name: 'Date to be decided' });
    const title = row.getByRole('link', { name: 'Phone Draft Brunch' });
    const status = row.getByText('In the works');
    const tileBox = await onScreen(tile, 'the date tile');
    const titleBox = await onScreen(title, 'the title');
    const statusBox = await onScreen(status, 'the status');
    // date on the left, the title above the status: the row is vertical, not one long line
    expect(tileBox.x + tileBox.width).toBeLessThanOrEqual(titleBox.x);
    expect(statusBox.y).toBeGreaterThan(titleBox.y + titleBox.height - 1);

    const roster = rosterOf(host.page);
    await expect(roster.getByText('Going').filter({ visible: true })).toHaveCount(3);
    await expect(roster.getByText('+2 more')).toBeVisible();

    const { scrollWidth, clientWidth } = await host.page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth, 'the dashboard scrolls sideways').toBeLessThanOrEqual(clientWidth);
    await expect(host.page.getByRole('link', { name: 'Plan a Brunch' })).toBeInViewport();
  });

  test('on a desktop: every name shows and there is no "+N more"', async ({ makeActor }) => {
    const host = await dashboardWithFiveGoing(makeActor);
    await host.page.setViewportSize({ width: 1280, height: 800 });
    await host.page.goto('/dashboard');

    const roster = rosterOf(host.page);
    await expect(roster.getByText('Going').filter({ visible: true })).toHaveCount(5);
    await expect(roster.getByText(/\+\d+ more/).filter({ visible: true })).toHaveCount(0);
  });
});
