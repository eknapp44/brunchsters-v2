import { createDb } from '@brunchsters/database';
import {
  normalizeEmail,
  type BrunchId,
  type InviteId,
  type InviteToken,
  type UserId,
} from '@brunchsters/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signInWithProvider } from '../auth/signInWithProvider';
import { NoopEventBus } from '../events/NoopEventBus';
import { createBrunch } from '../brunch/createBrunch';
import { getInviteByToken } from './getInviteByToken';
import { getInvitesForBrunch } from './getInvitesForBrunch';
import { resendInvite } from './resendInvite';
import { respondToInvite } from './respondToInvite';
import { revokeInvite } from './revokeInvite';
import { sendInvites, sendInvitesRequestSchema } from './sendInvites';

// Requires: supabase start + seeded lookup tables (pnpm db:seed).
const RUN_ID = Date.now();
const HOST_EMAIL = normalizeEmail(`integration-invite-host-${RUN_ID}@example.com`);
const KNOWN_INVITEE_EMAIL = normalizeEmail(`integration-invite-known-${RUN_ID}@example.com`);
const UNREGISTERED_INVITEE_EMAIL = normalizeEmail(`integration-invite-new-${RUN_ID}@example.com`);

const db = createDb();
const eventBus = new NoopEventBus();

let hostId: UserId;
let knownInviteeId: UserId;
let brunchId: BrunchId;
const createdBrunchIds: string[] = [];

beforeAll(async () => {
  const host = await db.user.create({
    data: { name: 'Integration Invite Host', email: HOST_EMAIL },
  });
  hostId = host.id as UserId;

  const knownInvitee = await db.user.create({
    data: { name: 'Integration Known Invitee', email: KNOWN_INVITEE_EMAIL },
  });
  knownInviteeId = knownInvitee.id as UserId;

  const brunch = await createBrunch(
    { title: 'Integration Invite Brunch', locations: [], times: [], hostId },
    { db, eventBus },
  );
  expect(brunch.isOk()).toBe(true);
  brunchId = brunch._unsafeUnwrap().id;
  createdBrunchIds.push(brunchId);
});

afterAll(async () => {
  await db.brunchAttendee.deleteMany({ where: { brunchId: { in: createdBrunchIds } } });
  await db.brunchInvite.deleteMany({ where: { brunchId: { in: createdBrunchIds } } });
  await db.brunch.deleteMany({ where: { id: { in: createdBrunchIds } } });
  await db.user.deleteMany({
    where: { email: { in: [HOST_EMAIL, KNOWN_INVITEE_EMAIL, UNREGISTERED_INVITEE_EMAIL] } },
  });
});

describe('sendInvites integration', () => {
  it('sends invites to a known user and an unregistered email, transitioning the brunch to active', async () => {
    const brunchBefore = await db.brunch.findFirst({
      where: { id: brunchId },
      include: { status: true },
    });
    expect(brunchBefore?.status.code).toBe('draft');

    const result = await sendInvites(
      { brunchId, invitedById: hostId, emails: [KNOWN_INVITEE_EMAIL, UNREGISTERED_INVITEE_EMAIL] },
      { db, eventBus },
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toHaveLength(2);

    const brunchAfter = await db.brunch.findFirst({
      where: { id: brunchId },
      include: { status: true },
    });
    expect(brunchAfter?.status.code).toBe('active');

    const knownInvite = await db.brunchInvite.findFirst({
      where: { brunchId, invitedEmail: KNOWN_INVITEE_EMAIL },
    });
    expect(knownInvite?.invitedUserId).toBe(knownInviteeId);

    const knownAttendee = await db.brunchAttendee.findFirst({
      where: { brunchId, userId: knownInviteeId },
      include: { rsvpStatus: true },
    });
    expect(knownAttendee?.rsvpStatus.code).toBe('invited');

    const unregisteredInvite = await db.brunchInvite.findFirst({
      where: { brunchId, invitedEmail: UNREGISTERED_INVITEE_EMAIL },
    });
    expect(unregisteredInvite?.invitedUserId).toBeNull();

    const unregisteredAttendee = await db.brunchAttendee.findFirst({
      where: { brunchId, invite: { invitedEmail: UNREGISTERED_INVITEE_EMAIL } },
    });
    expect(unregisteredAttendee).toBeNull();
  });

  it('resending the same email updates the same row instead of creating a duplicate', async () => {
    const before = await db.brunchInvite.findFirst({
      where: { brunchId, invitedEmail: KNOWN_INVITEE_EMAIL },
    });
    expect(before).not.toBeNull();

    const result = await sendInvites(
      { brunchId, invitedById: hostId, emails: [KNOWN_INVITEE_EMAIL] },
      { db, eventBus },
    );

    expect(result.isOk()).toBe(true);
    const matchingInvites = await db.brunchInvite.findMany({
      where: { brunchId, invitedEmail: KNOWN_INVITEE_EMAIL },
    });
    expect(matchingInvites).toHaveLength(1);
    expect(matchingInvites[0]?.id).toBe(before?.id);
    expect(matchingInvites[0]?.lastResentAt).not.toBeNull();
  });

  it('getInvitesForBrunch reflects both invites and excludes the synthetic host invite', async () => {
    const result = await getInvitesForBrunch({ brunchId, requestedById: hostId }, { db });

    expect(result.isOk()).toBe(true);
    const emails = result._unsafeUnwrap().map((invite) => invite.invitedEmail);
    expect(emails).toEqual(
      expect.arrayContaining([KNOWN_INVITEE_EMAIL, UNREGISTERED_INVITEE_EMAIL]),
    );
    expect(emails).not.toContain(HOST_EMAIL);
  });

  it('getInviteByToken returns the brunch preview for the unregistered invitee token', async () => {
    const invite = await db.brunchInvite.findFirstOrThrow({
      where: { brunchId, invitedEmail: UNREGISTERED_INVITEE_EMAIL },
    });

    const preview = await getInviteByToken(invite.token as InviteToken, { db });

    expect(preview).toEqual({
      brunchTitle: 'Integration Invite Brunch',
      hostName: 'Integration Invite Host',
      description: undefined,
      brunchStatusLabel: 'Active',
    });
  });

  it('resendInvite regenerates the token, invalidating the old one', async () => {
    const invite = await db.brunchInvite.findFirstOrThrow({
      where: { brunchId, invitedEmail: UNREGISTERED_INVITEE_EMAIL },
    });
    const oldToken = invite.token as InviteToken;

    const result = await resendInvite(
      { inviteId: invite.id as InviteId, requestedById: hostId },
      { db, eventBus },
    );

    expect(result.isOk()).toBe(true);
    expect(await getInviteByToken(oldToken, { db })).toBeUndefined();

    const refreshed = await db.brunchInvite.findFirstOrThrow({ where: { id: invite.id } });
    expect(refreshed.token).not.toBe(oldToken);
  });

  it('revokeInvite soft-deletes the invite and getInviteByToken stops returning it', async () => {
    const invite = await db.brunchInvite.findFirstOrThrow({
      where: { brunchId, invitedEmail: UNREGISTERED_INVITEE_EMAIL },
    });

    const result = await revokeInvite(
      { inviteId: invite.id as InviteId, requestedById: hostId },
      { db },
    );

    expect(result.isOk()).toBe(true);
    expect(await getInviteByToken(invite.token as InviteToken, { db })).toBeUndefined();

    const revoked = await db.brunchInvite.findUniqueOrThrow({ where: { id: invite.id } });
    expect(revoked.deletedAt).not.toBeNull();
  });

  it("revokeInvite also soft-deletes a known-user invitee's eagerly-created attendee row, so they lose brunch access too", async () => {
    const invite = await db.brunchInvite.findFirstOrThrow({
      where: { brunchId, invitedEmail: KNOWN_INVITEE_EMAIL },
    });
    const attendeeBefore = await db.brunchAttendee.findUniqueOrThrow({
      where: { inviteId: invite.id },
    });
    expect(attendeeBefore.deletedAt).toBeNull();

    const result = await revokeInvite(
      { inviteId: invite.id as InviteId, requestedById: hostId },
      { db },
    );

    expect(result.isOk()).toBe(true);
    const attendeeAfter = await db.brunchAttendee.findUniqueOrThrow({
      where: { inviteId: invite.id },
    });
    expect(attendeeAfter.deletedAt).not.toBeNull();

    // Access-check queries use findFirst, which the soft-delete extension
    // filters — the revoked invitee's attendee row must no longer surface.
    const liveAttendee = await db.brunchAttendee.findFirst({
      where: { brunchId, userId: knownInviteeId },
    });
    expect(liveAttendee).toBeNull();
  });

  it('re-inviting a revoked known-user invitee revives their attendee row instead of leaving it soft-deleted and colliding with respondToInvite', async () => {
    const before = await db.brunchInvite.findUniqueOrThrow({
      where: { brunchId_invitedEmail: { brunchId, invitedEmail: KNOWN_INVITEE_EMAIL } },
    });
    expect(before.deletedAt).not.toBeNull(); // revoked by the previous test

    const attendeeBefore = await db.brunchAttendee.findUniqueOrThrow({
      where: { inviteId: before.id },
    });
    expect(attendeeBefore.deletedAt).not.toBeNull();

    const result = await sendInvites(
      { brunchId, invitedById: hostId, emails: [KNOWN_INVITEE_EMAIL] },
      { db, eventBus },
    );
    expect(result.isOk()).toBe(true);

    const revivedInvite = await db.brunchInvite.findUniqueOrThrow({
      where: { brunchId_invitedEmail: { brunchId, invitedEmail: KNOWN_INVITEE_EMAIL } },
    });
    expect(revivedInvite.id).toBe(before.id);
    expect(revivedInvite.deletedAt).toBeNull();

    // The attendee row must be the same (revived) row, not left soft-deleted —
    // otherwise respondToInvite's create() below would violate the unique
    // constraint on inviteId/[brunchId, userId].
    const revivedAttendee = await db.brunchAttendee.findUniqueOrThrow({
      where: { inviteId: revivedInvite.id },
    });
    expect(revivedAttendee.id).toBe(attendeeBefore.id);
    expect(revivedAttendee.deletedAt).toBeNull();

    const respondResult = await respondToInvite(
      { token: revivedInvite.token as InviteToken, response: 'yes', viewerId: knownInviteeId },
      { db, eventBus },
    );
    expect(respondResult.isOk()).toBe(true);

    const finalAttendee = await db.brunchAttendee.findUniqueOrThrow({
      where: { inviteId: revivedInvite.id },
      include: { rsvpStatus: true },
    });
    expect(finalAttendee.id).toBe(attendeeBefore.id);
    expect(finalAttendee.rsvpStatus.code).toBe('yes');
  });

  it('resendInvite and revokeInvite both report invite_not_found for an already-revoked invite (real soft-delete filtering, not just a mock)', async () => {
    const invite = await db.brunchInvite.findUniqueOrThrow({
      where: { brunchId_invitedEmail: { brunchId, invitedEmail: UNREGISTERED_INVITEE_EMAIL } },
    });
    expect(invite.deletedAt).not.toBeNull(); // revoked by the previous test

    const resendResult = await resendInvite(
      { inviteId: invite.id as InviteId, requestedById: hostId },
      { db, eventBus },
    );
    expect(resendResult.isErr()).toBe(true);
    expect(resendResult._unsafeUnwrapErr()).toEqual({ kind: 'invite_not_found' });

    const revokeResult = await revokeInvite(
      { inviteId: invite.id as InviteId, requestedById: hostId },
      { db },
    );
    expect(revokeResult.isErr()).toBe(true);
    expect(revokeResult._unsafeUnwrapErr()).toEqual({ kind: 'invite_not_found' });
  });

  it('re-inviting the revoked email revives the same row instead of violating the unique constraint', async () => {
    const before = await db.brunchInvite.findUniqueOrThrow({
      where: { brunchId_invitedEmail: { brunchId, invitedEmail: UNREGISTERED_INVITEE_EMAIL } },
    });
    expect(before.deletedAt).not.toBeNull();

    const result = await sendInvites(
      { brunchId, invitedById: hostId, emails: [UNREGISTERED_INVITEE_EMAIL] },
      { db, eventBus },
    );

    expect(result.isOk()).toBe(true);
    const after = await db.brunchInvite.findUniqueOrThrow({
      where: { brunchId_invitedEmail: { brunchId, invitedEmail: UNREGISTERED_INVITEE_EMAIL } },
    });
    expect(after.id).toBe(before.id);
    expect(after.deletedAt).toBeNull();
  });

  it("filters out the host's own email instead of rejecting the whole batch", async () => {
    const anotherNewEmail = normalizeEmail(`integration-invite-self-filter-${RUN_ID}@example.com`);

    const result = await sendInvites(
      { brunchId, invitedById: hostId, emails: [HOST_EMAIL, anotherNewEmail] },
      { db, eventBus },
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([
      { id: expect.any(String), invitedEmail: anotherNewEmail },
    ]);

    await db.brunchAttendee.deleteMany({
      where: { brunchId, invite: { invitedEmail: anotherNewEmail } },
    });
    await db.brunchInvite.deleteMany({ where: { brunchId, invitedEmail: anotherNewEmail } });
  });

  it('rejects a non-host sender', async () => {
    const result = await sendInvites(
      { brunchId, invitedById: knownInviteeId, emails: [normalizeEmail('someone@example.com')] },
      { db, eventBus },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'not_host' });
  });

  // ADR 0008: one address is one person, however it is capitalized. Found by the e2e suite —
  // inviting `Case-X@Example.com` and then `case-x@example.com` used to create two invites.
  it('one address typed in two cases is one invite, not two', async () => {
    const typedFirst = `Case-${RUN_ID}@Example.com`;
    const typedLater = `case-${RUN_ID}@example.com`;
    const first = sendInvitesRequestSchema.parse({ emails: [typedFirst] });
    const later = sendInvitesRequestSchema.parse({ emails: [typedLater] });

    const sentFirst = await sendInvites(
      { brunchId, invitedById: hostId, emails: first.emails },
      { db, eventBus },
    );
    const sentLater = await sendInvites(
      { brunchId, invitedById: hostId, emails: later.emails },
      { db, eventBus },
    );

    // The second request refreshed the existing invite instead of creating another.
    expect(sentLater._unsafeUnwrap()[0]?.id).toBe(sentFirst._unsafeUnwrap()[0]?.id);
    const rows = await db.brunchInvite.findMany({
      where: { brunchId, invitedEmail: { equals: typedLater, mode: 'insensitive' } },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.invitedEmail).toBe(typedLater);

    await db.brunchInvite.deleteMany({ where: { brunchId, invitedEmail: typedLater } });
  });

  it('an invite finds an existing account however the invited address is capitalized', async () => {
    // Google reported a capitalized address; the account is stored normalized.
    const providerEmail = `Capital-${RUN_ID}@Example.com`;
    const signedIn = await signInWithProvider({
      provider: 'google',
      providerUserId: `google-case-${RUN_ID}`,
      email: providerEmail,
      name: 'Capital Address',
      avatarUrl: undefined,
      db,
    });
    const accountId = signedIn._unsafeUnwrap().userId;
    const stored = await db.user.findFirst({ where: { id: accountId } });
    expect(stored?.email).toBe(providerEmail.toLowerCase());

    // The host types it in yet another case: it is still the same person (the known-user path).
    const invited = sendInvitesRequestSchema.parse({ emails: [`CAPITAL-${RUN_ID}@example.COM`] });
    const sent = await sendInvites(
      { brunchId, invitedById: hostId, emails: invited.emails },
      { db, eventBus },
    );
    expect(sent.isOk()).toBe(true);

    const invite = await db.brunchInvite.findFirst({
      where: { brunchId, invitedEmail: providerEmail.toLowerCase() },
    });
    expect(invite?.invitedUserId).toBe(accountId);
    // Known users get their attendee row immediately, so the brunch shows on their dashboard.
    const attendee = await db.brunchAttendee.findFirst({ where: { brunchId, userId: accountId } });
    expect(attendee).not.toBeNull();

    await db.brunchAttendee.deleteMany({ where: { brunchId, userId: accountId } });
    await db.brunchInvite.deleteMany({
      where: { brunchId, invitedEmail: providerEmail.toLowerCase() },
    });
    await db.userAuthProvider.deleteMany({ where: { userId: accountId } });
    await db.user.deleteMany({ where: { id: accountId } });
  });
});
