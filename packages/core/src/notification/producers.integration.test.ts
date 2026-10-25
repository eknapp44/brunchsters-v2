import { createDb } from '@brunchsters/database';
import { normalizeEmail, type BrunchId, type InviteId, type UserId } from '@brunchsters/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createBrunch } from '../brunch/createBrunch';
import { suggestLocation } from '../brunch/suggestLocation';
import { suggestTime } from '../brunch/suggestTime';
import { suggestInvitee } from '../invite/suggestInvitee';
import { InMemoryRateLimiter } from '../rateLimit/InMemoryRateLimiter';
import { NoopEventBus } from '../events/NoopEventBus';
import { notifyHostOfReply, notifyHostOfSuggestion, notifyHostOfVote } from './notifyHost';
import { notifyInvited } from './notifyInvited';
import {
  notifyBrunchCancelled,
  notifyBrunchConfirmed,
  notifyBrunchReinstated,
} from './notifyMembers';

// The producers against the real database (spec 0015 M2): who gets a row for each event, who does
// not, and that running a handler twice writes each row once. Requires: supabase start and the
// seeded lookup tables (pnpm db:seed).
const RUN_ID = Date.now();
const email = (name: string) =>
  normalizeEmail(`integration-producers-${name}-${RUN_ID}@example.com`);

const db = createDb();
const eventBus = new NoopEventBus();

let hostId: UserId;
let mayaId: UserId; // yes
let samId: UserId; // maybe
let noId: UserId; // said no
let mutedId: UserId; // yes, brunch muted
let bigId: UserId; // yes, just big stuff
let outsiderId: UserId;
let brunchId: BrunchId;
const brunchIds: BrunchId[] = [];
const userIds: UserId[] = [];

async function makeUser(name: string): Promise<UserId> {
  const user = await db.user.create({ data: { name: `Producer ${name}`, email: email(name) } });
  userIds.push(user.id as UserId);
  return user.id as UserId;
}

async function addMember(params: {
  readonly brunch: BrunchId;
  readonly userId: UserId;
  readonly rsvp: 'yes' | 'maybe' | 'no' | 'invited';
  readonly level?: 'muted' | 'big_stuff';
}): Promise<InviteId> {
  const [status, level] = await Promise.all([
    db.rsvpStatus.findFirstOrThrow({ where: { code: params.rsvp } }),
    params.level === undefined
      ? undefined
      : db.notificationLevel.findUniqueOrThrow({ where: { code: params.level } }),
  ]);
  const invite = await db.brunchInvite.create({
    data: {
      brunchId: params.brunch,
      invitedUserId: params.userId,
      invitedEmail: email(`member-${params.userId}`),
      invitedById: hostId,
      token: `tok-${RUN_ID}-${params.userId}-${params.brunch}`,
      tokenExpiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  await db.brunchAttendee.create({
    data: {
      brunchId: params.brunch,
      userId: params.userId,
      inviteId: invite.id,
      rsvpStatusId: status.id,
      ...(level === undefined ? {} : { notificationLevelId: level.id }),
    },
  });
  return invite.id as InviteId;
}

async function newBrunch(title: string): Promise<BrunchId> {
  const created = await createBrunch(
    {
      title,
      hostId,
      locations: [
        {
          placeId: `place-${RUN_ID}-${brunchIds.length}`,
          placeName: 'Tartine',
          placeAddress: '600 Guerrero St',
          placeUrl: 'https://maps.example.com/tartine',
          timezone: 'America/Los_Angeles',
        },
      ],
      times: [{ scheduledAt: '2026-12-06T18:00:00.000Z' }],
    },
    { db, eventBus },
  );
  const id = created._unsafeUnwrap().id as BrunchId;
  brunchIds.push(id);
  return id;
}

async function setStatus(brunch: BrunchId, code: string): Promise<void> {
  const status = await db.brunchStatus.findFirstOrThrow({ where: { code } });
  await db.brunch.update({ where: { id: brunch }, data: { statusId: status.id } });
}

async function rowsFor(userId: UserId, brunch: BrunchId) {
  return db.notification.findMany({
    where: { userId, brunchId: brunch },
    include: { notificationType: true },
    orderBy: { createdAt: 'asc' },
  });
}

beforeAll(async () => {
  hostId = await makeUser('host');
  mayaId = await makeUser('maya');
  samId = await makeUser('sam');
  noId = await makeUser('no');
  mutedId = await makeUser('muted');
  bigId = await makeUser('big');
  outsiderId = await makeUser('outsider');

  brunchId = await newBrunch('Producer brunch');
  await setStatus(brunchId, 'active');
  await addMember({ brunch: brunchId, userId: mayaId, rsvp: 'yes' });
  await addMember({ brunch: brunchId, userId: samId, rsvp: 'maybe' });
  await addMember({ brunch: brunchId, userId: noId, rsvp: 'no' });
  await addMember({ brunch: brunchId, userId: mutedId, rsvp: 'yes', level: 'muted' });
  await addMember({ brunch: brunchId, userId: bigId, rsvp: 'yes', level: 'big_stuff' });
});

afterAll(async () => {
  await db.notification.deleteMany({ where: { userId: { in: userIds } } });
  await db.brunchLocationSuggestion.deleteMany({ where: { brunchId: { in: brunchIds } } });
  await db.brunchTimeSuggestion.deleteMany({ where: { brunchId: { in: brunchIds } } });
  await db.brunchInviteSuggestion.deleteMany({ where: { brunchId: { in: brunchIds } } });
  await db.brunchLocation.deleteMany({ where: { brunchId: { in: brunchIds } } });
  await db.brunchTime.deleteMany({ where: { brunchId: { in: brunchIds } } });
  await db.brunchAttendee.deleteMany({ where: { brunchId: { in: brunchIds } } });
  await db.brunchInvite.deleteMany({ where: { brunchId: { in: brunchIds } } });
  await db.brunch.deleteMany({ where: { id: { in: brunchIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
});

describe('replies and votes tell the host, once per person, and never the actor', () => {
  it('counts replies and votes separately, by person', async () => {
    (await notifyHostOfReply({ brunchId, actorId: mayaId }, { db }))._unsafeUnwrap();
    (await notifyHostOfReply({ brunchId, actorId: mayaId }, { db }))._unsafeUnwrap();
    (await notifyHostOfReply({ brunchId, actorId: samId }, { db }))._unsafeUnwrap();
    (await notifyHostOfVote({ brunchId, actorId: mayaId }, { db }))._unsafeUnwrap();

    const rows = await rowsFor(hostId, brunchId);
    const replies = rows.find((row) => row.notificationType.code === 'rsvp.received');
    const votes = rows.find((row) => row.notificationType.code === 'vote.cast');
    expect(replies?.data).toMatchObject({ kind: 'rsvp.received', count: 2 });
    expect(votes?.data).toMatchObject({ kind: 'vote.cast', count: 1 });
    expect(rows.filter((row) => row.notificationType.code === 'rsvp.received')).toHaveLength(1);
  });

  it("writes nothing for the host's own action, for a member, or for a made-up brunch", async () => {
    const before = await db.notification.count({ where: { brunchId } });

    const own = await notifyHostOfReply({ brunchId, actorId: hostId }, { db });
    const made = await notifyHostOfVote(
      { brunchId: '0b7e1c9e-0000-4000-8000-000000000000' as BrunchId, actorId: mayaId },
      { db },
    );

    expect(own._unsafeUnwrap().written).toBe(0);
    expect(made._unsafeUnwrap().written).toBe(0);
    expect(await db.notification.count({ where: { brunchId } })).toBe(before);
    expect(await rowsFor(mayaId, brunchId)).toHaveLength(0);
  });

  it('writes nothing for a host who muted the brunch', async () => {
    const mutedBrunch = await newBrunch('Muted by host');
    const muted = await db.notificationLevel.findUniqueOrThrow({ where: { code: 'muted' } });
    await db.brunchAttendee.updateMany({
      where: { brunchId: mutedBrunch, userId: hostId },
      data: { notificationLevelId: muted.id },
    });

    (await notifyHostOfReply({ brunchId: mutedBrunch, actorId: mayaId }, { db }))._unsafeUnwrap();

    expect(await rowsFor(hostId, mutedBrunch)).toHaveLength(0);
  });
});

describe('a suggestion tells the host while it waits', () => {
  it('writes one row with the suggester and the place, once however often it runs', async () => {
    const result = await suggestLocation(
      {
        brunchId,
        suggestedById: mayaId,
        location: {
          placeId: `suggested-${RUN_ID}`,
          placeName: 'Zuni Cafe',
          placeAddress: '1658 Market St',
          placeUrl: 'https://maps.example.com/zuni',
          timezone: 'America/Los_Angeles',
        },
      },
      { db, eventBus },
    );
    const suggestionId = result._unsafeUnwrap().suggestionId;

    (await notifyHostOfSuggestion({ kind: 'location', suggestionId }, { db }))._unsafeUnwrap();
    (await notifyHostOfSuggestion({ kind: 'location', suggestionId }, { db }))._unsafeUnwrap();

    const rows = (await rowsFor(hostId, brunchId)).filter(
      (row) => row.notificationType.code === 'location.suggested',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.data).toEqual({
      kind: 'location.suggested',
      suggesterName: 'Producer maya',
      placeName: 'Zuni Cafe',
    });
  });

  it('tells the host about a suggested time and a suggested invitee, each once', async () => {
    const time = await suggestTime(
      { brunchId, suggestedById: samId, scheduledAt: '2026-12-20T18:00:00.000Z' },
      { db, eventBus },
    );
    const invitee = await suggestInvitee(
      { brunchId, suggestedById: mayaId, email: email('suggested-invitee') },
      { db, eventBus, rateLimiter: new InMemoryRateLimiter() },
    );
    const timeId = time._unsafeUnwrap().suggestionId;
    const inviteeId = invitee._unsafeUnwrap().suggestionId;

    for (let run = 0; run < 2; run += 1) {
      (
        await notifyHostOfSuggestion({ kind: 'time', suggestionId: timeId }, { db })
      )._unsafeUnwrap();
      (
        await notifyHostOfSuggestion({ kind: 'invite', suggestionId: inviteeId }, { db })
      )._unsafeUnwrap();
    }

    const rows = await rowsFor(hostId, brunchId);
    const byType = (code: string) => rows.filter((row) => row.notificationType.code === code);
    expect(byType('time.suggested')).toHaveLength(1);
    expect(byType('time.suggested')[0]?.data).toEqual({
      kind: 'time.suggested',
      suggesterName: 'Producer sam',
    });
    expect(byType('invite.suggestion')).toHaveLength(1);
    expect(byType('invite.suggestion')[0]?.data).toEqual({
      kind: 'invite.suggestion',
      suggesterName: 'Producer maya',
    });
  });

  it('writes nothing once the host has already decided', async () => {
    const result = await suggestLocation(
      {
        brunchId,
        suggestedById: samId,
        location: {
          placeId: `decided-${RUN_ID}`,
          placeName: 'Decided Cafe',
          placeAddress: '2 Main St',
          placeUrl: 'https://maps.example.com/decided',
          timezone: 'America/Los_Angeles',
        },
      },
      { db, eventBus },
    );
    const suggestionId = result._unsafeUnwrap().suggestionId;
    const declined = await db.brunchOptionSuggestionStatus.findFirstOrThrow({
      where: { code: 'declined' },
    });
    await db.brunchLocationSuggestion.update({
      where: { id: suggestionId },
      data: { statusId: declined.id },
    });

    const outcome = await notifyHostOfSuggestion({ kind: 'location', suggestionId }, { db });

    expect(outcome._unsafeUnwrap().written).toBe(0);
  });
});

describe('the brunch changing tells the members', () => {
  it('tells everyone but the host and the person who said no that it is on, once', async () => {
    const confirmed = await newBrunch('Confirmed brunch');
    for (const [userId, rsvp, level] of [
      [mayaId, 'yes', undefined],
      [samId, 'maybe', undefined],
      [noId, 'no', undefined],
      [mutedId, 'yes', 'muted'],
      [bigId, 'yes', 'big_stuff'],
    ] as const) {
      await addMember({ brunch: confirmed, userId, rsvp, ...(level ? { level } : {}) });
    }
    await db.brunchLocation.updateMany({
      where: { brunchId: confirmed },
      data: { isConfirmed: true, confirmedAt: new Date() },
    });
    await db.brunchTime.updateMany({
      where: { brunchId: confirmed },
      data: { isConfirmed: true, confirmedAt: new Date() },
    });
    await setStatus(confirmed, 'confirmed');

    (await notifyBrunchConfirmed({ brunchId: confirmed }, { db }))._unsafeUnwrap();
    (await notifyBrunchConfirmed({ brunchId: confirmed }, { db }))._unsafeUnwrap();

    expect(await rowsFor(mayaId, confirmed)).toHaveLength(1);
    expect(await rowsFor(samId, confirmed)).toHaveLength(1);
    expect(await rowsFor(bigId, confirmed)).toHaveLength(1); // "just big stuff" keeps this
    expect(await rowsFor(hostId, confirmed)).toHaveLength(0);
    expect(await rowsFor(noId, confirmed)).toHaveLength(0);
    expect(await rowsFor(mutedId, confirmed)).toHaveLength(0);
    expect(await rowsFor(outsiderId, confirmed)).toHaveLength(0);

    const [row] = await rowsFor(mayaId, confirmed);
    expect(row?.data).toEqual({
      kind: 'brunch.confirmed',
      hostName: 'Producer H.',
      placeName: 'Tartine',
      scheduledAt: '2026-12-06T18:00:00.000Z',
      timezone: 'America/Los_Angeles',
    });
  });

  it('says nothing for a confirmation that has since been called off', async () => {
    const gone = await newBrunch('Confirmed then called off');
    await addMember({ brunch: gone, userId: mayaId, rsvp: 'yes' });
    await db.brunchLocation.updateMany({
      where: { brunchId: gone },
      data: { isConfirmed: true },
    });
    await db.brunchTime.updateMany({ where: { brunchId: gone }, data: { isConfirmed: true } });
    await setStatus(gone, 'cancelled');

    const outcome = await notifyBrunchConfirmed({ brunchId: gone }, { db });

    expect(outcome._unsafeUnwrap().written).toBe(0);
  });

  it('writes the called-off and back-on rows once per cancellation, and a new one for the next', async () => {
    const off = await newBrunch('Called off brunch');
    await addMember({ brunch: off, userId: mayaId, rsvp: 'yes' });
    await addMember({ brunch: off, userId: noId, rsvp: 'no' });
    const first = new Date('2026-10-25T10:00:00.000Z');
    const second = new Date('2026-10-25T11:00:00.000Z');

    (await notifyBrunchCancelled({ brunchId: off, cancelledAt: first }, { db }))._unsafeUnwrap();
    (await notifyBrunchCancelled({ brunchId: off, cancelledAt: first }, { db }))._unsafeUnwrap();
    (await notifyBrunchReinstated({ brunchId: off, cancelledAt: first }, { db }))._unsafeUnwrap();
    (await notifyBrunchCancelled({ brunchId: off, cancelledAt: second }, { db }))._unsafeUnwrap();

    const rows = await rowsFor(mayaId, off);
    expect(rows.map((row) => row.notificationType.code)).toEqual([
      'brunch.cancelled',
      'brunch.reinstated',
      'brunch.cancelled',
    ]);
    expect(await rowsFor(noId, off)).toHaveLength(0);
    expect(await rowsFor(hostId, off)).toHaveLength(0);
  });
});

describe('an invitation tells a person who already has an account', () => {
  async function invite(params: {
    readonly brunch: BrunchId;
    readonly userId?: UserId;
    readonly address: string;
    readonly expiresInMs?: number;
  }): Promise<InviteId> {
    const created = await db.brunchInvite.create({
      data: {
        brunchId: params.brunch,
        invitedUserId: params.userId ?? null,
        invitedEmail: normalizeEmail(params.address),
        invitedById: hostId,
        token: `tok-invite-${RUN_ID}-${params.address}`,
        tokenExpiresAt: new Date(Date.now() + (params.expiresInMs ?? 86_400_000)),
      },
    });
    return created.id as InviteId;
  }

  it('writes one row carrying the invite id, never the token, once however often it runs', async () => {
    const invited = await newBrunch('Invitation brunch');
    // As the app leaves it: a person with an account is a member at once, with the answer "invited".
    const inviteId = await addMember({ brunch: invited, userId: outsiderId, rsvp: 'invited' });

    (await notifyInvited({ inviteId }, { db }))._unsafeUnwrap();
    (await notifyInvited({ inviteId }, { db }))._unsafeUnwrap();

    const rows = await rowsFor(outsiderId, invited);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.data).toEqual({
      kind: 'invite.received',
      hostName: 'Producer H.',
      inviteId,
    });
    expect(JSON.stringify(rows[0])).not.toContain('tok-invite');
  });

  it('finds an account by the invited address when the invite has no user yet', async () => {
    const invited = await newBrunch('Invitation by address');
    const inviteId = await invite({ brunch: invited, address: email('sam') });
    // The invite was made for an address that matches samId's account.
    await db.brunchInvite.update({
      where: { id: inviteId },
      data: { invitedEmail: email('sam') },
    });

    (await notifyInvited({ inviteId }, { db }))._unsafeUnwrap();

    expect(await rowsFor(samId, invited)).toHaveLength(1);
  });

  it('writes nothing for an address with no account, an expired or accepted invite, or a muted level', async () => {
    const invited = await newBrunch('Nothing to write');
    const stranger = await invite({ brunch: invited, address: email('nobody') });
    const expired = await invite({
      brunch: invited,
      userId: mayaId,
      address: email('expired'),
      expiresInMs: -1000,
    });
    const accepted = await addMember({ brunch: invited, userId: bigId, rsvp: 'yes' });

    for (const inviteId of [stranger, expired, accepted]) {
      expect((await notifyInvited({ inviteId }, { db }))._unsafeUnwrap().written).toBe(0);
    }
    expect(await rowsFor(mayaId, invited)).toHaveLength(0);
    expect(await rowsFor(bigId, invited)).toHaveLength(0);
  });
});
