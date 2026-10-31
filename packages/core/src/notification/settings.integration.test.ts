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
import { sendBackOnEmail } from '../email/sendBackOnEmail';
import { sendCancelledEmail } from '../email/sendCancelledEmail';
import { sendConfirmationEmail } from '../email/sendConfirmationEmail';
import { sendInviteEmail } from '../email/sendInviteEmail';
import type { ConfirmationRecipient, ConfirmedBrunchSummary } from '../email/confirmationTypes';
import { NoopEventBus } from '../events/NoopEventBus';
import { getNotificationLevel, setNotificationLevel } from './notificationLevel';
import { getNotificationPreferences, setNotificationPreferences } from './preferences';

// Preferences, per-brunch mute and the four emails that obey them (spec 0015 M5), against the real
// database. Requires: supabase start and the seeded lookup tables (pnpm db:seed).
const RUN_ID = Date.now();
const email = (name: string) =>
  normalizeEmail(`integration-settings-${name}-${RUN_ID}@example.com`);
const APP_URL = 'https://app.example.com';

const db = createDb();

let hostId: UserId;
let annId: UserId; // yes, nothing changed
let bobId: UserId; // yes, brunch muted
let cyId: UserId; // yes, email for confirmations off
let dotId: UserId; // yes, just big stuff
let outsiderId: UserId;
let brunchId: BrunchId;
let goneBrunchId: BrunchId;
const brunchIds: BrunchId[] = [];
const userIds: UserId[] = [];

async function makeUser(name: string): Promise<UserId> {
  const user = await db.user.create({ data: { name: `Settings ${name}`, email: email(name) } });
  userIds.push(user.id as UserId);
  return user.id as UserId;
}

async function addMember(params: {
  readonly brunch: BrunchId;
  readonly userId: UserId;
  readonly name: string;
  readonly level?: 'muted' | 'big_stuff';
}): Promise<InviteId> {
  const [status, level] = await Promise.all([
    db.rsvpStatus.findFirstOrThrow({ where: { code: 'yes' } }),
    params.level === undefined
      ? undefined
      : db.notificationLevel.findUniqueOrThrow({ where: { code: params.level } }),
  ]);
  const invite = await db.brunchInvite.create({
    data: {
      brunchId: params.brunch,
      invitedUserId: params.userId,
      invitedEmail: email(params.name),
      invitedById: hostId,
      token: `tok-settings-${RUN_ID}-${params.name}-${params.brunch}`,
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
    { title, hostId, locations: [], times: [] },
    { db, eventBus: new NoopEventBus() },
  );
  const id = created._unsafeUnwrap().id as BrunchId;
  brunchIds.push(id);
  return id;
}

async function switchOff(userId: UserId, type: string, channel: 'in_app' | 'email') {
  const [typeRow, channelRow] = await Promise.all([
    db.notificationType.findUniqueOrThrow({ where: { code: type } }),
    db.notificationChannel.findUniqueOrThrow({ where: { code: channel } }),
  ]);
  await db.userNotificationPreference.create({
    data: { userId, notificationTypeId: typeRow.id, channelId: channelRow.id, isEnabled: false },
  });
}

const summary = (id: BrunchId): ConfirmedBrunchSummary => ({
  brunchId: id,
  title: 'Settings brunch',
  hostName: 'Settings host',
  placeName: 'Tartine',
  placeAddress: '600 Guerrero St',
  placeUrl: 'https://maps.example.com/tartine',
  timezone: 'America/Los_Angeles',
  scheduledAt: new Date('2026-12-06T18:00:00.000Z'),
});

const member = (name: string): ConfirmationRecipient => ({
  key: `member:${name}`,
  email: email(name) as Email,
  name,
  destination: { kind: 'brunch' },
});

beforeAll(async () => {
  hostId = await makeUser('host');
  annId = await makeUser('ann');
  bobId = await makeUser('bob');
  cyId = await makeUser('cy');
  dotId = await makeUser('dot');
  outsiderId = await makeUser('outsider');

  brunchId = await newBrunch('Settings brunch');
  await addMember({ brunch: brunchId, userId: annId, name: 'ann' });
  await addMember({ brunch: brunchId, userId: bobId, name: 'bob', level: 'muted' });
  await addMember({ brunch: brunchId, userId: cyId, name: 'cy' });
  await addMember({ brunch: brunchId, userId: dotId, name: 'dot', level: 'big_stuff' });
  await switchOff(cyId, 'brunch.confirmed', 'email');

  goneBrunchId = await newBrunch('Deleted settings brunch');
  await addMember({ brunch: goneBrunchId, userId: annId, name: 'ann-gone' });
  await db.brunch.update({ where: { id: goneBrunchId }, data: { deletedAt: new Date() } });
});

afterAll(async () => {
  await db.userNotificationPreference.deleteMany({ where: { userId: { in: userIds } } });
  await db.brunchAttendee.deleteMany({ where: { brunchId: { in: brunchIds } } });
  await db.brunchInvite.deleteMany({ where: { brunchId: { in: brunchIds } } });
  await db.brunch.deleteMany({ where: { id: { in: brunchIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
});

describe('preferences', () => {
  it('lists only the types something produces, as chosen or by default', async () => {
    const before = (await getNotificationPreferences({ userId: annId }, { db }))._unsafeUnwrap();

    expect(before['brunch.confirmed']).toEqual({ in_app: true, email: true });
    expect(before['rsvp.received']).toEqual({ in_app: true, email: false });
    // Nothing produces these, so the settings page never lists them.
    expect(before['running.late']).toBeUndefined();

    const cy = (await getNotificationPreferences({ userId: cyId }, { db }))._unsafeUnwrap();
    expect(cy['brunch.confirmed']).toEqual({ in_app: true, email: false });
  });

  it('saves one switch for several types at once, and saving it again changes nothing more', async () => {
    const save = (enabled: boolean) =>
      setNotificationPreferences(
        {
          userId: annId,
          types: ['brunch.cancelled', 'brunch.reinstated'],
          channel: 'email',
          enabled,
        },
        { db },
      );

    (await save(false))._unsafeUnwrap();
    (await save(false))._unsafeUnwrap();
    let ann = (await getNotificationPreferences({ userId: annId }, { db }))._unsafeUnwrap();
    expect(ann['brunch.cancelled']?.email).toBe(false);
    expect(ann['brunch.reinstated']?.email).toBe(false);
    expect(ann['brunch.cancelled']?.in_app).toBe(true);

    (await save(true))._unsafeUnwrap();
    ann = (await getNotificationPreferences({ userId: annId }, { db }))._unsafeUnwrap();
    expect(ann['brunch.cancelled']?.email).toBe(true);
    expect(
      await db.userNotificationPreference.count({
        where: { userId: annId, notificationType: { code: 'brunch.cancelled' } },
      }),
    ).toBe(1);
    // Someone else's choices are untouched.
    const bob = (await getNotificationPreferences({ userId: bobId }, { db }))._unsafeUnwrap();
    expect(bob['brunch.cancelled']?.email).toBe(true);
  });

  it('refuses a type nothing produces, an email for a type no email exists for, and nothing at all', async () => {
    const refused = async (
      types: Parameters<typeof setNotificationPreferences>[0]['types'],
      channel: 'in_app' | 'email',
    ) =>
      (
        await setNotificationPreferences({ userId: annId, types, channel, enabled: false }, { db })
      )._unsafeUnwrapErr().kind;

    expect(await refused(['running.late'], 'in_app')).toBe('invalid_selection');
    expect(await refused(['rsvp.received'], 'email')).toBe('invalid_selection');
    expect(await refused([], 'in_app')).toBe('invalid_selection');
    expect(
      await db.userNotificationPreference.count({
        where: { userId: annId, notificationType: { code: 'rsvp.received' } },
      }),
    ).toBe(0);
  });
});

describe("a person's level for a brunch", () => {
  it('starts at "all", changes only their own place, and the host has one too', async () => {
    expect((await getNotificationLevel({ brunchId, userId: annId }, { db }))._unsafeUnwrap()).toBe(
      'all',
    );
    expect((await getNotificationLevel({ brunchId, userId: bobId }, { db }))._unsafeUnwrap()).toBe(
      'muted',
    );

    (
      await setNotificationLevel({ brunchId, userId: annId, level: 'big_stuff' }, { db })
    )._unsafeUnwrap();
    expect((await getNotificationLevel({ brunchId, userId: annId }, { db }))._unsafeUnwrap()).toBe(
      'big_stuff',
    );
    expect((await getNotificationLevel({ brunchId, userId: cyId }, { db }))._unsafeUnwrap()).toBe(
      'all',
    );

    (
      await setNotificationLevel({ brunchId, userId: hostId, level: 'muted' }, { db })
    )._unsafeUnwrap();
    expect((await getNotificationLevel({ brunchId, userId: hostId }, { db }))._unsafeUnwrap()).toBe(
      'muted',
    );

    // Put them back for the email tests below.
    (await setNotificationLevel({ brunchId, userId: annId, level: 'all' }, { db }))._unsafeUnwrap();
    (
      await setNotificationLevel({ brunchId, userId: hostId, level: 'all' }, { db })
    )._unsafeUnwrap();
  });

  it('answers an outsider, a made-up brunch and a deleted brunch the same way', async () => {
    const madeUp = '0b7e1c9e-0000-4000-8000-000000000000' as BrunchId;
    const answers = await Promise.all(
      [
        { brunchId, userId: outsiderId },
        { brunchId: madeUp, userId: annId },
        { brunchId: goneBrunchId, userId: annId },
      ].map(async (who) => [
        (await setNotificationLevel({ ...who, level: 'muted' }, { db }))._unsafeUnwrapErr(),
        (await getNotificationLevel(who, { db }))._unsafeUnwrapErr(),
      ]),
    );

    for (const [set, get] of answers) {
      expect(set).toEqual({ kind: 'brunch_not_found' });
      expect(get).toEqual({ kind: 'brunch_not_found' });
    }
  });
});

describe('the emails obey preferences and mute, silently', () => {
  const ctx = (emailService: MockEmailService) => ({ db, emailService, appUrl: APP_URL });

  it('sends the confirmation to the people who want it, and skips a switched-off email and a muted brunch', async () => {
    const emailService = new MockEmailService();
    const outcomes: Record<string, string> = {};
    for (const name of ['ann', 'bob', 'cy', 'dot']) {
      outcomes[name] = (
        await sendConfirmationEmail(
          { brunch: summary(brunchId), recipient: member(name) },
          ctx(emailService),
        )
      )._unsafeUnwrap();
    }

    expect(outcomes).toEqual({
      ann: 'sent',
      bob: 'skipped_by_preference', // the brunch is muted
      cy: 'skipped_by_preference', // this email is switched off
      dot: 'sent', // "just big stuff" keeps a confirmation
    });
    expect(emailService.sent.map((message) => message.to).sort()).toEqual(
      [email('ann'), email('dot')].sort(),
    );
  });

  it('keeps a mute from hiding what the person has not muted: in-app off still sends the email', async () => {
    const emailService = new MockEmailService();
    await switchOff(annId, 'brunch.confirmed', 'in_app');
    const result = await sendConfirmationEmail(
      { brunch: summary(brunchId), recipient: member('ann') },
      ctx(emailService),
    );

    expect(result._unsafeUnwrap()).toBe('sent');
  });

  it('applies "just big stuff" to the called-off and back-on emails as the big stuff they are', async () => {
    const emailService = new MockEmailService();
    const cancelledAt = new Date('2026-10-25T10:00:00.000Z');
    const input = { brunch: { ...summary(brunchId), plan: undefined }, cancelledAt };
    const results = await Promise.all(
      ['ann', 'bob', 'dot'].flatMap((name) => [
        sendCancelledEmail({ ...input, recipient: member(name) }, ctx(emailService)),
        sendBackOnEmail({ ...input, recipient: member(name) }, ctx(emailService)),
      ]),
    );

    expect(results.map((result) => result._unsafeUnwrap())).toEqual([
      'sent',
      'sent',
      'skipped_by_preference',
      'skipped_by_preference',
      'sent',
      'sent',
    ]);
  });

  it('holds the called-off email to the person switch, and to nothing for an address with no account', async () => {
    const emailService = new MockEmailService();
    await switchOff(cyId, 'brunch.cancelled', 'email');
    const input = {
      brunch: { ...summary(brunchId), plan: undefined },
      cancelledAt: new Date('2026-10-25T11:00:00.000Z'),
    };
    const cy = await sendCancelledEmail({ ...input, recipient: member('cy') }, ctx(emailService));
    const stranger = await sendCancelledEmail(
      {
        ...input,
        recipient: {
          key: 'invite:stranger',
          email: email('no-account') as Email,
          name: undefined,
          destination: { kind: 'brunch' },
        },
      },
      ctx(emailService),
    );

    expect(cy._unsafeUnwrap()).toBe('skipped_by_preference');
    expect(stranger._unsafeUnwrap()).toBe('sent');
  });

  it('skips the invite email for an account that turned it off, and sends it to one that did not and to an address with no account', async () => {
    const emailService = new MockEmailService();
    const inviteBrunch = await newBrunch('Settings invite brunch');
    async function invite(userId: UserId | undefined, address: string): Promise<InviteId> {
      const created = await db.brunchInvite.create({
        data: {
          brunchId: inviteBrunch,
          invitedUserId: userId ?? null,
          invitedEmail: address,
          invitedById: hostId,
          token: `tok-invite-${RUN_ID}-${address}`,
          tokenExpiresAt: new Date(Date.now() + 86_400_000),
        },
      });
      return created.id as InviteId;
    }
    await switchOff(dotId, 'invite.received', 'email');
    const dots = await invite(dotId, email('dot'));
    const anns = await invite(annId, email('ann'));
    const strangers = await invite(undefined, email('invitee-no-account'));

    const results = [];
    for (const inviteId of [dots, anns, strangers]) {
      results.push((await sendInviteEmail({ inviteId }, ctx(emailService)))._unsafeUnwrap());
    }

    expect(results).toEqual(['skipped_by_preference', 'sent', 'sent']);
    expect(emailService.sent.map((message) => message.to).sort()).toEqual(
      [email('ann'), email('invitee-no-account')].sort(),
    );
  });

  it('puts the mute link and the settings link in the footer of an email to someone already in', async () => {
    const emailService = new MockEmailService();
    await sendConfirmationEmail(
      { brunch: summary(brunchId), recipient: member('ann') },
      ctx(emailService),
    );

    const [forMember] = emailService.sent;
    expect(forMember?.html).toContain(`${APP_URL}/brunch/${brunchId}#notifications`);
    expect(forMember?.html).toContain(`${APP_URL}/settings/notifications`);
  });
});
