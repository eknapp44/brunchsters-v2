import { createDb } from '@brunchsters/database';
import { normalizeEmail, type BrunchId, type UserId } from '@brunchsters/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createBrunch } from '../brunch/createBrunch';
import { MockEmailService } from '../email/MockEmailService';
import { NoopEventBus } from '../events/NoopEventBus';
import { claimDeadlineReminders, completePastBrunches, pruneNotifications } from './scheduler';
import { sendDeadlineReminder } from './sendDeadlineReminder';

// The clock's jobs (spec 0015 M7) against the real database, each told what time it is. Requires:
// supabase start and the seeded lookup tables (pnpm db:seed).
const RUN_ID = Date.now();
const email = (name: string) => normalizeEmail(`integration-clock-${name}-${RUN_ID}@example.com`);
const APP_URL = 'https://app.example.com';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const db = createDb();
const NOW = new Date('2026-11-10T12:00:00.000Z');
const at = (offsetMs: number): Date => new Date(NOW.getTime() + offsetMs);

let hostId: UserId;
const userIds: UserId[] = [];
const brunchIds: BrunchId[] = [];

async function makeUser(name: string): Promise<UserId> {
  const user = await db.user.create({ data: { name: `Clock ${name}`, email: email(name) } });
  userIds.push(user.id as UserId);
  return user.id as UserId;
}

async function status(code: string) {
  return db.brunchStatus.findFirstOrThrow({ where: { code } });
}

// A brunch in the given status; `time` adds a confirmed time at that offset from NOW, `deadline`
// sets the voting deadline and when it was set.
async function newBrunch(params: {
  readonly title: string;
  readonly statusCode: string;
  readonly time?: number;
  readonly deadline?: { readonly in: number; readonly setAgo: number | null };
}): Promise<BrunchId> {
  const created = await createBrunch(
    { title: params.title, hostId, locations: [], times: [] },
    { db, eventBus: new NoopEventBus() },
  );
  const id = created._unsafeUnwrap().id as BrunchId;
  brunchIds.push(id);
  await db.brunch.update({
    where: { id },
    data: {
      statusId: (await status(params.statusCode)).id,
      ...(params.deadline === undefined
        ? {}
        : {
            votingDeadline: at(params.deadline.in),
            votingDeadlineSetAt:
              params.deadline.setAgo === null ? null : at(-params.deadline.setAgo),
          }),
    },
  });
  if (params.time !== undefined) {
    await db.brunchTime.create({
      data: {
        brunchId: id,
        scheduledAt: at(params.time),
        isConfirmed: true,
        confirmedAt: at(-DAY),
        proposedById: hostId,
      },
    });
  }
  return id;
}

async function statusOf(id: BrunchId): Promise<string> {
  const brunch = await db.brunch.findFirstOrThrow({ where: { id }, include: { status: true } });
  return brunch.status.code;
}

async function addMember(params: {
  readonly brunch: BrunchId;
  readonly userId: UserId;
  readonly name: string;
  readonly rsvp: 'yes' | 'maybe' | 'no' | 'invited';
  readonly voted?: boolean;
}): Promise<void> {
  const rsvp = await db.rsvpStatus.findFirstOrThrow({ where: { code: params.rsvp } });
  const invite = await db.brunchInvite.create({
    data: {
      brunchId: params.brunch,
      invitedUserId: params.userId,
      invitedEmail: email(params.name),
      invitedById: hostId,
      token: `tok-clock-${RUN_ID}-${params.name}-${params.brunch}`,
      tokenExpiresAt: new Date(Date.now() + DAY),
    },
  });
  await db.brunchAttendee.create({
    data: {
      brunchId: params.brunch,
      userId: params.userId,
      inviteId: invite.id,
      rsvpStatusId: rsvp.id,
    },
  });
  if (params.voted === true) {
    const time = await db.brunchTime.create({
      data: { brunchId: params.brunch, scheduledAt: at(3 * DAY), proposedById: hostId },
    });
    await db.brunchTimeVote.create({ data: { brunchTimeId: time.id, userId: params.userId } });
  }
}

async function rowsFor(brunch: BrunchId, type = 'vote.deadline.approaching') {
  return db.notification.findMany({
    where: { brunchId: brunch, notificationType: { code: type } },
    include: { user: true },
  });
}

beforeAll(async () => {
  hostId = await makeUser('host');
});

afterAll(async () => {
  await db.notification.deleteMany({ where: { userId: { in: userIds } } });
  await db.userNotificationPreference.deleteMany({ where: { userId: { in: userIds } } });
  await db.brunchTimeVote.deleteMany({ where: { brunchTime: { brunchId: { in: brunchIds } } } });
  await db.brunchTime.deleteMany({ where: { brunchId: { in: brunchIds } } });
  await db.brunchAttendee.deleteMany({ where: { brunchId: { in: brunchIds } } });
  await db.brunchInvite.deleteMany({ where: { brunchId: { in: brunchIds } } });
  await db.brunch.deleteMany({ where: { id: { in: brunchIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
});

describe('completePastBrunches', () => {
  it('completes a confirmed brunch six hours after its time, and not a minute before', async () => {
    const over = await newBrunch({
      title: 'Over',
      statusCode: 'confirmed',
      time: -6 * HOUR - 60_000,
    });
    const justOn = await newBrunch({
      title: 'Just on',
      statusCode: 'confirmed',
      time: -6 * HOUR + 60_000,
    });
    const ahead = await newBrunch({ title: 'Ahead', statusCode: 'confirmed', time: 2 * HOUR });

    const result = await completePastBrunches({ now: NOW, brunchId: over }, { db });
    expect(result._unsafeUnwrap().completed).toBe(1);
    expect(await statusOf(over)).toBe('completed');

    // Unscoped, as the clock runs it: nothing else of ours is due.
    await completePastBrunches({ now: NOW }, { db });
    expect(await statusOf(justOn)).toBe('confirmed');
    expect(await statusOf(ahead)).toBe('confirmed');

    // At the minute it crosses, it goes.
    await completePastBrunches({ now: at(2 * 60_000), brunchId: justOn }, { db });
    expect(await statusOf(justOn)).toBe('completed');
  });

  it('leaves a called-off or unconfirmed brunch alone, and a second run finds nothing', async () => {
    const calledOff = await newBrunch({ title: 'Called off', statusCode: 'cancelled', time: -DAY });
    const active = await newBrunch({ title: 'Still voting', statusCode: 'active' });

    const first = await completePastBrunches({ now: NOW, brunchId: calledOff }, { db });
    await completePastBrunches({ now: NOW, brunchId: active }, { db });
    expect(first._unsafeUnwrap().completed).toBe(0);
    expect(await statusOf(calledOff)).toBe('cancelled');
    expect(await statusOf(active)).toBe('active');

    const done = await newBrunch({ title: 'Done', statusCode: 'confirmed', time: -DAY });
    expect(
      (await completePastBrunches({ now: NOW, brunchId: done }, { db }))._unsafeUnwrap().completed,
    ).toBe(1);
    expect(
      (await completePastBrunches({ now: NOW, brunchId: done }, { db }))._unsafeUnwrap().completed,
    ).toBe(0);
  });

  it('tells nobody: the people who were there need no notice', async () => {
    const id = await newBrunch({ title: 'Quiet end', statusCode: 'confirmed', time: -DAY });
    const ann = await makeUser('quiet-ann');
    await addMember({ brunch: id, userId: ann, name: 'quiet-ann', rsvp: 'yes' });

    await completePastBrunches({ now: NOW, brunchId: id }, { db });

    expect(
      await db.notification.count({ where: { userId: { in: [ann, hostId] }, brunchId: id } }),
    ).toBe(0);
  });
});

describe('claimDeadlineReminders', () => {
  it('claims a deadline inside the next 24 hours once, however often the clock asks', async () => {
    const id = await newBrunch({
      title: 'Due',
      statusCode: 'active',
      deadline: { in: 5 * HOUR, setAgo: 3 * DAY },
    });

    const first = (
      await claimDeadlineReminders({ now: NOW, brunchId: id }, { db })
    )._unsafeUnwrap();
    const again = (
      await claimDeadlineReminders({ now: NOW, brunchId: id }, { db })
    )._unsafeUnwrap();
    const later = (
      await claimDeadlineReminders({ now: at(2 * HOUR), brunchId: id }, { db })
    )._unsafeUnwrap();

    expect(first).toEqual([{ brunchId: id, deadline: at(5 * HOUR) }]);
    expect(again).toEqual([]);
    expect(later).toEqual([]);
  });

  it('does two claims made at once hand out the deadline once', async () => {
    const id = await newBrunch({
      title: 'Racing clocks',
      statusCode: 'active',
      deadline: { in: 4 * HOUR, setAgo: 3 * DAY },
    });

    const [a, b] = await Promise.all([
      claimDeadlineReminders({ now: NOW, brunchId: id }, { db }),
      claimDeadlineReminders({ now: NOW, brunchId: id }, { db }),
    ]);

    expect(a._unsafeUnwrap().length + b._unsafeUnwrap().length).toBe(1);
  });

  it('skips what is not due: too far ahead, already past, closed early, not open, set just now', async () => {
    const cases = {
      tooFar: await newBrunch({
        title: 'Too far',
        statusCode: 'active',
        deadline: { in: 25 * HOUR, setAgo: 3 * DAY },
      }),
      past: await newBrunch({
        title: 'Past',
        statusCode: 'active',
        deadline: { in: -HOUR, setAgo: 3 * DAY },
      }),
      draft: await newBrunch({
        title: 'Draft',
        statusCode: 'draft',
        deadline: { in: 5 * HOUR, setAgo: 3 * DAY },
      }),
      justSet: await newBrunch({
        title: 'Just set',
        statusCode: 'active',
        deadline: { in: 5 * HOUR, setAgo: HOUR },
      }),
      closed: await newBrunch({
        title: 'Closed',
        statusCode: 'active',
        deadline: { in: 5 * HOUR, setAgo: 3 * DAY },
      }),
    };
    await db.brunch.update({ where: { id: cases.closed }, data: { votingClosedAt: at(-HOUR) } });

    for (const id of Object.values(cases)) {
      expect(
        (await claimDeadlineReminders({ now: NOW, brunchId: id }, { db }))._unsafeUnwrap(),
        `brunch ${id}`,
      ).toEqual([]);
    }
  });

  it('counts a deadline set 24 hours or more ahead as old news, and one with no record of when as old too', async () => {
    // Set exactly 24 hours before it closes: a full window, so it counts.
    const exactly = await newBrunch({
      title: 'Exactly a window',
      statusCode: 'active',
      deadline: { in: 6 * HOUR, setAgo: 18 * HOUR },
    });
    const legacy = await newBrunch({
      title: 'No record',
      statusCode: 'active',
      deadline: { in: 6 * HOUR, setAgo: null },
    });

    expect(
      (await claimDeadlineReminders({ now: NOW, brunchId: exactly }, { db }))._unsafeUnwrap(),
    ).toHaveLength(1);
    expect(
      (await claimDeadlineReminders({ now: NOW, brunchId: legacy }, { db }))._unsafeUnwrap(),
    ).toHaveLength(1);
  });

  it('reminds again for a moved deadline, and not for the old one', async () => {
    const id = await newBrunch({
      title: 'Moved',
      statusCode: 'active',
      deadline: { in: 5 * HOUR, setAgo: 3 * DAY },
    });
    expect(
      (await claimDeadlineReminders({ now: NOW, brunchId: id }, { db }))._unsafeUnwrap(),
    ).toHaveLength(1);

    // The host moves it to later, a day ahead of when they set it: a different deadline, set long
    // enough ago to count.
    await db.brunch.update({
      where: { id },
      data: { votingDeadline: at(10 * HOUR), votingDeadlineSetAt: at(-2 * DAY) },
    });

    expect(
      (await claimDeadlineReminders({ now: NOW, brunchId: id }, { db }))._unsafeUnwrap(),
    ).toEqual([{ brunchId: id, deadline: at(10 * HOUR) }]);
  });
});

let batch = 0;

describe('sendDeadlineReminder', () => {
  async function remindedBrunch(): Promise<{
    readonly id: BrunchId;
    readonly voter: UserId;
    readonly waiting: UserId;
    readonly maybe: UserId;
    readonly declined: UserId;
    readonly cannotVote: UserId;
    // The address of one of them, by the short name used here (each call has its own people).
    readonly address: (who: string) => string;
  }> {
    batch += 1;
    const tag = `remind${batch}`;
    const id = await newBrunch({
      title: 'Last call',
      statusCode: 'active',
      deadline: { in: 5 * HOUR, setAgo: 3 * DAY },
    });
    const voter = await makeUser(`${tag}-voter`);
    const waiting = await makeUser(`${tag}-waiting`);
    const maybe = await makeUser(`${tag}-maybe`);
    const declined = await makeUser(`${tag}-declined`);
    const cannotVote = await makeUser(`${tag}-cannot`);
    await addMember({ brunch: id, userId: voter, name: `${tag}-voter`, rsvp: 'yes', voted: true });
    await addMember({ brunch: id, userId: waiting, name: `${tag}-waiting`, rsvp: 'yes' });
    await addMember({ brunch: id, userId: maybe, name: `${tag}-maybe`, rsvp: 'maybe' });
    await addMember({ brunch: id, userId: declined, name: `${tag}-declined`, rsvp: 'no' });
    await addMember({ brunch: id, userId: cannotVote, name: `${tag}-cannot`, rsvp: 'invited' });
    return {
      id,
      voter,
      waiting,
      maybe,
      declined,
      cannotVote,
      address: (who) => email(`${tag}-${who}`),
    };
  }

  it('reminds the people who can vote and have not: a row and an email each, once', async () => {
    const { id, voter, waiting, maybe, declined, cannotVote, address } = await remindedBrunch();
    const emailService = new MockEmailService();
    const deadline = at(5 * HOUR);

    const first = await sendDeadlineReminder(
      { brunchId: id, deadline, now: NOW },
      { db, emailService, appUrl: APP_URL },
    );
    const second = await sendDeadlineReminder(
      { brunchId: id, deadline, now: NOW },
      { db, emailService, appUrl: APP_URL },
    );

    const rows = await rowsFor(id);
    const told = new Set(rows.map((row) => row.userId));
    expect(told.has(waiting)).toBe(true);
    expect(told.has(maybe)).toBe(true);
    // Not the one who voted, who said no, or who cannot vote (an invitation not yet answered).
    expect(told.has(voter)).toBe(false);
    expect(told.has(declined)).toBe(false);
    expect(told.has(cannotVote)).toBe(false);

    // A retried run writes no second row; the email carries the same key, so the provider drops it.
    expect(second._unsafeUnwrap().rows).toBe(0);
    expect(first._unsafeUnwrap().rows).toBe(rows.length);
    const waitingMail = emailService.sent.filter((mail) => mail.to === address('waiting'));
    expect(waitingMail).toHaveLength(2);
    expect(new Set(waitingMail.map((mail) => mail.idempotencyKey)).size).toBe(1);
    expect(waitingMail[0]?.subject).toBe('Last call closes soon — have you voted?');
    expect(waitingMail[0]?.html).toContain(`/brunch/${id}`);
    expect(waitingMail[0]?.html).toContain('about 5 hours');
    expect(emailService.sent.some((mail) => mail.to === address('voter'))).toBe(false);

    const row = rows.find((candidate) => candidate.userId === waiting);
    expect(row?.data).toEqual({
      kind: 'vote.deadline.approaching',
      deadline: deadline.toISOString(),
    });
  });

  it('obeys each person: email off still gives the row, in-app off still gives the email', async () => {
    const { id, waiting, maybe, address } = await remindedBrunch();
    const type = await db.notificationType.findUniqueOrThrow({
      where: { code: 'vote.deadline.approaching' },
    });
    const [email_, inApp] = await Promise.all([
      db.notificationChannel.findUniqueOrThrow({ where: { code: 'email' } }),
      db.notificationChannel.findUniqueOrThrow({ where: { code: 'in_app' } }),
    ]);
    await db.userNotificationPreference.create({
      data: {
        userId: waiting,
        notificationTypeId: type.id,
        channelId: email_.id,
        isEnabled: false,
      },
    });
    await db.userNotificationPreference.create({
      data: { userId: maybe, notificationTypeId: type.id, channelId: inApp.id, isEnabled: false },
    });
    const emailService = new MockEmailService();

    await sendDeadlineReminder(
      { brunchId: id, deadline: at(5 * HOUR), now: NOW },
      { db, emailService, appUrl: APP_URL },
    );

    const told = new Set((await rowsFor(id)).map((row) => row.userId));
    expect(told.has(waiting)).toBe(true);
    expect(told.has(maybe)).toBe(false);
    expect(emailService.sent.some((mail) => mail.to === address('waiting'))).toBe(false);
    expect(emailService.sent.some((mail) => mail.to === address('maybe'))).toBe(true);
  });

  it('says nothing for a brunch that is no longer open for voting', async () => {
    const { id } = await remindedBrunch();
    await db.brunch.update({ where: { id }, data: { statusId: (await status('cancelled')).id } });
    const emailService = new MockEmailService();

    const result = await sendDeadlineReminder(
      { brunchId: id, deadline: at(5 * HOUR), now: NOW },
      { db, emailService, appUrl: APP_URL },
    );

    expect(result._unsafeUnwrap()).toEqual({ rows: 0, emails: 0 });
    expect(emailService.sent).toHaveLength(0);
  });
});

describe('pruneNotifications', () => {
  async function seedRow(params: {
    readonly name: string;
    readonly readDaysAgo: number | undefined;
    readonly lastEventDaysAgo: number;
    readonly createdDaysAgo?: number;
  }): Promise<string> {
    const [type, channel] = await Promise.all([
      db.notificationType.findUniqueOrThrow({ where: { code: 'rsvp.received' } }),
      db.notificationChannel.findUniqueOrThrow({ where: { code: 'in_app' } }),
    ]);
    const row = await db.notification.create({
      data: {
        userId: hostId,
        notificationTypeId: type.id,
        channelId: channel.id,
        title: params.name,
        body: params.name,
        dedupeKey: `prune:${RUN_ID}:${params.name}`,
        sentAt: at(-params.lastEventDaysAgo * DAY),
        createdAt: at(-(params.createdDaysAgo ?? params.lastEventDaysAgo) * DAY),
        lastEventAt: at(-params.lastEventDaysAgo * DAY),
        ...(params.readDaysAgo === undefined ? {} : { readAt: at(-params.readDaysAgo * DAY) }),
      },
    });
    return row.id;
  }

  it('deletes a read row 60 days after it was read, an unread one 90 days after its last event', async () => {
    const ids = {
      read59: await seedRow({ name: 'read59', readDaysAgo: 59, lastEventDaysAgo: 100 }),
      read61: await seedRow({ name: 'read61', readDaysAgo: 61, lastEventDaysAgo: 62 }),
      unread89: await seedRow({ name: 'unread89', readDaysAgo: undefined, lastEventDaysAgo: 89 }),
      unread91: await seedRow({ name: 'unread91', readDaysAgo: undefined, lastEventDaysAgo: 91 }),
      // Created long ago, but still gathering activity: alive.
      coalescing: await seedRow({
        name: 'coalescing',
        readDaysAgo: undefined,
        lastEventDaysAgo: 2,
        createdDaysAgo: 200,
      }),
    };

    const result = await pruneNotifications({ now: NOW }, { db });
    expect(result._unsafeUnwrap().deleted).toBeGreaterThanOrEqual(2);

    const left = new Set(
      (await db.notification.findMany({ where: { id: { in: Object.values(ids) } } })).map(
        (row) => row.id,
      ),
    );
    expect(left.has(ids.read59)).toBe(true);
    expect(left.has(ids.read61)).toBe(false);
    expect(left.has(ids.unread89)).toBe(true);
    expect(left.has(ids.unread91)).toBe(false);
    expect(left.has(ids.coalescing)).toBe(true);
  });
});
