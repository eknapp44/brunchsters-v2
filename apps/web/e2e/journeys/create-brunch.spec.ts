import { EMPTY_DASHBOARD_HEADLINE } from '../support/dashboard';
import { getDb } from '../support/db';
import { uniqueSuffix } from '../support/factories';
import { expect, test } from '../support/fixtures';
import { inviteRow } from '../support/invites';
import { fixturePlaces } from '../support/places';
import { daysFromNow, toDatetimeLocalValue } from '../support/time';
import { BrunchWizard } from '../support/wizard';

// Journeys C1 and C2 (spec 0003 "Create Brunch" and "Place search detail", spec 0004 wizard step 4).

const BRUNCH_URL = /\/brunch\/([0-9a-f-]{36})$/;

test.describe('C1 — host creates a brunch with the wizard', () => {
  test('two places, two times, a deadline and invitees → detail page → dashboard', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const wizard = new BrunchWizard(host.page);
    const title = `Birthday Brunch ${uniqueSuffix()}`;
    const guestOne = `guest-one-${uniqueSuffix()}@example.com`;
    const guestTwo = `guest-two-${uniqueSuffix()}@example.com`;

    await host.page.goto('/dashboard');
    await expect(host.page.getByText(EMPTY_DASHBOARD_HEADLINE)).toBeVisible();
    await host.page.getByRole('link', { name: 'Plan a Brunch' }).click();
    await expect(host.page).toHaveURL('/brunch/new');

    // Step 1 — What?
    await wizard.fillWhat({ title, description: 'Someone is turning thirty.' });

    // Step 2 — Where? One place gives no hint; the second does.
    await wizard.addPlace(fixturePlaces.sunnySide);
    await expect(host.page.getByText('Multiple locations will be put to a vote')).toHaveCount(0);
    await wizard.addPlace(fixturePlaces.harborBistro);
    await expect(host.page.getByText('Multiple locations will be put to a vote')).toBeVisible();
    await wizard.next();

    // Step 3 — When? Two candidate places make the deadline field available.
    await wizard.addTime(10);
    await wizard.addTime(11);
    await expect(host.page.getByText('Multiple times will be put to a vote')).toBeVisible();
    await host.page
      .getByLabel('Voting closes by')
      .fill(toDatetimeLocalValue(daysFromNow(5, 18, 0)));
    await wizard.next();

    // Step 4 — Who?
    await wizard.addEmail(guestOne);
    await wizard.addEmail(guestTwo);
    await wizard.create();

    // Lands on the detail page for the new brunch.
    await expect(host.page).toHaveURL(BRUNCH_URL);
    const brunchId = BRUNCH_URL.exec(host.page.url())?.[1] ?? '';
    await expect(host.page.getByRole('heading', { name: title })).toBeVisible();
    await expect(host.page.getByText('Active', { exact: true })).toBeVisible();
    // Two places and two times are a vote, so both appear as checklist options.
    await expect(
      host.page.getByRole('checkbox', { name: new RegExp(`^${fixturePlaces.sunnySide.name}`) }),
    ).toBeVisible();
    await expect(
      host.page.getByRole('checkbox', { name: new RegExp(`^${fixturePlaces.harborBistro.name}`) }),
    ).toBeVisible();
    await expect(host.page.getByRole('checkbox')).toHaveCount(4);
    await expect(inviteRow(host.page, guestOne)).toBeVisible();
    await expect(inviteRow(host.page, guestTwo)).toBeVisible();

    // What the browser round trip actually persisted.
    const db = getDb();
    expect(await db.brunchLocation.count({ where: { brunchId } })).toBe(2);
    expect(await db.brunchTime.count({ where: { brunchId } })).toBe(2);
    const brunch = await db.brunch.findFirst({ where: { id: brunchId } });
    expect(brunch?.description).toBe('Someone is turning thirty.');
    expect(brunch?.votingDeadline).not.toBeNull();
    const invited = (await db.brunchInvite.findMany({ where: { brunchId } })).map(
      (invite) => invite.invitedEmail,
    );
    expect(invited).toEqual(expect.arrayContaining([guestOne, guestTwo, host.user.email]));

    // And it is on the host's dashboard.
    await host.page.goto('/dashboard');
    await expect(host.page.getByRole('link', { name: title })).toBeVisible();
  });
});

test.describe('C2 — wizard behavior', () => {
  test('a title is required before leaving step 1', async ({ makeActor }) => {
    const host = await makeActor('host');
    await new BrunchWizard(host.page).open();

    const next = host.page.getByRole('button', { name: 'Continue', exact: true });
    await expect(next).toBeDisabled();
    await host.page.getByLabel('Title').fill('   ');
    await expect(next).toBeDisabled();
    await host.page.getByLabel('Title').fill('Sunday Brunch');
    await expect(next).toBeEnabled();
  });

  test('place search waits for three characters, debounces, and shares one billing session', async ({
    makeActor,
  }) => {
    const host = await makeActor('searcher');
    const wizard = new BrunchWizard(host.page);
    const placeRequests: URL[] = [];
    host.page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/v1/places/')) placeRequests.push(url);
    });

    // The search is debounced by a timer, so take control of time to assert that nothing
    // happened (a sleep could not prove it).
    await host.page.clock.install();
    await wizard.open();
    await host.page.clock.pauseAt(new Date(Date.now() + 60_000));
    await wizard.fillWhat({ title: 'Search Test' });

    await wizard.searchBox().pressSequentially('su');
    await host.page.clock.runFor(1_000);
    expect(host.places.searchQueries()).toEqual([]);

    // The rest of the word arrives before the debounce expires: one request, for the full text.
    await wizard.searchBox().pressSequentially('nny');
    await host.page.clock.runFor(1_000);
    await expect.poll(() => host.places.searchQueries()).toEqual(['sunny']);

    await host.page
      .getByRole('button', {
        name: `${fixturePlaces.sunnySide.name} — ${fixturePlaces.sunnySide.address}`,
      })
      .click();
    await expect(wizard.selectedItem(fixturePlaces.sunnySide.name)).toBeVisible();
    expect(host.places.detailPlaceIds()).toEqual([fixturePlaces.sunnySide.placeId]);

    // Selecting closes the billing session: the search and the details lookup shared a token...
    const firstSession = placeRequests.map((url) => url.searchParams.get('sessionToken'));
    expect(firstSession).toHaveLength(2);
    expect(firstSession[0]).toBeTruthy();
    expect(firstSession[1]).toBe(firstSession[0]);

    // ...and the next search starts a new one.
    await wizard.searchBox().fill('harbor');
    await host.page.clock.runFor(1_000);
    await expect.poll(() => host.places.searchQueries()).toEqual(['sunny', 'harbor']);
    const secondToken = placeRequests.at(-1)?.searchParams.get('sessionToken');
    expect(secondToken).toBeTruthy();
    expect(secondToken).not.toBe(firstSession[0]);
  });

  test('hints and the voting-deadline field follow the number of options, and removal undoes them', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const wizard = new BrunchWizard(host.page);
    await wizard.open();
    await wizard.fillWhat({ title: 'Hint Test' });

    await wizard.addPlace(fixturePlaces.sunnySide);
    await wizard.addPlace(fixturePlaces.harborBistro);
    await expect(host.page.getByText('Multiple locations will be put to a vote')).toBeVisible();
    await wizard.remove(fixturePlaces.harborBistro.name);
    await expect(wizard.selectedItem(fixturePlaces.harborBistro.name)).toHaveCount(0);
    await expect(host.page.getByText('Multiple locations will be put to a vote')).toHaveCount(0);
    await wizard.next();

    // One place and one time: nothing to vote on, so no deadline field.
    await wizard.addTime(10);
    await expect(host.page.getByLabel('Voting closes by')).toHaveCount(0);
    await wizard.addTime(11);
    await expect(host.page.getByText('Multiple times will be put to a vote')).toBeVisible();
    await expect(host.page.getByLabel('Voting closes by')).toBeVisible();

    await host.page
      .getByRole('listitem')
      .filter({ has: host.page.getByRole('button', { name: 'Remove' }) })
      .last()
      .getByRole('button', { name: 'Remove' })
      .click();
    await expect(host.page.getByText('Multiple times will be put to a vote')).toHaveCount(0);
    await expect(host.page.getByLabel('Voting closes by')).toHaveCount(0);
  });

  test('going back keeps everything entered so far', async ({ makeActor }) => {
    const host = await makeActor('host');
    const wizard = new BrunchWizard(host.page);
    await wizard.open();
    await wizard.fillWhat({ title: 'Back And Forth', description: 'Keep me.' });
    await wizard.addPlace(fixturePlaces.pacificBrunchHouse);
    await wizard.next();
    await wizard.addTime(7);
    await wizard.next();
    const email = `kept-${uniqueSuffix()}@example.com`;
    await wizard.addEmail(email);

    await wizard.back(); // → step 3
    await expect(host.page.getByRole('listitem')).toHaveCount(1);
    await wizard.back(); // → step 2
    await expect(wizard.selectedItem(fixturePlaces.pacificBrunchHouse.name)).toBeVisible();
    await wizard.back(); // → step 1
    await expect(host.page.getByLabel('Title')).toHaveValue('Back And Forth');
    await expect(host.page.getByLabel('Description')).toHaveValue('Keep me.');

    await wizard.next();
    await wizard.next();
    await wizard.next();
    await expect(wizard.selectedItem(email)).toBeVisible();
  });

  test('the invitee list stops at 50, says where to invite the rest, and all 50 are invited', async ({
    makeActor,
  }) => {
    const host = await makeActor('host');
    const wizard = new BrunchWizard(host.page);
    const title = `Big Brunch ${uniqueSuffix()}`;
    const suffix = uniqueSuffix();
    await wizard.open();
    await wizard.fillWhat({ title });
    await wizard.addPlace(fixturePlaces.sunnySide);
    await wizard.next();
    await wizard.addTime(7);
    await wizard.next();

    for (let index = 1; index <= 50; index += 1) {
      await wizard.addEmail(`guest-${index}-${suffix}@example.com`);
    }

    // The 50th address fills the list: no more can be added, and the page says why.
    const limitMessage = host.page.getByText(
      'You can add up to 50 people here. Invite the rest from the brunch page after you create it.',
    );
    await expect(limitMessage).toBeVisible();
    await expect(host.page.getByRole('textbox', { name: 'Email address' })).toBeDisabled();
    await expect(host.page.getByRole('button', { name: 'Add', exact: true })).toBeDisabled();
    await expect(host.page.getByRole('listitem')).toHaveCount(50);

    // Removing one frees a slot and the message goes away.
    await wizard.remove(`guest-50-${suffix}@example.com`);
    await expect(limitMessage).toHaveCount(0);
    await expect(host.page.getByRole('button', { name: 'Add', exact: true })).toBeEnabled();
    await wizard.addEmail(`last-${suffix}@example.com`);
    await expect(limitMessage).toBeVisible();

    // The whole list is accepted by the server: nothing is silently dropped.
    await wizard.create();
    // Creating the brunch and then 50 invites (each its own row and queued email) takes a
    // while, longer in dev mode under the suite's parallel load than the default 5 seconds.
    await expect(host.page).toHaveURL(BRUNCH_URL, { timeout: 30_000 });
    const brunchId = BRUNCH_URL.exec(host.page.url())?.[1] ?? '';
    const invited = await getDb().brunchInvite.findMany({
      where: { brunchId, NOT: { invitedEmail: host.user.email } },
    });
    expect(invited).toHaveLength(50);
  });
});
