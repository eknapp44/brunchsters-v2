import { createDb, type DbClient } from '@brunchsters/database';
import {
  normalizeEmail,
  type BrunchId,
  type BrunchLocationId,
  type BrunchTimeId,
  type InviteId,
  type InviteSuggestionId,
  type InviteToken,
  type UserId,
} from '@brunchsters/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getInviteByToken } from '../invite/getInviteByToken';
import { resendInvite } from '../invite/resendInvite';
import { respondToInvite } from '../invite/respondToInvite';
import { reviewInviteSuggestion } from '../invite/reviewInviteSuggestion';
import { revokeInvite } from '../invite/revokeInvite';
import { sendInvites } from '../invite/sendInvites';
import { suggestInvitee } from '../invite/suggestInvitee';
import { updateRsvp } from '../invite/updateRsvp';
import { InMemoryRateLimiter } from '../rateLimit/InMemoryRateLimiter';
import { castLocationBallot } from './castLocationBallot';
import { markCancelNoticeSent } from '../email/markCancelNoticeSent';
import { cancelBrunch } from './cancelBrunch';
import { confirmBrunch } from './confirmBrunch';
import { createBrunch } from './createBrunch';
import { deleteBrunch } from './deleteBrunch';
import { getBrunchById } from './getBrunchById';
import { getBrunchesForUser } from './getBrunchesForUser';
import { isBrunchMember } from './guards/isBrunchMember';
import { groupDashboard } from './presentation/groupDashboard';
import { reinstateBrunch } from './reinstateBrunch';
import { setBrunchHidden } from './setBrunchHidden';

// Spec 0013 (M3) on real Postgres: calling a brunch off and bringing it back restores everything,
// a cancel and a confirm cannot both clobber each other, a deleted brunch is indistinguishable from
// a made-up id, and hiding is one person's business. Requires: supabase start + seeded lookup
// tables (pnpm db:seed).
const RUN_ID = Date.now();
const email = (label: string): string => `integration-lifecycle-${label}-${RUN_ID}@example.com`;

const db = createDb();
const emit = vi.fn().mockResolvedValue(undefined);
const eventBus = { emit };
// A fresh limiter per test: the host's day allows only a few cancellations, and every test here
// cancels its own brunch.
let rateLimiter = new InMemoryRateLimiter();
beforeEach(() => {
  rateLimiter = new InMemoryRateLimiter();
});

const location = (label: string) => ({
  placeId: `place-lifecycle-${label}-${RUN_ID}`,
  placeName: `Cafe ${label}`,
  placeAddress: '1 Main St',
  placeUrl: 'https://maps.google.com/?cid=a',
  timezone: 'America/Chicago',
});
const inDays = (days: number): string =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

let hostId: UserId;
let memberId: UserId;
let outsiderId: UserId;
const createdBrunchIds: BrunchId[] = [];

beforeAll(async () => {
  const users = await Promise.all(
    ['host', 'member', 'outsider'].map((label) =>
      db.user.create({ data: { name: `Lifecycle ${label}`, email: email(label) } }),
    ),
  );
  [hostId, memberId, outsiderId] = users.map((user) => user.id as UserId) as [
    UserId,
    UserId,
    UserId,
  ];
});

afterAll(async () => {
  const where = { brunchId: { in: createdBrunchIds } };
  await db.brunchLocationVote.deleteMany({ where: { brunchLocation: where } });
  await db.brunchInviteSuggestion.deleteMany({ where });
  await db.brunchLocation.deleteMany({ where });
  await db.brunchTime.deleteMany({ where });
  await db.brunchAttendee.deleteMany({ where });
  await db.brunchInvite.deleteMany({ where });
  await db.brunch.deleteMany({ where: { id: { in: createdBrunchIds } } });
  await db.user.deleteMany({ where: { id: { in: [hostId, memberId, outsiderId] } } });
});

type Setup = {
  readonly brunchId: BrunchId;
  readonly strangerInviteId: InviteId;
  readonly strangerToken: InviteToken;
  readonly locationIds: readonly BrunchLocationId[];
  readonly timeIds: readonly BrunchTimeId[];
};

// A brunch with two places and two times, a member who said yes and voted, and a stranger with
// only a link; draft until invites go out, so `stage` says how far to take it.
async function setUp(params: { readonly stage: 'draft' | 'active' | 'confirmed' }): Promise<Setup> {
  const created = await createBrunch(
    {
      title: `Lifecycle ${params.stage}`,
      hostId,
      locations: [location('a'), location('b')],
      times: [{ scheduledAt: inDays(14) }, { scheduledAt: inDays(15) }],
    },
    { db, eventBus },
  );
  const brunchId = created._unsafeUnwrap().id;
  createdBrunchIds.push(brunchId);

  const locations = await db.brunchLocation.findMany({
    where: { brunchId },
    orderBy: { createdAt: 'asc' },
  });
  const times = await db.brunchTime.findMany({
    where: { brunchId },
    orderBy: { createdAt: 'asc' },
  });
  const locationIds = locations.map((row) => row.id as BrunchLocationId);
  const timeIds = times.map((row) => row.id as BrunchTimeId);

  const setup: Setup = {
    brunchId,
    strangerInviteId: '' as InviteId,
    strangerToken: '' as InviteToken,
    locationIds,
    timeIds,
  };
  if (params.stage === 'draft') return setup;

  const sent = await sendInvites(
    {
      brunchId,
      invitedById: hostId,
      emails: [normalizeEmail(email('member')), normalizeEmail(email('stranger'))],
    },
    { db, eventBus, rateLimiter },
  );
  const strangerInviteId = sent
    ._unsafeUnwrap()
    .find((invite) => invite.invitedEmail.includes('stranger'))?.id as InviteId;
  const strangerToken = (
    await db.brunchInvite.findFirstOrThrow({ where: { id: strangerInviteId } })
  ).token as InviteToken;
  (
    await updateRsvp({ brunchId, viewerId: memberId, response: 'yes' }, { db, eventBus })
  )._unsafeUnwrap();
  (
    await castLocationBallot(
      { brunchId, voterId: memberId, optionIds: [locationIds[0] as BrunchLocationId] },
      { db, eventBus },
    )
  )._unsafeUnwrap();

  if (params.stage === 'confirmed') {
    (
      await confirmBrunch(
        {
          brunchId,
          requestedById: hostId,
          locationId: locationIds[0] as BrunchLocationId,
          timeId: timeIds[0] as BrunchTimeId,
        },
        { db, eventBus },
      )
    )._unsafeUnwrap();
  }

  return { ...setup, strangerInviteId, strangerToken };
}

// Everything cancelling must leave alone: options (with their confirmed flags), votes, invites
// (with their tokens and expiry), attendees (with their answers).
async function dataThatMustSurvive(brunchId: BrunchId): Promise<unknown> {
  const [locations, times, votes, invites, attendees] = await Promise.all([
    db.brunchLocation.findMany({ where: { brunchId }, orderBy: { createdAt: 'asc' } }),
    db.brunchTime.findMany({ where: { brunchId }, orderBy: { createdAt: 'asc' } }),
    db.brunchLocationVote.findMany({
      where: { brunchLocation: { brunchId } },
      orderBy: { createdAt: 'asc' },
    }),
    db.brunchInvite.findMany({ where: { brunchId }, orderBy: { createdAt: 'asc' } }),
    db.brunchAttendee.findMany({ where: { brunchId }, orderBy: { createdAt: 'asc' } }),
  ]);
  return { locations, times, votes, invites, attendees };
}

async function statusOf(brunchId: BrunchId) {
  const brunch = await db.brunch.findFirstOrThrow({
    where: { id: brunchId },
    include: { status: true, statusBeforeCancel: true },
  });
  return {
    code: brunch.status.code,
    before: brunch.statusBeforeCancel?.code,
    cancelledAt: brunch.cancelledAt,
    cancelledBy: brunch.cancelledBy,
  };
}

// A db whose first `brunchTime.findFirst` first runs `beforeIt`: it lets one request read a
// brunch's status, another commit a change, and the first then write, with no timing luck. Used
// for cancelBrunch (which reads the confirmed time after reading the status).
function withHookBeforeTimeLookup(real: DbClient, beforeIt: () => Promise<void>): DbClient {
  let fired = false;
  return new Proxy(real, {
    get(target, property) {
      const value = (target as unknown as Record<PropertyKey, unknown>)[property];
      if (property === 'brunchTime') {
        return new Proxy(value as object, {
          get(delegate, method) {
            const member = (delegate as Record<PropertyKey, unknown>)[method];
            if (method !== 'findFirst') return member;
            return async (...args: unknown[]) => {
              if (!fired) {
                fired = true;
                await beforeIt();
              }
              return (member as (...a: unknown[]) => Promise<unknown>).apply(delegate, args);
            };
          },
        });
      }
      return typeof value === 'function'
        ? (value as (...a: unknown[]) => unknown).bind(target)
        : value;
    },
  });
}

// Same idea for confirmBrunch, which reads the options after reading the status.
function withHookBeforeLocationList(real: DbClient, beforeIt: () => Promise<void>): DbClient {
  let fired = false;
  return new Proxy(real, {
    get(target, property) {
      const value = (target as unknown as Record<PropertyKey, unknown>)[property];
      if (property === 'brunchLocation') {
        return new Proxy(value as object, {
          get(delegate, method) {
            const member = (delegate as Record<PropertyKey, unknown>)[method];
            if (method !== 'findMany') return member;
            return async (...args: unknown[]) => {
              if (!fired) {
                fired = true;
                await beforeIt();
              }
              return (member as (...a: unknown[]) => Promise<unknown>).apply(delegate, args);
            };
          },
        });
      }
      return typeof value === 'function'
        ? (value as (...a: unknown[]) => unknown).bind(target)
        : value;
    },
  });
}

describe('calling a brunch off and bringing it back (integration — real Postgres)', () => {
  it('restores a confirmed brunch exactly: options, votes, invites and answers are untouched', async () => {
    const { brunchId } = await setUp({ stage: 'confirmed' });
    const before = await dataThatMustSurvive(brunchId);
    emit.mockClear();

    const cancelled = await cancelBrunch(
      { brunchId, requestedById: hostId },
      { db, eventBus, rateLimiter },
    );
    expect(cancelled.isOk()).toBe(true);
    expect(await statusOf(brunchId)).toMatchObject({
      code: 'cancelled',
      before: 'confirmed',
      cancelledBy: hostId,
    });
    expect(await dataThatMustSurvive(brunchId)).toEqual(before);
    expect(emit).toHaveBeenCalledWith('brunch/cancelled', expect.objectContaining({ brunchId }));

    const restored = await reinstateBrunch({ brunchId, requestedById: hostId }, { db, eventBus });
    expect(restored.isOk()).toBe(true);
    const afterBringBack = await statusOf(brunchId);
    expect(afterBringBack).toMatchObject({ code: 'confirmed', cancelledBy: hostId });
    // The cancel bookkeeping stays: the back-on email reads it to know whether anyone was told.
    expect(afterBringBack.cancelledAt).not.toBeNull();
    expect(await dataThatMustSurvive(brunchId)).toEqual(before);
    expect(emit).toHaveBeenCalledWith('brunch/reinstated', { brunchId });
  });

  it('restores an active brunch to active, and a second cancel is refused while it is called off', async () => {
    const { brunchId } = await setUp({ stage: 'active' });

    (
      await cancelBrunch({ brunchId, requestedById: hostId }, { db, eventBus, rateLimiter })
    )._unsafeUnwrap();
    const again = await cancelBrunch(
      { brunchId, requestedById: hostId },
      { db, eventBus, rateLimiter },
    );
    expect(again._unsafeUnwrapErr()).toEqual({ kind: 'brunch_called_off' });
    const notCalledOff = await reinstateBrunch(
      { brunchId, requestedById: memberId },
      { db, eventBus },
    );
    expect(notCalledOff._unsafeUnwrapErr()).toEqual({ kind: 'not_host' });

    (await reinstateBrunch({ brunchId, requestedById: hostId }, { db, eventBus }))._unsafeUnwrap();
    expect((await statusOf(brunchId)).code).toBe('active');
    const twice = await reinstateBrunch({ brunchId, requestedById: hostId }, { db, eventBus });
    expect(twice._unsafeUnwrapErr()).toEqual({ kind: 'not_called_off' });
  });

  it('refuses a draft, and a confirmed brunch whose time has passed', async () => {
    const draft = await setUp({ stage: 'draft' });
    const over = await setUp({ stage: 'confirmed' });

    const draftResult = await cancelBrunch(
      { brunchId: draft.brunchId, requestedById: hostId },
      { db, eventBus, rateLimiter },
    );
    // "Now" is after the confirmed time: the brunch has happened.
    const overResult = await cancelBrunch(
      {
        brunchId: over.brunchId,
        requestedById: hostId,
        now: new Date(Date.now() + 30 * 86_400_000),
      },
      { db, eventBus, rateLimiter },
    );

    expect(draftResult._unsafeUnwrapErr()).toMatchObject({ kind: 'invalid_transition' });
    expect(overResult._unsafeUnwrapErr()).toEqual({ kind: 'brunch_over' });
    expect((await statusOf(draft.brunchId)).code).toBe('draft');
    expect((await statusOf(over.brunchId)).code).toBe('confirmed');
  });

  it('refuses every member write once it is really called off, then takes them again', async () => {
    const { brunchId } = await setUp({ stage: 'active' });
    (
      await cancelBrunch({ brunchId, requestedById: hostId }, { db, eventBus, rateLimiter })
    )._unsafeUnwrap();

    const rsvp = await updateRsvp(
      { brunchId, viewerId: memberId, response: 'no' },
      { db, eventBus },
    );
    expect(rsvp._unsafeUnwrapErr()).toEqual({ kind: 'brunch_called_off' });

    (await reinstateBrunch({ brunchId, requestedById: hostId }, { db, eventBus }))._unsafeUnwrap();
    const afterwards = await updateRsvp(
      { brunchId, viewerId: memberId, response: 'no' },
      { db, eventBus },
    );
    expect(afterwards.isOk()).toBe(true);
  });
});

describe('a cancel and a confirm cannot both win (E11)', () => {
  it('a cancel that read "active" loses when a confirm commits first, and does not clobber it', async () => {
    const { brunchId, locationIds, timeIds } = await setUp({ stage: 'active' });

    const racing = withHookBeforeTimeLookup(db, async () => {
      (
        await confirmBrunch(
          {
            brunchId,
            requestedById: hostId,
            locationId: locationIds[0] as BrunchLocationId,
            timeId: timeIds[0] as BrunchTimeId,
          },
          { db, eventBus },
        )
      )._unsafeUnwrap();
    });

    const result = await cancelBrunch(
      { brunchId, requestedById: hostId },
      { db: racing, eventBus, rateLimiter },
    );

    expect(result._unsafeUnwrapErr()).toEqual({
      kind: 'invalid_transition',
      from: 'active',
      to: 'cancelled',
    });
    const status = await statusOf(brunchId);
    expect(status).toMatchObject({ code: 'confirmed', cancelledAt: null });
    const confirmedLocations = await db.brunchLocation.count({
      where: { brunchId, isConfirmed: true },
    });
    expect(confirmedLocations).toBe(1);
  });

  it('a confirm that read "active" loses when a cancel commits first, and confirms nothing', async () => {
    const { brunchId, locationIds, timeIds } = await setUp({ stage: 'active' });

    const racing = withHookBeforeLocationList(db, async () => {
      (
        await cancelBrunch({ brunchId, requestedById: hostId }, { db, eventBus, rateLimiter })
      )._unsafeUnwrap();
    });

    const result = await confirmBrunch(
      {
        brunchId,
        requestedById: hostId,
        locationId: locationIds[0] as BrunchLocationId,
        timeId: timeIds[0] as BrunchTimeId,
      },
      { db: racing, eventBus },
    );

    expect(result._unsafeUnwrapErr()).toEqual({
      kind: 'invalid_transition',
      from: 'active',
      to: 'confirmed',
    });
    expect(await statusOf(brunchId)).toMatchObject({ code: 'cancelled', before: 'active' });
    // The failed confirm rolled back: no place or time was marked confirmed on a called-off brunch.
    expect(await db.brunchLocation.count({ where: { brunchId, isConfirmed: true } })).toBe(0);
    expect(await db.brunchTime.count({ where: { brunchId, isConfirmed: true } })).toBe(0);
  });
});

describe('deleting a brunch (integration — real Postgres)', () => {
  it('deletes a draft and a called-off brunch, and refuses a live one', async () => {
    const draft = await setUp({ stage: 'draft' });
    const live = await setUp({ stage: 'confirmed' });
    const off = await setUp({ stage: 'confirmed' });
    // Called off long enough ago that the guests have long since been told (or the grace is over).
    (
      await cancelBrunch(
        {
          brunchId: off.brunchId,
          requestedById: hostId,
          now: new Date(Date.now() - 3 * 3_600_000),
        },
        { db, eventBus, rateLimiter },
      )
    )._unsafeUnwrap();

    const liveResult = await deleteBrunch(
      { brunchId: live.brunchId, requestedById: hostId },
      { db },
    );
    const draftResult = await deleteBrunch(
      { brunchId: draft.brunchId, requestedById: hostId },
      { db },
    );
    const offResult = await deleteBrunch({ brunchId: off.brunchId, requestedById: hostId }, { db });

    expect(liveResult._unsafeUnwrapErr()).toEqual({
      kind: 'not_deletable',
      statusCode: 'confirmed',
    });
    expect(draftResult.isOk()).toBe(true);
    expect(offResult.isOk()).toBe(true);
    const row = await db.brunch.findFirst({ where: { id: off.brunchId } });
    // The soft-delete extension hides the row from findFirst; it is still in the table.
    expect(row).toBeNull();
    expect(await db.brunch.findUnique({ where: { id: off.brunchId } })).toMatchObject({
      deletedBy: hostId,
    });
    const second = await deleteBrunch({ brunchId: off.brunchId, requestedById: hostId }, { db });
    expect(second._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
  });

  it('makes a deleted brunch indistinguishable from a made-up id, for the host, a member and a link holder', async () => {
    const { brunchId, strangerInviteId, strangerToken } = await setUp({ stage: 'active' });
    const suggested = await suggestInvitee(
      { brunchId, suggestedById: memberId, email: normalizeEmail(email('suggested')) },
      { db, eventBus, rateLimiter },
    );
    const suggestionId = suggested._unsafeUnwrap().suggestionId as InviteSuggestionId;
    (
      await cancelBrunch(
        { brunchId, requestedById: hostId, now: new Date(Date.now() - 3 * 3_600_000) },
        { db, eventBus, rateLimiter },
      )
    )._unsafeUnwrap();
    (await deleteBrunch({ brunchId, requestedById: hostId }, { db }))._unsafeUnwrap();

    const madeUp = '00000000-0000-4000-8000-000000000000';
    const madeUpBrunch = madeUp as BrunchId;
    const madeUpInvite = madeUp as InviteId;
    const madeUpSuggestion = madeUp as InviteSuggestionId;

    // Each pair is "the deleted brunch" against "an id that never existed".
    const pairs: readonly (readonly [string, unknown, unknown])[] = [
      [
        'host reads the brunch',
        await getBrunchById({ brunchId, viewerId: hostId }, { db }),
        await getBrunchById({ brunchId: madeUpBrunch, viewerId: hostId }, { db }),
      ],
      [
        'member reads the brunch',
        await getBrunchById({ brunchId, viewerId: memberId }, { db }),
        await getBrunchById({ brunchId: madeUpBrunch, viewerId: memberId }, { db }),
      ],
      [
        'member RSVPs',
        (
          await updateRsvp({ brunchId, viewerId: memberId, response: 'no' }, { db, eventBus })
        )._unsafeUnwrapErr(),
        (
          await updateRsvp(
            { brunchId: madeUpBrunch, viewerId: memberId, response: 'no' },
            { db, eventBus },
          )
        )._unsafeUnwrapErr(),
      ],
      [
        'host sends invites',
        (
          await sendInvites(
            { brunchId, invitedById: hostId, emails: [normalizeEmail(email('x'))] },
            { db, eventBus, rateLimiter },
          )
        )._unsafeUnwrapErr(),
        (
          await sendInvites(
            { brunchId: madeUpBrunch, invitedById: hostId, emails: [normalizeEmail(email('x'))] },
            { db, eventBus, rateLimiter },
          )
        )._unsafeUnwrapErr(),
      ],
      [
        'host resends an invite',
        (
          await resendInvite(
            { inviteId: strangerInviteId, requestedById: hostId },
            { db, eventBus, rateLimiter },
          )
        )._unsafeUnwrapErr(),
        (
          await resendInvite(
            { inviteId: madeUpInvite, requestedById: hostId },
            { db, eventBus, rateLimiter },
          )
        )._unsafeUnwrapErr(),
      ],
      [
        'host revokes an invite',
        (
          await revokeInvite({ inviteId: strangerInviteId, requestedById: hostId }, { db })
        )._unsafeUnwrapErr(),
        (
          await revokeInvite({ inviteId: madeUpInvite, requestedById: hostId }, { db })
        )._unsafeUnwrapErr(),
      ],
      [
        'host reviews a suggestion',
        (
          await reviewInviteSuggestion(
            { suggestionId, reviewedById: hostId, decision: 'approve' },
            { db, eventBus, rateLimiter },
          )
        )._unsafeUnwrapErr(),
        (
          await reviewInviteSuggestion(
            { suggestionId: madeUpSuggestion, reviewedById: hostId, decision: 'approve' },
            { db, eventBus, rateLimiter },
          )
        )._unsafeUnwrapErr(),
      ],
      [
        'member suggests someone',
        (
          await suggestInvitee(
            { brunchId, suggestedById: memberId, email: normalizeEmail(email('y')) },
            { db, eventBus, rateLimiter },
          )
        )._unsafeUnwrapErr(),
        (
          await suggestInvitee(
            { brunchId: madeUpBrunch, suggestedById: memberId, email: normalizeEmail(email('y')) },
            { db, eventBus, rateLimiter },
          )
        )._unsafeUnwrapErr(),
      ],
      [
        'member hides it',
        (
          await setBrunchHidden({ brunchId, viewerId: memberId, hidden: true }, { db })
        )._unsafeUnwrapErr(),
        (
          await setBrunchHidden(
            { brunchId: madeUpBrunch, viewerId: memberId, hidden: true },
            { db },
          )
        )._unsafeUnwrapErr(),
      ],
      [
        'host cancels again',
        (
          await cancelBrunch({ brunchId, requestedById: hostId }, { db, eventBus, rateLimiter })
        )._unsafeUnwrapErr(),
        (
          await cancelBrunch(
            { brunchId: madeUpBrunch, requestedById: hostId },
            { db, eventBus, rateLimiter },
          )
        )._unsafeUnwrapErr(),
      ],
      [
        'host brings it back',
        (
          await reinstateBrunch({ brunchId, requestedById: hostId }, { db, eventBus })
        )._unsafeUnwrapErr(),
        (
          await reinstateBrunch({ brunchId: madeUpBrunch, requestedById: hostId }, { db, eventBus })
        )._unsafeUnwrapErr(),
      ],
      [
        'membership',
        await isBrunchMember({ brunchId, userId: memberId }, { db }),
        await isBrunchMember({ brunchId: madeUpBrunch, userId: memberId }, { db }),
      ],
    ];
    for (const [name, deleted, neverExisted] of pairs) {
      expect(deleted, name).toEqual(neverExisted);
    }

    // The link goes cold, signed in or out.
    expect(await getInviteByToken(strangerToken, { db })).toBeUndefined();
    const joined = await respondToInvite(
      { token: strangerToken, viewerId: outsiderId, response: 'yes' },
      { db, eventBus },
    );
    expect(joined._unsafeUnwrapErr()).toEqual({ kind: 'invalid_token' });

    // And it is on nobody's dashboard.
    for (const userId of [hostId, memberId]) {
      const dashboard = await getBrunchesForUser({ userId }, { db });
      expect(dashboard.map((row) => row.id)).not.toContain(brunchId);
    }
  });
});

describe('deleting a called-off brunch before its guests were told (integration — real Postgres)', () => {
  it('waits for the notice, then deletes: nobody is left never knowing it was off', async () => {
    const { brunchId } = await setUp({ stage: 'confirmed' });
    (
      await cancelBrunch({ brunchId, requestedById: hostId }, { db, eventBus, rateLimiter })
    )._unsafeUnwrap();

    // Just called off: the notice is still on hold, so the brunch cannot be deleted yet.
    const early = await deleteBrunch({ brunchId, requestedById: hostId }, { db });
    expect(early._unsafeUnwrapErr()).toEqual({ kind: 'notice_pending' });
    expect(await db.brunch.findFirst({ where: { id: brunchId } })).not.toBeNull();

    // The queue function tells the guests and records it; from then on deleting is allowed.
    const cancelledAt = (await db.brunch.findFirstOrThrow({ where: { id: brunchId } }))
      .cancelledAt as Date;
    (await markCancelNoticeSent({ brunchId, cancelledAt }, { db }))._unsafeUnwrap();
    const later = await deleteBrunch({ brunchId, requestedById: hostId }, { db });
    expect(later.isOk()).toBe(true);
  });

  it('does not trap the host forever when the notice never goes out', async () => {
    const { brunchId } = await setUp({ stage: 'active' });
    (
      await cancelBrunch({ brunchId, requestedById: hostId }, { db, eventBus, rateLimiter })
    )._unsafeUnwrap();

    // The same brunch, judged after the hold and the grace have both passed.
    const result = await deleteBrunch(
      { brunchId, requestedById: hostId, now: new Date(Date.now() + 2 * 3_600_000) },
      { db },
    );

    expect(result.isOk()).toBe(true);
  });
});

describe('hiding a brunch (integration — real Postgres)', () => {
  it('is one person alone: the host hides it, the member still sees it, and un-hiding returns it', async () => {
    const { brunchId } = await setUp({ stage: 'active' });
    const now = new Date();
    const ids = async (userId: UserId) =>
      groupDashboard(await getBrunchesForUser({ userId, now }, { db }), now);

    expect(
      (await setBrunchHidden({ brunchId, viewerId: hostId, hidden: true }, { db })).isOk(),
    ).toBe(true);

    const host = await ids(hostId);
    const member = await ids(memberId);
    expect(host.hidden.map((row) => row.id)).toContain(brunchId);
    expect([host.nextUp, ...host.upcoming, ...host.past].map((row) => row?.id)).not.toContain(
      brunchId,
    );
    expect([member.nextUp, ...member.upcoming, ...member.past].map((row) => row?.id)).toContain(
      brunchId,
    );
    expect(member.hidden.map((row) => row.id)).not.toContain(brunchId);
    expect((await getBrunchById({ brunchId, viewerId: hostId }, { db }))?.isHidden).toBe(true);
    expect((await getBrunchById({ brunchId, viewerId: memberId }, { db }))?.isHidden).toBe(false);

    (await setBrunchHidden({ brunchId, viewerId: hostId, hidden: false }, { db }))._unsafeUnwrap();
    const after = await ids(hostId);
    expect(after.hidden.map((row) => row.id)).not.toContain(brunchId);
    expect([after.nextUp, ...after.upcoming, ...after.past].map((row) => row?.id)).toContain(
      brunchId,
    );
  });

  it('works on a called-off brunch, and an outsider cannot hide what is not theirs', async () => {
    const { brunchId } = await setUp({ stage: 'active' });
    (
      await cancelBrunch({ brunchId, requestedById: hostId }, { db, eventBus, rateLimiter })
    )._unsafeUnwrap();

    const member = await setBrunchHidden({ brunchId, viewerId: memberId, hidden: true }, { db });
    const outsider = await setBrunchHidden(
      { brunchId, viewerId: outsiderId, hidden: true },
      { db },
    );

    expect(member.isOk()).toBe(true);
    expect(outsider._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
    expect(
      await db.brunchAttendee.findFirst({ where: { brunchId, userId: outsiderId } }),
    ).toBeNull();
  });
});
