import { createDb } from '@brunchsters/database';
import {
  normalizeEmail,
  type BrunchId,
  type BrunchLocationId,
  type BrunchTimeId,
  type InviteId,
  type InviteToken,
  type UserId,
} from '@brunchsters/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NoopEventBus } from '../events/NoopEventBus';
import { respondToInvite } from '../invite/respondToInvite';
import { revokeInvite } from '../invite/revokeInvite';
import { sendInvites } from '../invite/sendInvites';
import { castLocationBallot } from './castLocationBallot';
import { castTimeBallot } from './castTimeBallot';
import { closeVoting } from './closeVoting';
import { confirmBrunch } from './confirmBrunch';
import { createBrunch } from './createBrunch';
import { getBrunchesForUser } from './getBrunchesForUser';
import { getBrunchRoster } from './getBrunchRoster';
import { groupDashboard } from './presentation/groupDashboard';

// What the dashboard and the brunch page read (spec 0011 M2): the roster and the dashboard
// summaries, against real Postgres. Requires: supabase start + seeded lookup tables.
const RUN_ID = Date.now();
const email = (label: string) => normalizeEmail(`integration-dash-${label}-${RUN_ID}@example.com`);
const HOST_EMAIL = email('host');
const YES_EMAIL = email('yes');
const MAYBE_EMAIL = email('maybe');
const NO_EMAIL = email('no');
const KNOWN_EMAIL = email('known');
const OUTSIDER_EMAIL = email('outsider');
const NEWCOMER_EMAIL = email('newcomer');

const db = createDb();
const eventBus = new NoopEventBus();

type Person = { readonly id: UserId; readonly email: string };
let host: Person;
let yes: Person;
let maybe: Person;
let no: Person;
let outsider: Person;
const createdBrunchIds: string[] = [];

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('Expected a row, found none');
  return value;
}

async function makeUser(emailAddress: string, name: string): Promise<Person> {
  const user = await db.user.create({ data: { name, email: emailAddress } });
  return { id: user.id as UserId, email: emailAddress };
}

beforeAll(async () => {
  host = await makeUser(HOST_EMAIL, 'Evan Knapp');
  yes = await makeUser(YES_EMAIL, 'Maya Reyes');
  maybe = await makeUser(MAYBE_EMAIL, 'Robin Cole');
  no = await makeUser(NO_EMAIL, 'Sam Liu');
  // has an account but never opens the invite link: the placeholder "invited" attendee
  await makeUser(KNOWN_EMAIL, 'Jess Martinez');
  outsider = await makeUser(OUTSIDER_EMAIL, 'Olive Outsider');
});

afterAll(async () => {
  const brunchIds = { in: createdBrunchIds };
  await db.brunchLocationVote.deleteMany({ where: { brunchLocation: { brunchId: brunchIds } } });
  await db.brunchTimeVote.deleteMany({ where: { brunchTime: { brunchId: brunchIds } } });
  await db.brunchLocation.deleteMany({ where: { brunchId: brunchIds } });
  await db.brunchTime.deleteMany({ where: { brunchId: brunchIds } });
  await db.brunchAttendee.deleteMany({ where: { brunchId: brunchIds } });
  await db.brunchInvite.deleteMany({ where: { brunchId: brunchIds } });
  await db.brunch.deleteMany({ where: { id: brunchIds } });
  await db.user.deleteMany({
    where: {
      email: {
        in: [HOST_EMAIL, YES_EMAIL, MAYBE_EMAIL, NO_EMAIL, KNOWN_EMAIL, OUTSIDER_EMAIL],
      },
    },
  });
});

const inDays = (days: number): string => new Date(Date.now() + days * 24 * 3_600_000).toISOString();

// A brunch with two places and two times, invited through the real path (draft becomes active):
// yes, maybe and no have answered; `known` has an account but has not opened the link (the
// placeholder "invited" attendee); a newcomer has no account (an invite and no attendee).
async function createInvitedBrunch(title: string): Promise<BrunchId> {
  const created = await createBrunch(
    {
      title,
      hostId: host.id,
      description: 'Sunday vibes',
      locations: [1, 2].map((n) => ({
        placeId: `place-${n}-${RUN_ID}-${title}`,
        placeName: `Cafe ${n}`,
        placeAddress: `${n} Main St`,
        placeUrl: `https://maps.google.com/?cid=${n}`,
        timezone: 'America/Los_Angeles',
      })),
      times: [{ scheduledAt: inDays(10) }, { scheduledAt: inDays(11) }],
    },
    { db, eventBus },
  );
  const brunchId = created._unsafeUnwrap().id;
  createdBrunchIds.push(brunchId);

  const invited = await sendInvites(
    {
      brunchId,
      invitedById: host.id,
      emails: [YES_EMAIL, MAYBE_EMAIL, NO_EMAIL, KNOWN_EMAIL, NEWCOMER_EMAIL],
    },
    { db, eventBus },
  );
  expect(invited.isOk()).toBe(true);

  for (const [person, response] of [
    [yes, 'yes'],
    [maybe, 'maybe'],
    [no, 'no'],
  ] as const) {
    const invite = required(
      await db.brunchInvite.findFirst({ where: { brunchId, invitedEmail: person.email } }),
    );
    const joined = await respondToInvite(
      { token: invite.token as InviteToken, viewerId: person.id, response },
      { db, eventBus },
    );
    expect(joined.isOk()).toBe(true);
  }
  return brunchId;
}

async function optionIds(brunchId: BrunchId) {
  const locations = await db.brunchLocation.findMany({
    where: { brunchId },
    orderBy: { createdAt: 'asc' },
  });
  const times = await db.brunchTime.findMany({
    where: { brunchId },
    orderBy: { scheduledAt: 'asc' },
  });
  return {
    locations: locations.map((l) => l.id as BrunchLocationId),
    times: times.map((t) => t.id as BrunchTimeId),
  };
}

async function summaryFor(person: Person, brunchId: BrunchId) {
  const all = await getBrunchesForUser({ userId: person.id }, { db });
  return required(all.find((summary) => summary.id === brunchId));
}

describe('getBrunchRoster (integration — real Postgres)', () => {
  it('shows the host everyone by full name, and the invited-but-silent by name or email', async () => {
    const brunchId = await createInvitedBrunch('roster-host');

    const roster = await getBrunchRoster({ brunchId, viewerId: host.id }, { db });

    expect(roster?.kind).toBe('host');
    expect(roster?.people.map((p) => [p.name, p.state])).toEqual([
      ['You', 'yes'],
      ['Maya Reyes', 'yes'],
      ['Robin Cole', 'maybe'],
      ['Sam Liu', 'no'],
      ['Jess Martinez', 'pending'],
      [NEWCOMER_EMAIL, 'pending'],
    ]);
    expect(roster?.counts).toEqual({ yes: 2, maybe: 1, no: 1, pending: 2 });
  });

  it('shows another member only First L. for yes and maybe, and counts for the rest', async () => {
    const brunchId = await createInvitedBrunch('roster-member');

    const roster = await getBrunchRoster({ brunchId, viewerId: yes.id }, { db });

    expect(roster?.kind).toBe('member');
    expect(roster?.people.map((p) => [p.name, p.state])).toEqual([
      ['You', 'yes'],
      ['Evan K.', 'yes'],
      ['Robin C.', 'maybe'],
    ]);
    expect(roster?.counts).toEqual({ yes: 2, maybe: 1, no: 1, pending: 2 });
    const serialized = JSON.stringify(roster);
    for (const secret of ['Liu', 'Sam', 'Jess', 'Martinez', NEWCOMER_EMAIL, HOST_EMAIL, host.id]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('shows a member who said no the same view as any other member', async () => {
    const brunchId = await createInvitedBrunch('roster-no');

    const roster = await getBrunchRoster({ brunchId, viewerId: no.id }, { db });

    expect(roster?.kind).toBe('member');
    expect(roster?.people.map((p) => p.name)).toEqual(['Evan K.', 'Maya R.', 'Robin C.']);
  });

  it('gives an outsider nothing, the same as a made-up brunch id', async () => {
    const brunchId = await createInvitedBrunch('roster-outsider');
    const madeUp = '00000000-0000-4000-8000-000000000000' as BrunchId;

    const real = await getBrunchRoster({ brunchId, viewerId: outsider.id }, { db });
    const fake = await getBrunchRoster({ brunchId: madeUp, viewerId: outsider.id }, { db });

    expect(real).toBeUndefined();
    expect(fake).toBeUndefined();
  });

  it('drops a revoked invite and its attendee from the roster', async () => {
    const brunchId = await createInvitedBrunch('roster-revoked');
    const knownInvite = required(
      await db.brunchInvite.findFirst({ where: { brunchId, invitedEmail: KNOWN_EMAIL } }),
    );
    const newcomerInvite = required(
      await db.brunchInvite.findFirst({ where: { brunchId, invitedEmail: NEWCOMER_EMAIL } }),
    );
    for (const invite of [knownInvite, newcomerInvite]) {
      const revoked = await revokeInvite(
        { inviteId: invite.id as InviteId, requestedById: host.id },
        { db },
      );
      expect(revoked.isOk()).toBe(true);
    }

    const roster = await getBrunchRoster({ brunchId, viewerId: host.id }, { db });

    expect(roster?.counts).toEqual({ yes: 2, maybe: 1, no: 1, pending: 0 });
    expect(roster?.people.map((p) => p.name)).not.toContain('Jess Martinez');
    expect(roster?.people.map((p) => p.name)).not.toContain(NEWCOMER_EMAIL);
  });
});

describe('getBrunchesForUser, the dashboard fields (integration — real Postgres)', () => {
  it('says a vote is waiting for each person who can vote and has not, and not for a "no"', async () => {
    const brunchId = await createInvitedBrunch('waiting');

    expect((await summaryFor(host, brunchId)).votesWaiting).toBe(true);
    expect((await summaryFor(yes, brunchId)).votesWaiting).toBe(true);
    expect((await summaryFor(maybe, brunchId)).votesWaiting).toBe(true);
    expect((await summaryFor(no, brunchId)).votesWaiting).toBe(false);
  });

  it('clears the pill only once the person has voted on both lists', async () => {
    const brunchId = await createInvitedBrunch('voted');
    const options = await optionIds(brunchId);

    await castLocationBallot(
      { brunchId, voterId: yes.id, optionIds: [required(options.locations[0])] },
      { db, eventBus },
    );
    expect((await summaryFor(yes, brunchId)).votesWaiting).toBe(true);

    await castTimeBallot(
      { brunchId, voterId: yes.id, optionIds: [required(options.times[0])] },
      { db, eventBus },
    );
    expect((await summaryFor(yes, brunchId)).votesWaiting).toBe(false);
    expect((await summaryFor(maybe, brunchId)).votesWaiting).toBe(true);
  });

  it('stops waiting, and says voting is closed, once the host closes voting', async () => {
    const brunchId = await createInvitedBrunch('closed');

    const closed = await closeVoting({ brunchId, requestedById: host.id }, { db });
    expect(closed.isOk()).toBe(true);

    const summary = await summaryFor(yes, brunchId);
    expect(summary.votingClosed).toBe(true);
    expect(summary.votesWaiting).toBe(false);
  });

  it('carries the description and no confirmed place or time while voting', async () => {
    const brunchId = await createInvitedBrunch('open');

    const summary = await summaryFor(host, brunchId);

    expect(summary.description).toBe('Sunday vibes');
    expect(summary.statusCode).toBe('active');
    expect(summary.placeName).toBeUndefined();
    expect(summary.scheduledAt).toBeUndefined();
    expect(summary.timezone).toBeUndefined();
  });

  it('carries the confirmed place, time and zone once the host confirms, and never waits', async () => {
    const brunchId = await createInvitedBrunch('confirmed');
    const options = await optionIds(brunchId);
    const timeId = required(options.times[0]);

    const confirmed = await confirmBrunch(
      {
        brunchId,
        requestedById: host.id,
        locationId: required(options.locations[1]),
        timeId,
      },
      { db, eventBus },
    );
    expect(confirmed.isOk()).toBe(true);

    const summary = await summaryFor(yes, brunchId);
    expect(summary.statusCode).toBe('confirmed');
    expect(summary.placeName).toBe('Cafe 2');
    expect(summary.timezone).toBe('America/Los_Angeles');
    expect(summary.scheduledAt?.toISOString()).toBe(
      required(await db.brunchTime.findFirst({ where: { id: timeId } })).scheduledAt.toISOString(),
    );
    expect(summary.votesWaiting).toBe(false);
  });

  it('files a confirmed brunch as Past once its time has passed (derived at read time)', async () => {
    const brunchId = await createInvitedBrunch('past');
    const options = await optionIds(brunchId);
    const timeId = required(options.times[0]);
    await confirmBrunch(
      {
        brunchId,
        requestedById: host.id,
        locationId: required(options.locations[0]),
        timeId,
      },
      { db, eventBus },
    );

    const before = groupDashboard(
      await getBrunchesForUser({ userId: host.id }, { db }),
      new Date(),
    );
    // (the other tests' brunches belong to the same host, so only this brunch is asserted on)
    expect([before.nextUp, ...before.upcoming].map((b) => b?.id)).toContain(brunchId);
    expect(before.past.map((b) => b.id)).not.toContain(brunchId);

    // Nothing in the app can put a confirmed time in the past, so this one test moves it by hand.
    await db.brunchTime.update({
      where: { id: timeId },
      data: { scheduledAt: new Date(Date.now() - 24 * 3_600_000) },
    });

    const after = groupDashboard(await getBrunchesForUser({ userId: host.id }, { db }), new Date());
    expect(after.past.map((b) => b.id)).toContain(brunchId);
    expect(after.upcoming.map((b) => b.id)).not.toContain(brunchId);
    expect(after.nextUp?.id).not.toBe(brunchId);
  });
});
