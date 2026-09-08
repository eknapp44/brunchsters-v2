import { createDb } from '@brunchsters/database';
import type { BrunchId, InviteToken, UserId } from '@brunchsters/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createBrunch } from '../brunch/createBrunch';
import { NoopEventBus } from '../events/NoopEventBus';
import { respondToInvite } from './respondToInvite';
import { sendInvites } from './sendInvites';
import { updateRsvp } from './updateRsvp';

// Requires: supabase start + seeded lookup tables (pnpm db:seed).
const RUN_ID = Date.now();
const HOST_EMAIL = `integration-updatersvp-host-${RUN_ID}@example.com`;
const ATTENDEE_EMAIL = `integration-updatersvp-attendee-${RUN_ID}@example.com`;
const OUTSIDER_EMAIL = `integration-updatersvp-outsider-${RUN_ID}@example.com`;

const db = createDb();
const eventBus = new NoopEventBus();

let hostId: UserId;
let attendeeId: UserId;
let outsiderId: UserId;
let brunchId: BrunchId;
const createdBrunchIds: string[] = [];

beforeAll(async () => {
  const host = await db.user.create({
    data: { name: 'Integration UpdateRsvp Host', email: HOST_EMAIL },
  });
  hostId = host.id as UserId;

  const attendeeUser = await db.user.create({
    data: { name: 'Integration UpdateRsvp Attendee', email: ATTENDEE_EMAIL },
  });
  attendeeId = attendeeUser.id as UserId;

  const outsiderUser = await db.user.create({
    data: { name: 'Integration UpdateRsvp Outsider', email: OUTSIDER_EMAIL },
  });
  outsiderId = outsiderUser.id as UserId;

  const brunch = await createBrunch(
    { title: 'Integration UpdateRsvp Brunch', locations: [], times: [], hostId },
    { db, eventBus },
  );
  expect(brunch.isOk()).toBe(true);
  brunchId = brunch._unsafeUnwrap().id;
  createdBrunchIds.push(brunchId);

  const invites = await sendInvites(
    { brunchId, invitedById: hostId, emails: [ATTENDEE_EMAIL] },
    { db, eventBus },
  );
  expect(invites.isOk()).toBe(true);

  const invite = await db.brunchInvite.findFirstOrThrow({
    where: { brunchId, invitedEmail: ATTENDEE_EMAIL },
  });
  const joined = await respondToInvite(
    { token: invite.token as InviteToken, viewerId: attendeeId, response: 'yes' },
    { db, eventBus },
  );
  expect(joined.isOk()).toBe(true);
});

afterAll(async () => {
  await db.brunchAttendee.deleteMany({ where: { brunchId: { in: createdBrunchIds } } });
  await db.brunchInvite.deleteMany({ where: { brunchId: { in: createdBrunchIds } } });
  await db.brunch.deleteMany({ where: { id: { in: createdBrunchIds } } });
  await db.user.deleteMany({
    where: { email: { in: [HOST_EMAIL, ATTENDEE_EMAIL, OUTSIDER_EMAIL] } },
  });
});

describe('updateRsvp integration', () => {
  it('lets an existing attendee change their RSVP', async () => {
    const result = await updateRsvp(
      { brunchId, viewerId: attendeeId, response: 'maybe' },
      { db, eventBus },
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ brunchId });

    const attendee = await db.brunchAttendee.findFirstOrThrow({
      where: { brunchId, userId: attendeeId },
      include: { rsvpStatus: true },
    });
    expect(attendee.rsvpStatus.code).toBe('maybe');
  });

  it('lets the host change their own RSVP via their synthetic attendee row (no token needed)', async () => {
    const result = await updateRsvp(
      { brunchId, viewerId: hostId, response: 'no' },
      { db, eventBus },
    );

    expect(result.isOk()).toBe(true);

    const attendee = await db.brunchAttendee.findFirstOrThrow({
      where: { brunchId, userId: hostId },
      include: { rsvpStatus: true },
    });
    expect(attendee.rsvpStatus.code).toBe('no');
  });

  it('returns not_attendee for a user with no attendee row on this brunch', async () => {
    const result = await updateRsvp(
      { brunchId, viewerId: outsiderId, response: 'yes' },
      { db, eventBus },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'not_attendee' });
  });
});
