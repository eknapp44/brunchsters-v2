import { createDb } from '@brunchsters/database';
import {
  normalizeEmail,
  type BrunchId,
  type InviteId,
  type InviteSuggestionId,
  type InviteToken,
  type UserId,
} from '@brunchsters/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getInviteByToken } from '../invite/getInviteByToken';
import { resendInvite } from '../invite/resendInvite';
import { respondToInvite } from '../invite/respondToInvite';
import { reviewInviteSuggestion } from '../invite/reviewInviteSuggestion';
import { revokeInvite } from '../invite/revokeInvite';
import { sendInvites } from '../invite/sendInvites';
import { suggestInvitee } from '../invite/suggestInvitee';
import { updateRsvp } from '../invite/updateRsvp';
import { RecordingRateLimiter } from '../rateLimit/RecordingRateLimiter';
import { addLocation } from './addLocation';
import { confirmBrunch } from './confirmBrunch';
import { createBrunch } from './createBrunch';
import { suggestLocation } from './suggestLocation';
import { updateVotingDeadline } from './updateVotingDeadline';

// Spec 0013 (M2): a brunch whose status is set to `cancelled` directly in the database (nothing can
// call one off yet) takes no changes from any service, whoever asks, and tells an outsider nothing.
// The same brunch set back to `active` takes them again, which proves the refusals came from the
// status and nothing else. Requires: supabase start + seeded lookup tables (pnpm db:seed).
const RUN_ID = Date.now();
const email = (label: string): string => `integration-calledoff-${label}-${RUN_ID}@example.com`;

const db = createDb();
const emit = vi.fn().mockResolvedValue(undefined);
const eventBus = { emit };
const rateLimiter = new RecordingRateLimiter();

const LOCATION = {
  placeId: `place-calledoff-${RUN_ID}`,
  placeName: 'Cafe A',
  placeAddress: '1 Main St',
  placeUrl: 'https://maps.google.com/?cid=a',
  timezone: 'America/Chicago',
};
const OTHER_LOCATION = { ...LOCATION, placeId: `place-calledoff-b-${RUN_ID}`, placeName: 'Cafe B' };

let hostId: UserId;
let memberId: UserId;
let outsiderId: UserId;
let brunchId: BrunchId;
let strangerInviteId: InviteId;
let strangerToken: InviteToken;
let suggestionId: InviteSuggestionId;
let statusIds: { readonly active: string; readonly cancelled: string };

beforeAll(async () => {
  const users = await Promise.all(
    ['host', 'member', 'outsider'].map((label) =>
      db.user.create({ data: { name: `Called Off ${label}`, email: email(label) } }),
    ),
  );
  [hostId, memberId, outsiderId] = users.map((user) => user.id as UserId) as [
    UserId,
    UserId,
    UserId,
  ];

  const [active, cancelled] = await Promise.all([
    db.brunchStatus.findFirstOrThrow({ where: { code: 'active' } }),
    db.brunchStatus.findFirstOrThrow({ where: { code: 'cancelled' } }),
  ]);
  statusIds = { active: active.id, cancelled: cancelled.id };

  const created = await createBrunch(
    {
      title: 'Called off',
      hostId,
      locations: [LOCATION],
      times: [{ scheduledAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() }],
    },
    { db, eventBus },
  );
  brunchId = created._unsafeUnwrap().id;

  // The member (a known user, so they get an attendee row at once) and a stranger with only a link.
  const sent = await sendInvites(
    {
      brunchId,
      invitedById: hostId,
      emails: [normalizeEmail(email('member')), normalizeEmail(email('stranger'))],
    },
    { db, eventBus, rateLimiter },
  );
  const strangerSummary = sent
    ._unsafeUnwrap()
    .find((invite) => invite.invitedEmail.includes('stranger'));
  strangerInviteId = strangerSummary?.id as InviteId;
  strangerToken = (await db.brunchInvite.findFirstOrThrow({ where: { id: strangerInviteId } }))
    .token as InviteToken;

  const suggested = await suggestInvitee(
    { brunchId, suggestedById: memberId, email: normalizeEmail(email('suggested')) },
    { db, eventBus, rateLimiter },
  );
  suggestionId = suggested._unsafeUnwrap().suggestionId;
});

afterAll(async () => {
  await db.brunchInviteSuggestion.deleteMany({ where: { brunchId } });
  await db.brunchLocationSuggestion.deleteMany({ where: { brunchId } });
  await db.brunchLocation.deleteMany({ where: { brunchId } });
  await db.brunchTime.deleteMany({ where: { brunchId } });
  await db.brunchAttendee.deleteMany({ where: { brunchId } });
  await db.brunchInvite.deleteMany({ where: { brunchId } });
  await db.brunch.deleteMany({ where: { id: brunchId } });
  await db.user.deleteMany({ where: { id: { in: [hostId, memberId, outsiderId] } } });
});

async function setStatus(statusId: string): Promise<void> {
  await db.brunch.update({ where: { id: brunchId }, data: { statusId } });
}

// Everything a refused service must leave alone.
async function snapshot(): Promise<unknown> {
  const [invites, attendees, suggestions, locationSuggestions, brunch] = await Promise.all([
    db.brunchInvite.findMany({ where: { brunchId }, orderBy: { createdAt: 'asc' } }),
    db.brunchAttendee.findMany({ where: { brunchId }, orderBy: { createdAt: 'asc' } }),
    db.brunchInviteSuggestion.findMany({ where: { brunchId }, orderBy: { createdAt: 'asc' } }),
    db.brunchLocationSuggestion.findMany({ where: { brunchId } }),
    db.brunch.findFirstOrThrow({ where: { id: brunchId } }),
  ]);
  return { invites, attendees, suggestions, locationSuggestions, brunch };
}

describe('a called-off brunch takes no changes (integration — real Postgres)', () => {
  it('refuses every member write and changes nothing', async () => {
    await setStatus(statusIds.cancelled);
    const before = await snapshot();
    rateLimiter.spends.length = 0;
    emit.mockClear();

    const results = {
      rsvp: await updateRsvp({ brunchId, viewerId: memberId, response: 'no' }, { db, eventBus }),
      joinByLinkNewPerson: await respondToInvite(
        { token: strangerToken, viewerId: outsiderId, response: 'yes' },
        { db, eventBus },
      ),
      joinByLinkExistingMember: await respondToInvite(
        { token: strangerToken, viewerId: memberId, response: 'yes' },
        { db, eventBus },
      ),
      sendInvites: await sendInvites(
        { brunchId, invitedById: hostId, emails: [normalizeEmail(email('late'))] },
        { db, eventBus, rateLimiter },
      ),
      resend: await resendInvite(
        { inviteId: strangerInviteId, requestedById: hostId },
        { db, eventBus, rateLimiter },
      ),
      revoke: await revokeInvite({ inviteId: strangerInviteId, requestedById: hostId }, { db }),
      suggestInvitee: await suggestInvitee(
        { brunchId, suggestedById: memberId, email: normalizeEmail(email('another')) },
        { db, eventBus, rateLimiter },
      ),
      reviewApprove: await reviewInviteSuggestion(
        { suggestionId, reviewedById: hostId, decision: 'approve' },
        { db, eventBus, rateLimiter },
      ),
      reviewDecline: await reviewInviteSuggestion(
        { suggestionId, reviewedById: hostId, decision: 'decline' },
        { db, eventBus, rateLimiter },
      ),
      votingDeadline: await updateVotingDeadline(
        {
          brunchId,
          requestedById: hostId,
          votingDeadline: new Date(Date.now() + 86_400_000).toISOString(),
        },
        { db },
      ),
    };

    for (const [name, result] of Object.entries(results)) {
      expect(result._unsafeUnwrapErr(), name).toEqual({ kind: 'brunch_called_off' });
    }
    expect(await snapshot()).toEqual(before);
    // No budget spent and nothing queued: a refused write costs nothing and emails nobody.
    expect(rateLimiter.spends).toEqual([]);
    expect(emit).not.toHaveBeenCalled();
  });

  it('keeps refusing through the services that already required an active brunch', async () => {
    await setStatus(statusIds.cancelled);

    const [confirm, add, suggest] = await Promise.all([
      confirmBrunch(
        {
          brunchId,
          requestedById: hostId,
          locationId: (await db.brunchLocation.findFirstOrThrow({ where: { brunchId } }))
            .id as never,
          timeId: (await db.brunchTime.findFirstOrThrow({ where: { brunchId } })).id as never,
        },
        { db, eventBus },
      ),
      addLocation({ brunchId, requestedById: hostId, location: OTHER_LOCATION }, { db }),
      suggestLocation(
        { brunchId, suggestedById: memberId, location: OTHER_LOCATION },
        { db, eventBus },
      ),
    ]);

    expect(confirm._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_active' });
    expect(add._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_active' });
    expect(suggest._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_active' });
    const brunch = await db.brunch.findFirstOrThrow({
      where: { id: brunchId },
      include: { status: true },
    });
    expect(brunch.status.code).toBe('cancelled');
  });

  it('tells an outsider nothing: the same answer as for a brunch that does not exist', async () => {
    await setStatus(statusIds.cancelled);

    const rsvp = await updateRsvp(
      { brunchId, viewerId: outsiderId, response: 'yes' },
      { db, eventBus },
    );
    const suggest = await suggestInvitee(
      { brunchId, suggestedById: outsiderId, email: normalizeEmail(email('nope')) },
      { db, eventBus, rateLimiter },
    );
    const send = await sendInvites(
      { brunchId, invitedById: outsiderId, emails: [normalizeEmail(email('nope2'))] },
      { db, eventBus, rateLimiter },
    );

    expect(rsvp._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
    expect(suggest._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
    expect(send._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
  });

  it('tells a member who is not the host not_host, not that the brunch is called off', async () => {
    await setStatus(statusIds.cancelled);

    const send = await sendInvites(
      { brunchId, invitedById: memberId, emails: [normalizeEmail(email('nope3'))] },
      { db, eventBus, rateLimiter },
    );

    expect(send._unsafeUnwrapErr()).toEqual({ kind: 'not_host' });
  });

  it('shows a link holder that the brunch was called off, without joining them', async () => {
    await setStatus(statusIds.cancelled);

    const preview = await getInviteByToken(strangerToken, { db });

    expect(preview).toMatchObject({ isCalledOff: true, hostName: 'Called Off host' });
    expect(
      await db.brunchAttendee.findFirst({ where: { brunchId, userId: outsiderId } }),
    ).toBeNull();
  });

  it('takes the same writes again once the status is active (the refusals came from the status)', async () => {
    await setStatus(statusIds.active);

    const rsvp = await updateRsvp(
      { brunchId, viewerId: memberId, response: 'maybe' },
      { db, eventBus },
    );
    const preview = await getInviteByToken(strangerToken, { db });

    expect(rsvp.isOk()).toBe(true);
    expect(preview?.isCalledOff).toBe(false);
  });
});
