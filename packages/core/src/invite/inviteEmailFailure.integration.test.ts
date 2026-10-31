import { createDb } from '@brunchsters/database';
import {
  normalizeEmail,
  type BrunchId,
  type Email,
  type InviteId,
  type UserId,
} from '@brunchsters/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createBrunch } from '../brunch/createBrunch';
import { MockEmailService } from '../email/MockEmailService';
import { sendInviteEmail } from '../email/sendInviteEmail';
import { NoopEventBus } from '../events/NoopEventBus';
import { getInvitesForBrunch } from './getInvitesForBrunch';
import { clearInviteEmailFailure, recordInviteEmailFailed } from './inviteEmailFailure';

// "An email did not go out" (spec 0015 M6) against the real database. Requires: supabase start and
// the seeded lookup tables (pnpm db:seed).
const RUN_ID = Date.now();
const email = (name: string) =>
  normalizeEmail(`integration-emailfail-${name}-${RUN_ID}@example.com`);
const APP_URL = 'https://app.example.com';

const db = createDb();

let hostId: UserId;
let guestId: UserId;
let brunchId: BrunchId;
const brunchIds: BrunchId[] = [];
const userIds: UserId[] = [];

async function makeUser(name: string): Promise<UserId> {
  const user = await db.user.create({ data: { name: `EmailFail ${name}`, email: email(name) } });
  userIds.push(user.id as UserId);
  return user.id as UserId;
}

async function newInvite(params: {
  readonly brunch: BrunchId;
  readonly address: Email;
  readonly lastResentAt?: Date;
}): Promise<InviteId> {
  const invite = await db.brunchInvite.create({
    data: {
      brunchId: params.brunch,
      invitedEmail: params.address,
      invitedById: hostId,
      token: `tok-emailfail-${RUN_ID}-${params.address}-${params.lastResentAt?.getTime() ?? 0}`,
      tokenExpiresAt: new Date(Date.now() + 86_400_000),
      ...(params.lastResentAt === undefined ? {} : { lastResentAt: params.lastResentAt }),
    },
  });
  return invite.id as InviteId;
}

async function hostRows(brunch: BrunchId = brunchId) {
  return db.notification.findMany({
    where: { userId: hostId, brunchId: brunch, notificationType: { code: 'invite.email.failed' } },
    orderBy: { createdAt: 'asc' },
  });
}

async function flag(inviteId: InviteId): Promise<Date | null> {
  return (await db.brunchInvite.findUniqueOrThrow({ where: { id: inviteId } })).emailFailedAt;
}

beforeAll(async () => {
  hostId = await makeUser('host');
  guestId = await makeUser('guest');
  const created = await createBrunch(
    { title: 'Email failure brunch', hostId, locations: [], times: [] },
    { db, eventBus: new NoopEventBus() },
  );
  brunchId = created._unsafeUnwrap().id as BrunchId;
  brunchIds.push(brunchId);
});

afterAll(async () => {
  await db.notification.deleteMany({ where: { userId: { in: userIds } } });
  await db.userNotificationPreference.deleteMany({ where: { userId: { in: userIds } } });
  await db.brunchAttendee.deleteMany({ where: { brunchId: { in: brunchIds } } });
  await db.brunchInvite.deleteMany({ where: { brunchId: { in: brunchIds } } });
  await db.brunch.deleteMany({ where: { id: { in: brunchIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
});

describe('recordInviteEmailFailed', () => {
  it('marks the invite and tells the host, once for one send however often it is told', async () => {
    const inviteId = await newInvite({ brunch: brunchId, address: email('rejected') });

    expect((await recordInviteEmailFailed({ inviteId }, { db }))._unsafeUnwrap().written).toBe(1);
    expect((await recordInviteEmailFailed({ inviteId }, { db }))._unsafeUnwrap().written).toBe(0);

    expect(await flag(inviteId)).not.toBeNull();
    const rows = (await hostRows()).filter((row) =>
      JSON.stringify(row.data).includes(email('rejected')),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.data).toEqual({ kind: 'invite.email.failed', email: email('rejected') });
  });

  it('is news again after a resend that also failed (a new send has its own row)', async () => {
    const first = await newInvite({ brunch: brunchId, address: email('twice') });
    await recordInviteEmailFailed({ inviteId: first }, { db });
    await db.brunchInvite.update({ where: { id: first }, data: { lastResentAt: new Date() } });

    const again = await recordInviteEmailFailed({ inviteId: first }, { db });

    expect(again._unsafeUnwrap().written).toBe(1);
    expect(
      (await hostRows()).filter((row) => JSON.stringify(row.data).includes(email('twice'))),
    ).toHaveLength(2);
  });

  it("is never hidden by muting the brunch, but is the host's to switch off, and the flag stays either way", async () => {
    const muted = await db.notificationLevel.findUniqueOrThrow({ where: { code: 'muted' } });
    await db.brunchAttendee.updateMany({
      where: { brunchId, userId: hostId },
      data: { notificationLevelId: muted.id },
    });
    const mutedInvite = await newInvite({ brunch: brunchId, address: email('muted-brunch') });
    expect(
      (await recordInviteEmailFailed({ inviteId: mutedInvite }, { db }))._unsafeUnwrap().written,
    ).toBe(1);

    const [type, channel] = await Promise.all([
      db.notificationType.findUniqueOrThrow({ where: { code: 'invite.email.failed' } }),
      db.notificationChannel.findUniqueOrThrow({ where: { code: 'in_app' } }),
    ]);
    await db.userNotificationPreference.create({
      data: {
        userId: hostId,
        notificationTypeId: type.id,
        channelId: channel.id,
        isEnabled: false,
      },
    });
    const switchedOff = await newInvite({ brunch: brunchId, address: email('switched-off') });
    expect(
      (await recordInviteEmailFailed({ inviteId: switchedOff }, { db }))._unsafeUnwrap().written,
    ).toBe(0);
    expect(await flag(switchedOff)).not.toBeNull();

    await db.userNotificationPreference.deleteMany({ where: { userId: hostId } });
    const all = await db.notificationLevel.findUniqueOrThrow({ where: { code: 'all' } });
    await db.brunchAttendee.updateMany({
      where: { brunchId, userId: hostId },
      data: { notificationLevelId: all.id },
    });
  });

  it('writes nothing for a revoked invite, a made-up one, or a deleted brunch', async () => {
    const revoked = await newInvite({ brunch: brunchId, address: email('revoked') });
    await db.brunchInvite.update({ where: { id: revoked }, data: { deletedAt: new Date() } });
    const gone = await createBrunch(
      { title: 'Deleted email failure brunch', hostId, locations: [], times: [] },
      { db, eventBus: new NoopEventBus() },
    );
    const goneBrunch = gone._unsafeUnwrap().id as BrunchId;
    brunchIds.push(goneBrunch);
    const inDeleted = await newInvite({ brunch: goneBrunch, address: email('in-deleted') });
    await db.brunch.update({ where: { id: goneBrunch }, data: { deletedAt: new Date() } });
    const before = await db.notification.count({ where: { userId: hostId } });

    for (const inviteId of [
      revoked,
      inDeleted,
      '0b7e1c9e-0000-4000-8000-000000000000' as InviteId,
    ]) {
      expect((await recordInviteEmailFailed({ inviteId }, { db }))._unsafeUnwrap().written).toBe(0);
    }
    expect(await db.notification.count({ where: { userId: hostId } })).toBe(before);
    expect(await flag(inDeleted)).toBeNull();
  });
});

describe('an earlier failure and a person who has since opted out', () => {
  it('is cleared, silently, when the invitee now has the invite email switched off', async () => {
    // The invitee has an account (the guest): the first send failed, then they switched the email off.
    const inviteId = await newInvite({ brunch: brunchId, address: email('guest') });
    await recordInviteEmailFailed({ inviteId }, { db });
    expect(await flag(inviteId)).not.toBeNull();

    const [type, channel] = await Promise.all([
      db.notificationType.findUniqueOrThrow({ where: { code: 'invite.received' } }),
      db.notificationChannel.findUniqueOrThrow({ where: { code: 'email' } }),
    ]);
    await db.userNotificationPreference.create({
      data: {
        userId: guestId,
        notificationTypeId: type.id,
        channelId: channel.id,
        isEnabled: false,
      },
    });

    const mail = new MockEmailService();
    const result = await sendInviteEmail({ inviteId }, { db, emailService: mail, appUrl: APP_URL });

    expect(result._unsafeUnwrap()).toBe('skipped_by_preference');
    expect(mail.sent).toHaveLength(0);
    // The host is not left with "didn't go through" and "Try Resend" for an email that can never go.
    expect(await flag(inviteId)).toBeNull();
    expect(
      (await hostRows()).some((row) => JSON.stringify(row.data).includes(email('guest'))),
    ).toBe(false);

    await db.userNotificationPreference.deleteMany({ where: { userId: guestId } });
  });
});

describe('the host list and the way back', () => {
  it('shows an invite whose email failed as such, to the host only, and not one that did not', async () => {
    const bad = await newInvite({ brunch: brunchId, address: email('listed-bad') });
    await newInvite({ brunch: brunchId, address: email('listed-fine') });
    await recordInviteEmailFailed({ inviteId: bad }, { db });

    const list = (
      await getInvitesForBrunch({ brunchId, requestedById: hostId }, { db })
    )._unsafeUnwrap();
    expect(list.find((item) => item.invitedEmail === email('listed-bad'))?.emailFailed).toBe(true);
    expect(list.find((item) => item.invitedEmail === email('listed-fine'))?.emailFailed).toBe(
      false,
    );
    expect(
      (await getInvitesForBrunch({ brunchId, requestedById: guestId }, { db }))._unsafeUnwrapErr(),
    ).toEqual({ kind: 'brunch_not_found' });
  });

  it('is cleared, with the host rows about it and only those, when an email for the invite goes out', async () => {
    const mine = await newInvite({ brunch: brunchId, address: email('recovers') });
    const other = await newInvite({ brunch: brunchId, address: email('stays-failed') });
    await recordInviteEmailFailed({ inviteId: mine }, { db });
    await recordInviteEmailFailed({ inviteId: other }, { db });

    // The real sender, against the real database: a refused address leaves it, a send clears it.
    const refused = await sendInviteEmail(
      { inviteId: mine },
      {
        db,
        emailService: new MockEmailService({ kind: 'invalid_address', address: email('recovers') }),
        appUrl: APP_URL,
      },
    );
    expect(refused._unsafeUnwrapErr().kind).toBe('invalid_address');
    expect(await flag(mine)).not.toBeNull();

    const sent = await sendInviteEmail(
      { inviteId: mine },
      { db, emailService: new MockEmailService(), appUrl: APP_URL },
    );
    expect(sent._unsafeUnwrap()).toBe('sent');

    expect(await flag(mine)).toBeNull();
    const rows = await hostRows();
    expect(rows.some((row) => JSON.stringify(row.data).includes(email('recovers')))).toBe(false);
    expect(rows.some((row) => JSON.stringify(row.data).includes(email('stays-failed')))).toBe(true);
    expect(await flag(other)).not.toBeNull();

    // Clearing again is harmless.
    expect((await clearInviteEmailFailure({ inviteId: mine }, { db })).isOk()).toBe(true);
  });
});
