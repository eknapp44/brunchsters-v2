import { createDb } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createBrunch } from '../brunch/createBrunch';
import { NoopEventBus } from '../events/NoopEventBus';
import { respondToInvite } from './respondToInvite';
import { sendInvites } from './sendInvites';

// Requires: supabase start + seeded lookup tables (pnpm db:seed).
const RUN_ID = Date.now();
const HOST_EMAIL = `integration-respond-host-${RUN_ID}@example.com`;
const KNOWN_INVITEE_EMAIL = `integration-respond-known-${RUN_ID}@example.com`;
const NEW_INVITEE_EMAIL = `integration-respond-new-${RUN_ID}@example.com`;

const db = createDb();
const eventBus = new NoopEventBus();

let hostId: UserId;
let knownInviteeId: UserId;
let newInviteeId: UserId;
let brunchId: BrunchId;
const createdBrunchIds: string[] = [];

beforeAll(async () => {
  const host = await db.user.create({
    data: { name: 'Integration Respond Host', email: HOST_EMAIL },
  });
  hostId = host.id as UserId;

  const knownInvitee = await db.user.create({
    data: { name: 'Integration Known Respondent', email: KNOWN_INVITEE_EMAIL },
  });
  knownInviteeId = knownInvitee.id as UserId;

  const brunch = await createBrunch(
    { title: 'Integration Respond Brunch', locations: [], times: [], hostId },
    { db, eventBus },
  );
  expect(brunch.isOk()).toBe(true);
  brunchId = brunch._unsafeUnwrap().id;
  createdBrunchIds.push(brunchId);

  const invites = await sendInvites(
    { brunchId, invitedById: hostId, emails: [KNOWN_INVITEE_EMAIL, NEW_INVITEE_EMAIL] },
    { db, eventBus },
  );
  expect(invites.isOk()).toBe(true);
});

afterAll(async () => {
  await db.brunchAttendee.deleteMany({ where: { brunchId: { in: createdBrunchIds } } });
  await db.brunchInvite.deleteMany({ where: { brunchId: { in: createdBrunchIds } } });
  await db.brunch.deleteMany({ where: { id: { in: createdBrunchIds } } });
  await db.user.deleteMany({
    where: { email: { in: [HOST_EMAIL, KNOWN_INVITEE_EMAIL, NEW_INVITEE_EMAIL] } },
  });
});

describe('respondToInvite integration', () => {
  it('updates the eagerly-created attendee row for a known invitee', async () => {
    const invite = await db.brunchInvite.findFirstOrThrow({
      where: { brunchId, invitedEmail: KNOWN_INVITEE_EMAIL },
    });
    const before = await db.brunchAttendee.findFirstOrThrow({ where: { inviteId: invite.id } });
    expect(before.userId).toBe(knownInviteeId);

    const result = await respondToInvite(
      { token: invite.token, viewerId: knownInviteeId, response: 'yes' },
      { db, eventBus },
    );

    expect(result.isOk()).toBe(true);
    const attendees = await db.brunchAttendee.findMany({ where: { inviteId: invite.id } });
    expect(attendees).toHaveLength(1);

    const after = await db.brunchAttendee.findFirstOrThrow({
      where: { inviteId: invite.id },
      include: { rsvpStatus: true },
    });
    expect(after.rsvpStatus.code).toBe('yes');
    expect(after.respondedAt).not.toBeNull();
  });

  it('creates the attendee row for an unregistered invitee on first response and backfills invitedUserId', async () => {
    const inviteBefore = await db.brunchInvite.findFirstOrThrow({
      where: { brunchId, invitedEmail: NEW_INVITEE_EMAIL },
    });
    expect(inviteBefore.invitedUserId).toBeNull();

    const noAttendeeYet = await db.brunchAttendee.findFirst({
      where: { inviteId: inviteBefore.id },
    });
    expect(noAttendeeYet).toBeNull();

    // The invitee signs up via the token — their User row now exists.
    const newUser = await db.user.create({
      data: { name: 'Integration New Respondent', email: NEW_INVITEE_EMAIL },
    });
    newInviteeId = newUser.id as UserId;

    const result = await respondToInvite(
      { token: inviteBefore.token, viewerId: newInviteeId, response: 'maybe' },
      { db, eventBus },
    );

    expect(result.isOk()).toBe(true);

    const attendee = await db.brunchAttendee.findFirstOrThrow({
      where: { inviteId: inviteBefore.id },
      include: { rsvpStatus: true },
    });
    expect(attendee.userId).toBe(newInviteeId);
    expect(attendee.rsvpStatus.code).toBe('maybe');

    const inviteAfter = await db.brunchInvite.findFirstOrThrow({ where: { id: inviteBefore.id } });
    expect(inviteAfter.invitedUserId).toBe(newInviteeId);
  });

  it('allows changing a response (no lock)', async () => {
    const invite = await db.brunchInvite.findFirstOrThrow({
      where: { brunchId, invitedEmail: NEW_INVITEE_EMAIL },
    });

    const result = await respondToInvite(
      { token: invite.token, viewerId: newInviteeId, response: 'no' },
      { db, eventBus },
    );

    expect(result.isOk()).toBe(true);
    const attendee = await db.brunchAttendee.findFirstOrThrow({
      where: { inviteId: invite.id },
      include: { rsvpStatus: true },
    });
    expect(attendee.rsvpStatus.code).toBe('no');
  });

  it('returns invalid_token for a nonexistent token', async () => {
    const result = await respondToInvite(
      { token: 'not-a-real-token', viewerId: knownInviteeId, response: 'yes' },
      { db, eventBus },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'invalid_token' });
  });

  it("lets the host click someone else's still-pending invite link while already signed in, without erroring or duplicating their attendee row", async () => {
    // A fresh, never-responded-to invite — this is the exact scenario that
    // broke: no attendee row exists for THIS invite yet, so the naive path
    // tries to create one for the host, colliding with the host's existing
    // attendee row (from brunch creation) on the (brunchId, userId) unique
    // constraint.
    const thirdPartyEmail = `integration-respond-third-${RUN_ID}@example.com`;
    const sent = await sendInvites(
      { brunchId, invitedById: hostId, emails: [thirdPartyEmail] },
      { db, eventBus },
    );
    expect(sent.isOk()).toBe(true);
    const invite = await db.brunchInvite.findFirstOrThrow({
      where: { brunchId, invitedEmail: thirdPartyEmail },
    });

    const result = await respondToInvite(
      { token: invite.token, viewerId: hostId, response: 'yes' },
      { db, eventBus },
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ brunchId });

    // Host still has exactly one attendee row for this brunch (their own,
    // from brunch creation) — no duplicate was created.
    const hostAttendees = await db.brunchAttendee.findMany({ where: { brunchId, userId: hostId } });
    expect(hostAttendees).toHaveLength(1);

    // The invite meant for the third party is untouched — still no attendee.
    const thirdPartyAttendee = await db.brunchAttendee.findFirst({
      where: { inviteId: invite.id },
    });
    expect(thirdPartyAttendee).toBeNull();
  });

  it("generalizes to a non-host attendee (membership via their own invite, not the synthetic host one) clicking someone else's pending link", async () => {
    // knownInviteeId's membership here comes from a real invite through
    // sendInvites, not the synthetic host invite from brunch creation —
    // a genuinely different setup path than the host case above, even
    // though respondToInvite's own logic doesn't distinguish them.
    const fourthPartyEmail = `integration-respond-fourth-${RUN_ID}@example.com`;
    const sent = await sendInvites(
      { brunchId, invitedById: hostId, emails: [fourthPartyEmail] },
      { db, eventBus },
    );
    expect(sent.isOk()).toBe(true);
    const invite = await db.brunchInvite.findFirstOrThrow({
      where: { brunchId, invitedEmail: fourthPartyEmail },
    });

    const result = await respondToInvite(
      { token: invite.token, viewerId: knownInviteeId, response: 'yes' },
      { db, eventBus },
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ brunchId });

    const knownInviteeAttendees = await db.brunchAttendee.findMany({
      where: { brunchId, userId: knownInviteeId },
    });
    expect(knownInviteeAttendees).toHaveLength(1);

    const fourthPartyAttendee = await db.brunchAttendee.findFirst({
      where: { inviteId: invite.id },
    });
    expect(fourthPartyAttendee).toBeNull();
  });
});
