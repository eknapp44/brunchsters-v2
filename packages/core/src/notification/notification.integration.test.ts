import { createDb } from '@brunchsters/database';
import {
  NOTIFICATION_LEVEL_CODES,
  NOTIFICATION_TYPE_CODES,
  normalizeEmail,
  type BrunchId,
  type UserId,
} from '@brunchsters/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NoopEventBus } from '../events/NoopEventBus';
import { createBrunch } from '../brunch/createBrunch';
import { coalesceNotification } from './coalesceNotification';
import { countUnread } from './countUnread';
import { listNotifications } from './listNotifications';
import { markAllRead, markRead } from './markRead';
import { shouldDeliver } from './shouldDeliver';
import { writeNotification } from './writeNotification';

// The notification core against the real database (spec 0015 M1). Requires: supabase start and the
// seeded lookup tables (pnpm db:seed), which the migration's level rows and the seed script share.
const RUN_ID = Date.now();
const HOST_EMAIL = normalizeEmail(`integration-notif-host-${RUN_ID}@example.com`);
const OTHER_EMAIL = normalizeEmail(`integration-notif-other-${RUN_ID}@example.com`);
const MAYA_EMAIL = normalizeEmail(`integration-notif-maya-${RUN_ID}@example.com`);
const SAM_EMAIL = normalizeEmail(`integration-notif-sam-${RUN_ID}@example.com`);

const db = createDb();

let hostId: UserId;
let otherId: UserId;
let mayaId: UserId;
let samId: UserId;
let brunchId: BrunchId;
let secondBrunchId: BrunchId;

async function rowsFor(userId: UserId) {
  return db.notification.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
}

beforeAll(async () => {
  const users = await Promise.all(
    [
      ['Notif Host', HOST_EMAIL],
      ['Notif Other', OTHER_EMAIL],
      ['Notif Maya', MAYA_EMAIL],
      ['Notif Sam', SAM_EMAIL],
    ].map(([name, email]) => db.user.create({ data: { name: name ?? '', email: email ?? '' } })),
  );
  [hostId, otherId, mayaId, samId] = users.map((user) => user.id as UserId) as [
    UserId,
    UserId,
    UserId,
    UserId,
  ];
  const eventBus = new NoopEventBus();
  const first = await createBrunch(
    { title: 'Notification brunch', locations: [], times: [], hostId },
    { db, eventBus },
  );
  brunchId = first._unsafeUnwrap().id as BrunchId;
  const second = await createBrunch(
    { title: 'Second notification brunch', locations: [], times: [], hostId },
    { db, eventBus },
  );
  secondBrunchId = second._unsafeUnwrap().id as BrunchId;
});

afterAll(async () => {
  const userIds = [hostId, otherId, mayaId, samId];
  await db.userNotificationPreference.deleteMany({ where: { userId: { in: userIds } } });
  await db.notification.deleteMany({ where: { userId: { in: userIds } } });
  await db.brunchAttendee.deleteMany({ where: { brunchId: { in: [brunchId, secondBrunchId] } } });
  await db.brunchInvite.deleteMany({ where: { brunchId: { in: [brunchId, secondBrunchId] } } });
  await db.brunch.deleteMany({ where: { id: { in: [brunchId, secondBrunchId] } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
});

describe('the seeded vocabulary', () => {
  it('has a notification type row for every code in the shared list, and no others', async () => {
    const rows = await db.notificationType.findMany();
    expect(rows.map((row) => row.code).sort()).toEqual([...NOTIFICATION_TYPE_CODES].sort());
  });

  it('has the three levels, and an attendee starts at "all" through the column default', async () => {
    const levels = await db.notificationLevel.findMany();
    expect(levels.map((level) => level.code).sort()).toEqual([...NOTIFICATION_LEVEL_CODES].sort());

    const host = await db.brunchAttendee.findFirstOrThrow({
      where: { brunchId, userId: hostId },
      include: { notificationLevel: true },
    });
    expect(host.notificationLevel.code).toBe('all');
  });
});

describe('writeNotification', () => {
  it('writes one in-app row, and a replay with the same key changes nothing', async () => {
    const input = {
      userId: hostId,
      type: 'invite.email.failed' as const,
      brunchId,
      title: 'Your invite did not go through',
      body: 'Have a look at your invites.',
      data: { kind: 'invite.email.failed' as const, email: 'x@example.com' },
      dedupeKey: `email-failed:${RUN_ID}:1`,
    };

    const first = await writeNotification(input, { db });
    await markRead({ userId: hostId, ids: [first._unsafeUnwrap().id] }, { db });
    const replay = await writeNotification({ ...input, title: 'Changed' }, { db });

    expect(first._unsafeUnwrap().created).toBe(true);
    expect(replay._unsafeUnwrap()).toEqual({ id: first._unsafeUnwrap().id, created: false });
    const rows = await db.notification.findMany({
      where: { userId: hostId, dedupeKey: input.dedupeKey },
      include: { channel: true },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.channel.code).toBe('in_app');
    expect(rows[0]?.title).toBe('Your invite did not go through');
    // Already read: a replay must not make the person read it again.
    expect(rows[0]?.readAt).not.toBeNull();
  });

  it('keeps the same key for two different people as two rows', async () => {
    const base = {
      type: 'invite.received' as const,
      title: 'Invited',
      body: 'Come to brunch',
      data: { kind: 'invite.received' as const, hostName: 'Notif Host', inviteId: 'invite-1' },
      dedupeKey: `invite-received:${RUN_ID}`,
    };
    await writeNotification({ ...base, userId: mayaId }, { db });
    await writeNotification({ ...base, userId: samId }, { db });

    expect(await rowsFor(mayaId)).toHaveLength(1);
    expect(await rowsFor(samId)).toHaveLength(1);
  });

  it('writes once when the same row is written twice at the same moment', async () => {
    const input = {
      userId: otherId,
      type: 'brunch.confirmed' as const,
      brunchId,
      title: 'On',
      body: 'On',
      data: {
        kind: 'brunch.confirmed' as const,
        hostName: 'Notif Host',
        placeName: 'Tartine',
        scheduledAt: '2026-11-01T17:00:00.000Z',
        timezone: 'America/Los_Angeles',
      },
      dedupeKey: `confirmed:${RUN_ID}`,
    };

    const results = await Promise.all([
      writeNotification(input, { db }),
      writeNotification(input, { db }),
    ]);

    expect(results.filter((result) => result._unsafeUnwrap().created)).toHaveLength(1);
    expect(await db.notification.count({ where: { userId: otherId } })).toBe(1);
  });
});

describe('coalesceNotification', () => {
  const base = () => ({
    userId: hostId,
    type: 'vote.cast' as const,
    brunchId,
    title: 'New votes',
    body: 'People voted',
  });

  async function voteRow() {
    return db.notification.findFirstOrThrow({
      where: { userId: hostId, dedupeKey: `coalesced:vote.cast:${brunchId}` },
    });
  }

  it('walks the whole life of a row: new, another person, the same person, read, again', async () => {
    const t0 = new Date('2026-10-25T10:00:00.000Z');
    const t1 = new Date('2026-10-25T10:05:00.000Z');
    const t2 = new Date('2026-10-25T10:10:00.000Z');
    const t3 = new Date('2026-10-25T10:15:00.000Z');

    (await coalesceNotification({ ...base(), actorId: mayaId, now: t0 }, { db }))._unsafeUnwrap();
    expect((await voteRow()).data).toEqual({ kind: 'vote.cast', count: 1, actors: [mayaId] });

    // A new person raises the count and moves the row up.
    (await coalesceNotification({ ...base(), actorId: samId, now: t1 }, { db }))._unsafeUnwrap();
    let row = await voteRow();
    expect(row.data).toEqual({ kind: 'vote.cast', count: 2, actors: [mayaId, samId] });
    expect(row.lastEventAt).toEqual(t1);

    // The same person again (a changed vote) is not news: nothing moves.
    (await coalesceNotification({ ...base(), actorId: mayaId, now: t2 }, { db }))._unsafeUnwrap();
    row = await voteRow();
    expect(row.data).toEqual({ kind: 'vote.cast', count: 2, actors: [mayaId, samId] });
    expect(row.lastEventAt).toEqual(t1);

    // Once the host reads it, the next vote starts a new count and makes it unread again.
    await markRead({ userId: hostId, ids: [row.id] }, { db });
    expect((await voteRow()).readAt).not.toBeNull();
    (await coalesceNotification({ ...base(), actorId: samId, now: t3 }, { db }))._unsafeUnwrap();
    row = await voteRow();
    expect(row.data).toEqual({ kind: 'vote.cast', count: 1, actors: [samId] });
    expect(row.readAt).toBeNull();
    expect(row.lastEventAt).toEqual(t3);
  });

  it('counts two people landing at the same moment as two', async () => {
    const key = `coalesced:rsvp.received:${secondBrunchId}`;
    const rsvp = (actorId: UserId) =>
      coalesceNotification(
        {
          userId: hostId,
          type: 'rsvp.received',
          brunchId: secondBrunchId,
          actorId,
          title: 'New replies',
          body: 'People replied',
        },
        { db },
      );

    const results = await Promise.all([rsvp(mayaId), rsvp(samId)]);
    for (const result of results) result._unsafeUnwrap();

    const row = await db.notification.findFirstOrThrow({
      where: { userId: hostId, dedupeKey: key },
    });
    expect(row.data).toMatchObject({ kind: 'rsvp.received', count: 2 });
  });
});

describe('markRead, markAllRead, countUnread and listNotifications', () => {
  it("touch only the signed-in person's rows, and answer an id that is not theirs like a made-up one", async () => {
    const mine = await writeNotification(
      {
        userId: mayaId,
        type: 'brunch.cancelled',
        brunchId,
        title: 'Called off',
        body: 'Called off',
        data: { kind: 'brunch.cancelled', hostName: 'Notif Host' },
        dedupeKey: `cancelled:${RUN_ID}`,
      },
      { db },
    );
    const theirs = await writeNotification(
      {
        userId: samId,
        type: 'brunch.cancelled',
        brunchId,
        title: 'Called off',
        body: 'Called off',
        data: { kind: 'brunch.cancelled', hostName: 'Notif Host' },
        dedupeKey: `cancelled:${RUN_ID}`,
      },
      { db },
    );
    const sams = theirs._unsafeUnwrap().id;

    const foreign = await markRead({ userId: mayaId, ids: [sams] }, { db });
    const madeUp = await markRead(
      { userId: mayaId, ids: ['0b7e1c9e-0000-4000-8000-000000000000', 'not-a-uuid'] },
      { db },
    );

    expect(foreign._unsafeUnwrap()).toEqual({ marked: 0 });
    expect(madeUp._unsafeUnwrap()).toEqual({ marked: 0 });
    const samStill = await db.notification.findFirstOrThrow({ where: { id: sams } });
    expect(samStill.readAt).toBeNull();

    expect(
      (await markRead({ userId: mayaId, ids: [mine._unsafeUnwrap().id] }, { db }))._unsafeUnwrap(),
    ).toEqual({ marked: 1 });
  });

  it("counts, lists and clears only what is the person's, newest change first", async () => {
    const earlier = new Date('2026-10-25T08:00:00.000Z');
    const later = new Date('2026-10-25T09:00:00.000Z');
    for (const [key, at] of [
      ['a', earlier],
      ['b', later],
    ] as const) {
      await writeNotification(
        {
          userId: otherId,
          type: 'brunch.reinstated',
          brunchId: secondBrunchId,
          title: `Back on ${key}`,
          body: 'Back on',
          data: { kind: 'brunch.reinstated', hostName: 'Notif Host' },
          dedupeKey: `list:${RUN_ID}:${key}`,
          now: at,
        },
        { db },
      );
    }

    const listed = (await listNotifications({ userId: otherId }, { db }))._unsafeUnwrap();
    const reinstated = listed.filter((item) => item.type === 'brunch.reinstated');
    expect(reinstated.map((item) => item.title)).toEqual(['Back on b', 'Back on a']);
    expect(reinstated[0]?.brunchTitle).toBe('Second notification brunch');

    const unreadBefore = (await countUnread({ userId: otherId }, { db }))._unsafeUnwrap();
    expect(unreadBefore).toBe(3);

    const cleared = (await markAllRead({ userId: otherId }, { db }))._unsafeUnwrap();
    expect(cleared.marked).toBe(3);
    expect((await countUnread({ userId: otherId }, { db }))._unsafeUnwrap()).toBe(0);
    // Everyone else's rows are untouched.
    expect((await countUnread({ userId: hostId }, { db }))._unsafeUnwrap()).toBeGreaterThan(0);
  });

  it('does not move a row up the inbox when it is read', async () => {
    const at = new Date('2026-10-20T08:00:00.000Z');
    const written = await writeNotification(
      {
        userId: otherId,
        type: 'brunch.reinstated',
        brunchId: secondBrunchId,
        title: 'Old news',
        body: 'Old news',
        data: { kind: 'brunch.reinstated', hostName: 'Notif Host' },
        dedupeKey: `read-keeps-place:${RUN_ID}`,
        now: at,
      },
      { db },
    );
    const id = written._unsafeUnwrap().id;

    await markRead({ userId: otherId, ids: [id] }, { db });

    const row = await db.notification.findFirstOrThrow({ where: { id } });
    expect(row.readAt).not.toBeNull();
    expect(row.lastEventAt).toEqual(at);
  });

  it("pages by the last row's change time", async () => {
    const all = (await listNotifications({ userId: otherId }, { db }))._unsafeUnwrap();
    const firstPage = (
      await listNotifications({ userId: otherId, limit: 1 }, { db })
    )._unsafeUnwrap();
    const next = (
      await listNotifications(
        { userId: otherId, limit: 5, before: firstPage[0]?.lastEventAt ?? new Date() },
        { db },
      )
    )._unsafeUnwrap();

    expect(firstPage).toHaveLength(1);
    expect(next.map((item) => item.id)).toEqual(all.slice(1).map((item) => item.id));
  });

  it('leaves out, and does not count, a row about a deleted brunch, and a row it cannot read', async () => {
    const doomed = await createBrunch(
      { title: 'Doomed brunch', locations: [], times: [], hostId },
      { db, eventBus: new NoopEventBus() },
    );
    const doomedId = doomed._unsafeUnwrap().id as BrunchId;
    await writeNotification(
      {
        userId: samId,
        type: 'brunch.confirmed',
        brunchId: doomedId,
        title: 'Doomed on',
        body: 'On',
        data: {
          kind: 'brunch.confirmed',
          hostName: 'Notif Host',
          placeName: 'Tartine',
          scheduledAt: '2026-11-01T17:00:00.000Z',
          timezone: 'UTC',
        },
        dedupeKey: `doomed:${RUN_ID}`,
      },
      { db },
    );
    const type = await db.notificationType.findUniqueOrThrow({ where: { code: 'vote.cast' } });
    const channel = await db.notificationChannel.findUniqueOrThrow({ where: { code: 'in_app' } });
    await db.notification.create({
      data: {
        userId: samId,
        notificationTypeId: type.id,
        channelId: channel.id,
        title: 'Broken',
        body: 'Broken',
        data: { kind: 'vote.cast', count: 'many' },
        dedupeKey: `broken:${RUN_ID}`,
        sentAt: new Date(),
      },
    });

    const before = (await listNotifications({ userId: samId }, { db }))._unsafeUnwrap();
    expect(before.some((item) => item.title === 'Doomed on')).toBe(true);
    expect(before.some((item) => item.title === 'Broken')).toBe(false);

    await db.brunch.update({ where: { id: doomedId }, data: { deletedAt: new Date() } });

    const after = (await listNotifications({ userId: samId }, { db }))._unsafeUnwrap();
    expect(after.some((item) => item.title === 'Doomed on')).toBe(false);

    await db.notification.deleteMany({ where: { brunchId: doomedId } });
    await db.brunchAttendee.deleteMany({ where: { brunchId: doomedId } });
    await db.brunchInvite.deleteMany({ where: { brunchId: doomedId } });
    await db.brunch.deleteMany({ where: { id: doomedId } });
  });
});

describe('shouldDeliver against the database', () => {
  async function addMember(userId: UserId, levelCode?: string) {
    const yes = await db.rsvpStatus.findFirstOrThrow({ where: { code: 'yes' } });
    const invite = await db.brunchInvite.create({
      data: {
        brunchId,
        invitedUserId: userId,
        invitedEmail: normalizeEmail(`member-${userId}@example.com`),
        invitedById: hostId,
        token: `tok-${RUN_ID}-${userId}`,
        tokenExpiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const level =
      levelCode === undefined
        ? undefined
        : await db.notificationLevel.findUniqueOrThrow({ where: { code: levelCode } });
    return db.brunchAttendee.create({
      data: {
        brunchId,
        userId,
        inviteId: invite.id,
        rsvpStatusId: yes.id,
        ...(level === undefined ? {} : { notificationLevelId: level.id }),
      },
    });
  }

  it('honors a muted brunch, a saved switch and the default, per person', async () => {
    await addMember(mayaId, 'muted');
    await addMember(samId);

    const input = (userId: UserId) => ({
      userId,
      type: 'brunch.confirmed' as const,
      channel: 'email' as const,
      brunchId,
    });
    expect((await shouldDeliver(input(mayaId), { db }))._unsafeUnwrap()).toBe(false);
    expect((await shouldDeliver(input(samId), { db }))._unsafeUnwrap()).toBe(true);

    const type = await db.notificationType.findUniqueOrThrow({
      where: { code: 'brunch.confirmed' },
    });
    const email = await db.notificationChannel.findUniqueOrThrow({ where: { code: 'email' } });
    await db.userNotificationPreference.create({
      data: { userId: samId, notificationTypeId: type.id, channelId: email.id, isEnabled: false },
    });
    expect((await shouldDeliver(input(samId), { db }))._unsafeUnwrap()).toBe(false);
    // The in-app channel was never switched off, so only the email is silent.
    expect(
      (await shouldDeliver({ ...input(samId), channel: 'in_app' }, { db }))._unsafeUnwrap(),
    ).toBe(true);
  });
});
