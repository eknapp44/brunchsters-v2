import type { DbClient } from '@brunchsters/database';
import type { InviteId, UserId } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import type { EventBus } from '../events/EventBus';
import { resendInvite } from './resendInvite';
import { InMemoryRateLimiter } from '../rateLimit/InMemoryRateLimiter';
import { RecordingRateLimiter } from '../rateLimit/RecordingRateLimiter';

const HOST_ID = 'host-uuid' as UserId;
const INVITE_ID = 'invite-uuid' as InviteId;

const BASE_INVITE = {
  id: INVITE_ID,
  brunchId: 'brunch-uuid',
  brunch: { id: 'brunch-uuid', hostId: HOST_ID, status: { code: 'active' } },
};

function makeMockDb(
  overrides: {
    findFirst?: ReturnType<typeof vi.fn>;
    update?: ReturnType<typeof vi.fn>;
  } = {},
): DbClient {
  return {
    brunchInvite: {
      findFirst: overrides.findFirst ?? vi.fn().mockResolvedValue(BASE_INVITE),
      update: overrides.update ?? vi.fn().mockResolvedValue({ id: INVITE_ID }),
    },
  } as unknown as DbClient;
}

function makeMockEventBus(emit = vi.fn().mockResolvedValue(undefined)): EventBus {
  return { emit };
}

describe('resendInvite', () => {
  it('regenerates the token, extends expiry, and sets lastResentAt', async () => {
    const update = vi.fn().mockResolvedValue({ id: INVITE_ID });
    const db = makeMockDb({ update });

    const result = await resendInvite(
      { inviteId: INVITE_ID, requestedById: HOST_ID },
      { rateLimiter: new InMemoryRateLimiter(), db, eventBus: makeMockEventBus() },
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ id: INVITE_ID });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: INVITE_ID },
        data: expect.objectContaining({
          token: expect.any(String),
          tokenExpiresAt: expect.any(Date),
          lastResentAt: expect.any(Date),
        }),
      }),
    );
  });

  it('returns invite_not_found when the invite does not exist (or is revoked)', async () => {
    const db = makeMockDb({ findFirst: vi.fn().mockResolvedValue(null) });

    const result = await resendInvite(
      { inviteId: INVITE_ID, requestedById: HOST_ID },
      { rateLimiter: new InMemoryRateLimiter(), db, eventBus: makeMockEventBus() },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'invite_not_found' });
  });

  it('refuses a member who is not the host (they may know the brunch exists)', async () => {
    const db = makeMockDb();

    // Membership is looked up only on this path.
    Object.assign(db, {
      brunchAttendee: { findFirst: vi.fn().mockResolvedValue({ id: 'attendee-id' }) },
    });

    const result = await resendInvite(
      { inviteId: INVITE_ID, requestedById: 'someone-else-uuid' as UserId },
      { rateLimiter: new InMemoryRateLimiter(), db, eventBus: makeMockEventBus() },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'not_host' });
  });

  it('treats an outsider as if it does not exist (no 403 that confirms it is real)', async () => {
    const db = makeMockDb();

    // Membership is looked up only on this path.
    Object.assign(db, {
      brunchAttendee: { findFirst: vi.fn().mockResolvedValue(null) },
    });

    const result = await resendInvite(
      { inviteId: INVITE_ID, requestedById: 'someone-else-uuid' as UserId },
      { rateLimiter: new InMemoryRateLimiter(), db, eventBus: makeMockEventBus() },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'invite_not_found' });
  });

  it('returns db_error when the update fails', async () => {
    const db = makeMockDb({ update: vi.fn().mockRejectedValue(new Error('boom')) });

    const result = await resendInvite(
      { inviteId: INVITE_ID, requestedById: HOST_ID },
      { rateLimiter: new InMemoryRateLimiter(), db, eventBus: makeMockEventBus() },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'db_error', cause: expect.any(Error) });
  });

  it('still returns Ok when event emission fails', async () => {
    const db = makeMockDb();
    const eventBus = makeMockEventBus(vi.fn().mockRejectedValue(new Error('emit failed')));

    const result = await resendInvite(
      { inviteId: INVITE_ID, requestedById: HOST_ID },
      { rateLimiter: new InMemoryRateLimiter(), db, eventBus },
    );

    expect(result.isOk()).toBe(true);
  });

  it('emits invite/resent', async () => {
    const db = makeMockDb();
    const emit = vi.fn().mockResolvedValue(undefined);

    await resendInvite(
      { inviteId: INVITE_ID, requestedById: HOST_ID },
      { rateLimiter: new InMemoryRateLimiter(), db, eventBus: makeMockEventBus(emit) },
    );

    expect(emit).toHaveBeenCalledWith(
      'invite/resent',
      expect.objectContaining({ inviteId: INVITE_ID, brunchId: 'brunch-uuid' }),
    );
  });
});

describe('resendInvite — rate limits', () => {
  it("spends the per-invite cooldown, then one of the host's daily invite emails", async () => {
    const rateLimiter = new RecordingRateLimiter();

    const result = await resendInvite(
      { inviteId: INVITE_ID, requestedById: HOST_ID },
      { rateLimiter, db: makeMockDb(), eventBus: makeMockEventBus() },
    );

    expect(result.isOk()).toBe(true);
    expect(rateLimiter.spends).toEqual([
      { policy: 'resend-invite', subject: INVITE_ID, cost: 1 },
      { policy: 'invite-emails-host', subject: HOST_ID, cost: 1 },
    ]);
  });

  it.each([
    ['resend-invite', 1],
    ['invite-emails-host', 2],
  ])(
    'refuses when the %s budget is spent: the token is not changed and nothing is emailed',
    async (policy, spendsMade) => {
      const rateLimiter = new RecordingRateLimiter({ refusePolicy: policy });
      const update = vi.fn().mockResolvedValue({ id: INVITE_ID });
      const emit = vi.fn().mockResolvedValue(undefined);

      const result = await resendInvite(
        { inviteId: INVITE_ID, requestedById: HOST_ID },
        { rateLimiter, db: makeMockDb({ update }), eventBus: makeMockEventBus(emit) },
      );

      expect(result._unsafeUnwrapErr()).toEqual({
        kind: 'rate_limited',
        policy,
        retryAfterSeconds: 321,
      });
      expect(rateLimiter.spends).toHaveLength(spendsMade);
      expect(update).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    },
  );

  it('fails closed when the limiter cannot count: the token is not changed', async () => {
    const cause = new Error('database is down');
    const update = vi.fn().mockResolvedValue({ id: INVITE_ID });

    const result = await resendInvite(
      { inviteId: INVITE_ID, requestedById: HOST_ID },
      {
        rateLimiter: new RecordingRateLimiter({ failWith: cause }),
        db: makeMockDb({ update }),
        eventBus: makeMockEventBus(),
      },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'rate_limiter_unavailable', cause });
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    ['a member who is not the host', { id: 'attendee-id' }, 'not_host'],
    ['an outsider', null, 'invite_not_found'],
  ])('never reaches a budget that names the invite for %s', async (_who, attendee, kind) => {
    const rateLimiter = new RecordingRateLimiter();
    const db = makeMockDb();
    Object.assign(db, { brunchAttendee: { findFirst: vi.fn().mockResolvedValue(attendee) } });

    const result = await resendInvite(
      { inviteId: INVITE_ID, requestedById: 'someone-else-uuid' as UserId },
      { rateLimiter, db, eventBus: makeMockEventBus() },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind });
    expect(rateLimiter.spends).toEqual([]);
  });

  it('does not spend anything for an invite that does not exist', async () => {
    const rateLimiter = new RecordingRateLimiter();

    const result = await resendInvite(
      { inviteId: INVITE_ID, requestedById: HOST_ID },
      {
        rateLimiter,
        db: makeMockDb({ findFirst: vi.fn().mockResolvedValue(null) }),
        eventBus: makeMockEventBus(),
      },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'invite_not_found' });
    expect(rateLimiter.spends).toEqual([]);
  });
});

describe('resendInvite — a brunch that is not open', () => {
  it('refuses a called-off brunch: no budget spent, token unchanged, nothing emailed', async () => {
    const update = vi.fn().mockResolvedValue({ id: INVITE_ID });
    const db = makeMockDb({
      update,
      findFirst: vi.fn().mockResolvedValue({
        ...BASE_INVITE,
        brunch: { ...BASE_INVITE.brunch, status: { code: 'cancelled' } },
      }),
    });
    const rateLimiter = new RecordingRateLimiter();
    const emit = vi.fn().mockResolvedValue(undefined);

    const result = await resendInvite(
      { inviteId: INVITE_ID, requestedById: HOST_ID },
      { rateLimiter, db, eventBus: { emit } },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_called_off' });
    expect(rateLimiter.spends).toEqual([]);
    expect(update).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
});
