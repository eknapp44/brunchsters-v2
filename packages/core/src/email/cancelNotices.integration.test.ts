import { createDb } from '@brunchsters/database';
import {
  normalizeEmail,
  type BrunchId,
  type BrunchLocationId,
  type BrunchTimeId,
  type InviteId,
  type UserId,
} from '@brunchsters/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelBrunch } from '../brunch/cancelBrunch';
import { confirmBrunch } from '../brunch/confirmBrunch';
import { createBrunch } from '../brunch/createBrunch';
import { reinstateBrunch } from '../brunch/reinstateBrunch';
import { revokeInvite } from '../invite/revokeInvite';
import { sendInvites } from '../invite/sendInvites';
import { updateRsvp } from '../invite/updateRsvp';
import { InMemoryRateLimiter } from '../rateLimit/InMemoryRateLimiter';
import { markCancelNoticeSent } from './markCancelNoticeSent';
import { MockEmailService } from './MockEmailService';
import { resolveBackOnNotice } from './resolveBackOnNotice';
import { resolveCancelNotice } from './resolveCancelNotice';
import { sendBackOnEmail } from './sendBackOnEmail';
import { sendCancelledEmail } from './sendCancelledEmail';

// Spec 0013 (M5) on real Postgres: who is told when a brunch is called off and brought back, and
// when nobody is. The queue functions only run these steps in order after a wait, so this is the
// whole decision. Requires: supabase start + seeded lookup tables (pnpm db:seed).
const RUN_ID = Date.now();
const email = (label: string): string => `integration-notice-${label}-${RUN_ID}@example.com`;
const APP_URL = 'https://app.example.com';

const db = createDb();
const eventBus = { emit: vi.fn().mockResolvedValue(undefined) };
let rateLimiter = new InMemoryRateLimiter();
beforeEach(() => {
  rateLimiter = new InMemoryRateLimiter();
});

const T0 = new Date('2026-10-23T12:00:00.000Z');
const T1 = new Date('2026-10-23T12:30:00.000Z');
const inDays = (days: number): string =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

let hostId: UserId;
let memberId: UserId;
let declinerId: UserId;
const createdBrunchIds: BrunchId[] = [];

beforeAll(async () => {
  const users = await Promise.all(
    ['host', 'member', 'decliner'].map((label) =>
      db.user.create({ data: { name: `Notice ${label}`, email: email(label) } }),
    ),
  );
  [hostId, memberId, declinerId] = users.map((user) => user.id as UserId) as [
    UserId,
    UserId,
    UserId,
  ];
});

afterAll(async () => {
  const where = { brunchId: { in: createdBrunchIds } };
  await db.brunchLocation.deleteMany({ where });
  await db.brunchTime.deleteMany({ where });
  await db.brunchAttendee.deleteMany({ where });
  await db.brunchInvite.deleteMany({ where });
  await db.brunch.deleteMany({ where: { id: { in: createdBrunchIds } } });
  await db.user.deleteMany({ where: { id: { in: [hostId, memberId, declinerId] } } });
});

// An active brunch with a member who said yes, a decliner, someone with only a link, and someone
// whose invite was revoked.
async function setUp(): Promise<{
  readonly brunchId: BrunchId;
  readonly strangerToken: string;
  readonly locationId: BrunchLocationId;
  readonly timeId: BrunchTimeId;
}> {
  const created = await createBrunch(
    {
      title: 'Notice brunch',
      hostId,
      locations: [
        {
          placeId: `place-notice-${RUN_ID}-${createdBrunchIds.length}`,
          placeName: 'Cafe A',
          placeAddress: '1 Main St',
          placeUrl: 'https://maps.google.com/?cid=a',
          timezone: 'America/Chicago',
        },
      ],
      times: [{ scheduledAt: inDays(14) }],
    },
    { db, eventBus },
  );
  const brunchId = created._unsafeUnwrap().id;
  createdBrunchIds.push(brunchId);

  const sent = await sendInvites(
    {
      brunchId,
      invitedById: hostId,
      emails: ['member', 'decliner', 'stranger', 'revoked'].map((label) =>
        normalizeEmail(email(label)),
      ),
    },
    { db, eventBus, rateLimiter },
  );
  const revokedId = sent._unsafeUnwrap().find((invite) => invite.invitedEmail.includes('revoked'))
    ?.id as InviteId;
  (await revokeInvite({ inviteId: revokedId, requestedById: hostId }, { db }))._unsafeUnwrap();
  (
    await updateRsvp({ brunchId, viewerId: memberId, response: 'yes' }, { db, eventBus })
  )._unsafeUnwrap();
  (
    await updateRsvp({ brunchId, viewerId: declinerId, response: 'no' }, { db, eventBus })
  )._unsafeUnwrap();

  const strangerInvite = await db.brunchInvite.findFirstOrThrow({
    where: { brunchId, invitedEmail: email('stranger') },
  });
  const location = await db.brunchLocation.findFirstOrThrow({ where: { brunchId } });
  const time = await db.brunchTime.findFirstOrThrow({ where: { brunchId } });
  return {
    brunchId,
    strangerToken: strangerInvite.token,
    locationId: location.id as BrunchLocationId,
    timeId: time.id as BrunchTimeId,
  };
}

const callOff = (brunchId: BrunchId, now: Date) =>
  cancelBrunch({ brunchId, requestedById: hostId, now }, { db, eventBus, rateLimiter });
const bringBack = (brunchId: BrunchId) =>
  reinstateBrunch({ brunchId, requestedById: hostId }, { db, eventBus });

describe('the called-off notice (integration — real Postgres)', () => {
  it('goes to the member and the person with a link, not to the host, the decliner or the revoked invite', async () => {
    const { brunchId, strangerToken } = await setUp();
    (await callOff(brunchId, T0))._unsafeUnwrap();

    const resolved = (
      await resolveCancelNotice({ brunchId, cancelledAt: T0 }, { db })
    )._unsafeUnwrap();

    expect(resolved.kind).toBe('send');
    if (resolved.kind !== 'send') return;
    expect(resolved.recipients.map((r) => r.email).sort()).toEqual(
      [email('member'), email('stranger')].sort(),
    );

    const emailService = new MockEmailService();
    for (const recipient of resolved.recipients) {
      const outcome = await sendCancelledEmail(
        { brunch: resolved.brunch, cancelledAt: resolved.cancelledAt, recipient },
        { db, emailService, appUrl: APP_URL },
      );
      expect(outcome._unsafeUnwrap()).toBe('sent');
    }
    const byAddress = new Map(emailService.sent.map((message) => [message.to, message]));
    expect(byAddress.get(email('member') as never)?.html).toContain(
      `${APP_URL}/brunch/${brunchId}`,
    );
    expect(byAddress.get(email('stranger') as never)?.html).toContain(
      `${APP_URL}/invite/${strangerToken}`,
    );
    expect(
      emailService.sent.every(
        (message) => message.subject === 'Notice host called off Notice brunch',
      ),
    ).toBe(true);
  });

  it('is announced once: marked as sent, then a replayed event says nothing', async () => {
    const { brunchId } = await setUp();
    (await callOff(brunchId, T0))._unsafeUnwrap();

    expect(
      (await markCancelNoticeSent({ brunchId, cancelledAt: T0 }, { db }))._unsafeUnwrap(),
    ).toEqual({ marked: true });

    expect(
      (await resolveCancelNotice({ brunchId, cancelledAt: T0 }, { db }))._unsafeUnwrap(),
    ).toEqual({ kind: 'stop', reason: 'already_sent' });
    expect(
      (await markCancelNoticeSent({ brunchId, cancelledAt: T0 }, { db }))._unsafeUnwrap(),
    ).toEqual({ marked: false });
  });

  it('says nothing when the host brought it back inside the hold, and nobody gets a "back on" either', async () => {
    const { brunchId } = await setUp();
    (await callOff(brunchId, T0))._unsafeUnwrap();
    (await bringBack(brunchId))._unsafeUnwrap();

    // The run wakes up after the hold, and finds the brunch open again.
    expect(
      (await resolveCancelNotice({ brunchId, cancelledAt: T0 }, { db }))._unsafeUnwrap(),
    ).toEqual({ kind: 'stop', reason: 'not_called_off' });
    expect((await resolveBackOnNotice({ brunchId }, { db }))._unsafeUnwrap()).toEqual({
      kind: 'stop',
      reason: 'no_notice_sent',
    });
  });

  it('leaves the old cancellation to stop and the new one to speak, when it is called off a second time', async () => {
    const { brunchId } = await setUp();
    (await callOff(brunchId, T0))._unsafeUnwrap();
    (await bringBack(brunchId))._unsafeUnwrap();
    (await callOff(brunchId, T1))._unsafeUnwrap();

    expect(
      (await resolveCancelNotice({ brunchId, cancelledAt: T0 }, { db }))._unsafeUnwrap(),
    ).toEqual({ kind: 'stop', reason: 'superseded' });
    // The first run finishing late must not mark the second cancellation as announced.
    expect(
      (await markCancelNoticeSent({ brunchId, cancelledAt: T0 }, { db }))._unsafeUnwrap(),
    ).toEqual({ marked: false });
    expect(
      (await resolveCancelNotice({ brunchId, cancelledAt: T1 }, { db }))._unsafeUnwrap().kind,
    ).toBe('send');
  });

  it('says which brunch it was by its confirmed place and time, in the place’s own zone', async () => {
    const { brunchId, locationId, timeId } = await setUp();
    (
      await confirmBrunch({ brunchId, requestedById: hostId, locationId, timeId }, { db, eventBus })
    )._unsafeUnwrap();
    (await callOff(brunchId, T0))._unsafeUnwrap();

    const resolved = (
      await resolveCancelNotice({ brunchId, cancelledAt: T0 }, { db })
    )._unsafeUnwrap();

    expect(resolved.kind === 'send' && resolved.brunch.plan).toMatchObject({
      placeName: 'Cafe A',
      timezone: 'America/Chicago',
    });
  });

  it('says nothing about a brunch that is deleted before the hold is over', async () => {
    const { brunchId } = await setUp();
    (await callOff(brunchId, T0))._unsafeUnwrap();
    await db.brunch.update({ where: { id: brunchId }, data: { deletedAt: new Date() } });

    expect(
      (await resolveCancelNotice({ brunchId, cancelledAt: T0 }, { db }))._unsafeUnwrap(),
    ).toEqual({ kind: 'stop', reason: 'brunch_gone' });
  });
});

describe('the back-on notice (integration — real Postgres)', () => {
  it('goes to the same people once the called-off notice went out, once per cancellation', async () => {
    const { brunchId } = await setUp();
    (await callOff(brunchId, T0))._unsafeUnwrap();
    (await markCancelNoticeSent({ brunchId, cancelledAt: T0 }, { db }))._unsafeUnwrap();
    (await bringBack(brunchId))._unsafeUnwrap();

    const resolved = (await resolveBackOnNotice({ brunchId }, { db }))._unsafeUnwrap();

    expect(resolved.kind).toBe('send');
    if (resolved.kind !== 'send') return;
    expect(resolved.cancelledAt).toEqual(T0);
    expect(resolved.recipients.map((r) => r.email).sort()).toEqual(
      [email('member'), email('stranger')].sort(),
    );

    const emailService = new MockEmailService();
    const send = (recipient: (typeof resolved.recipients)[number]) =>
      sendBackOnEmail(
        { brunch: resolved.brunch, cancelledAt: resolved.cancelledAt, recipient },
        { db, emailService, appUrl: APP_URL },
      );
    for (const recipient of resolved.recipients) (await send(recipient))._unsafeUnwrap();
    expect(
      emailService.sent.every((message) => message.subject === 'Notice brunch is back on 🥂'),
    ).toBe(true);
    // A replay sends the same keys, which the provider drops.
    const first = emailService.sent.map((message) => message.idempotencyKey);
    for (const recipient of resolved.recipients) (await send(recipient))._unsafeUnwrap();
    expect(emailService.sent.slice(first.length).map((message) => message.idempotencyKey)).toEqual(
      first,
    );
  });

  it('stops when the brunch is called off again before the run gets to it', async () => {
    const { brunchId } = await setUp();
    (await callOff(brunchId, T0))._unsafeUnwrap();
    (await markCancelNoticeSent({ brunchId, cancelledAt: T0 }, { db }))._unsafeUnwrap();
    (await bringBack(brunchId))._unsafeUnwrap();
    (await callOff(brunchId, T1))._unsafeUnwrap();

    expect((await resolveBackOnNotice({ brunchId }, { db }))._unsafeUnwrap()).toEqual({
      kind: 'stop',
      reason: 'still_called_off',
    });
  });

  it('does not tell a second "back on" for a cancellation that was never announced', async () => {
    const { brunchId } = await setUp();
    (await callOff(brunchId, T0))._unsafeUnwrap();
    (await markCancelNoticeSent({ brunchId, cancelledAt: T0 }, { db }))._unsafeUnwrap();
    (await bringBack(brunchId))._unsafeUnwrap();
    // A new cancellation starts un-announced, and coming back inside its hold is silent.
    (await callOff(brunchId, T1))._unsafeUnwrap();
    (await bringBack(brunchId))._unsafeUnwrap();

    expect((await resolveBackOnNotice({ brunchId }, { db }))._unsafeUnwrap()).toEqual({
      kind: 'stop',
      reason: 'no_notice_sent',
    });
  });
});
