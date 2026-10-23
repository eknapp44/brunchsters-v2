import type { DbClient } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryRateLimiter } from '../rateLimit/InMemoryRateLimiter';
import { RecordingRateLimiter } from '../rateLimit/RecordingRateLimiter';
import { cancelBrunch } from './cancelBrunch';

const BRUNCH_ID = 'brunch-uuid' as BrunchId;
const HOST_ID = 'host-uuid' as UserId;
const OTHER_ID = 'other-uuid' as UserId;
const NOW = new Date('2026-10-23T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

const brunchWith = (code: string, statusId = `status-${code}`) => ({
  id: BRUNCH_ID,
  hostId: HOST_ID,
  statusId,
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
  status: { code },
});

type Overrides = {
  readonly brunch?: unknown;
  readonly confirmedTime?: unknown;
  readonly updateMany?: ReturnType<typeof vi.fn>;
  readonly cancelledStatus?: unknown;
  readonly member?: boolean;
};

function makeMockDb(overrides: Overrides = {}) {
  const updateMany = overrides.updateMany ?? vi.fn().mockResolvedValue({ count: 1 });
  const tx = {
    brunchStatus: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          'cancelledStatus' in overrides ? overrides.cancelledStatus : { id: 'status-cancelled' },
        ),
    },
    brunch: { updateMany },
  };
  const db = {
    brunch: { findFirst: vi.fn().mockResolvedValue(overrides.brunch ?? brunchWith('active')) },
    brunchAttendee: {
      findFirst: vi.fn().mockResolvedValue(overrides.member === true ? { id: 'attendee' } : null),
    },
    brunchTime: { findFirst: vi.fn().mockResolvedValue(overrides.confirmedTime ?? null) },
    $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
  } as unknown as DbClient;
  return { db, updateMany };
}

const input = { brunchId: BRUNCH_ID, requestedById: HOST_ID, now: NOW };

describe('cancelBrunch', () => {
  it('calls an active brunch off, remembering what it was, and emits the event', async () => {
    const { db, updateMany } = makeMockDb();
    const emit = vi.fn().mockResolvedValue(undefined);

    const result = await cancelBrunch(input, {
      db,
      eventBus: { emit },
      rateLimiter: new InMemoryRateLimiter(),
    });

    expect(result._unsafeUnwrap()).toEqual({ brunchId: BRUNCH_ID, cancelledAt: NOW });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: BRUNCH_ID, statusId: 'status-active' },
      data: {
        statusId: 'status-cancelled',
        statusBeforeCancelId: 'status-active',
        cancelledAt: NOW,
        cancelledBy: HOST_ID,
        cancelNoticeSentAt: null,
      },
    });
    expect(emit).toHaveBeenCalledWith('brunch/cancelled', {
      brunchId: BRUNCH_ID,
      cancelledAt: NOW.toISOString(),
    });
  });

  it('calls off a confirmed brunch that has not happened yet', async () => {
    const { db } = makeMockDb({
      brunch: brunchWith('confirmed'),
      confirmedTime: { scheduledAt: new Date(NOW.getTime() + DAY) },
    });

    const result = await cancelBrunch(input, {
      db,
      eventBus: { emit: vi.fn() },
      rateLimiter: new InMemoryRateLimiter(),
    });

    expect(result.isOk()).toBe(true);
  });

  it('spends one unit of the host day, keyed by the host and not by the brunch', async () => {
    const { db } = makeMockDb();
    const rateLimiter = new RecordingRateLimiter();

    await cancelBrunch(input, { db, eventBus: { emit: vi.fn() }, rateLimiter });

    expect(rateLimiter.spends).toEqual([
      { policy: 'cancel-notices-host', subject: HOST_ID, cost: 1 },
    ]);
  });

  it('refuses a confirmed brunch that already happened, and charges nothing', async () => {
    const { db, updateMany } = makeMockDb({
      brunch: brunchWith('confirmed'),
      confirmedTime: { scheduledAt: new Date(NOW.getTime() - DAY) },
    });
    const rateLimiter = new RecordingRateLimiter();

    const result = await cancelBrunch(input, { db, eventBus: { emit: vi.fn() }, rateLimiter });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_over' });
    expect(rateLimiter.spends).toEqual([]);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('refuses a draft (it can only be deleted)', async () => {
    const { db, updateMany } = makeMockDb({ brunch: brunchWith('draft') });

    const result = await cancelBrunch(input, {
      db,
      eventBus: { emit: vi.fn() },
      rateLimiter: new InMemoryRateLimiter(),
    });

    expect(result._unsafeUnwrapErr()).toEqual({
      kind: 'invalid_transition',
      from: 'draft',
      to: 'cancelled',
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('refuses a brunch that is already called off, with the answer every other write gets', async () => {
    const { db, updateMany } = makeMockDb({ brunch: brunchWith('cancelled') });
    const rateLimiter = new RecordingRateLimiter();
    const emit = vi.fn();

    const result = await cancelBrunch(input, { db, eventBus: { emit }, rateLimiter });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_called_off' });
    expect(rateLimiter.spends).toEqual([]);
    expect(updateMany).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('tells an outsider the brunch does not exist, and a member who is not the host not_host', async () => {
    const outsider = makeMockDb({ member: false });
    const member = makeMockDb({ member: true });
    const context = (db: DbClient) => ({
      db,
      eventBus: { emit: vi.fn() },
      rateLimiter: new RecordingRateLimiter(),
    });

    const asOutsider = await cancelBrunch(
      { ...input, requestedById: OTHER_ID },
      context(outsider.db),
    );
    const asMember = await cancelBrunch({ ...input, requestedById: OTHER_ID }, context(member.db));

    expect(asOutsider._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
    expect(asMember._unsafeUnwrapErr()).toEqual({ kind: 'not_host' });
    expect(outsider.updateMany).not.toHaveBeenCalled();
    expect(member.updateMany).not.toHaveBeenCalled();
  });

  it('writes and emits nothing when the host day is spent', async () => {
    const { db, updateMany } = makeMockDb();
    const emit = vi.fn();

    const result = await cancelBrunch(input, {
      db,
      eventBus: { emit },
      rateLimiter: new RecordingRateLimiter({ refusePolicy: 'cancel-notices-host' }),
    });

    expect(result._unsafeUnwrapErr()).toEqual({
      kind: 'rate_limited',
      policy: 'cancel-notices-host',
      retryAfterSeconds: 321,
    });
    expect(updateMany).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('fails closed when the limiter cannot count', async () => {
    const { db, updateMany } = makeMockDb();

    const result = await cancelBrunch(input, {
      db,
      eventBus: { emit: vi.fn() },
      rateLimiter: new RecordingRateLimiter({ failWith: new Error('down') }),
    });

    expect(result._unsafeUnwrapErr().kind).toBe('rate_limiter_unavailable');
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('loses to whoever changed the status first: invalid_transition, nothing emitted', async () => {
    const { db } = makeMockDb({ updateMany: vi.fn().mockResolvedValue({ count: 0 }) });
    const emit = vi.fn();

    const result = await cancelBrunch(input, {
      db,
      eventBus: { emit },
      rateLimiter: new InMemoryRateLimiter(),
    });

    expect(result._unsafeUnwrapErr()).toEqual({
      kind: 'invalid_transition',
      from: 'active',
      to: 'cancelled',
    });
    expect(emit).not.toHaveBeenCalled();
  });

  it('reports lookup_not_found when the cancelled status row is missing', async () => {
    const { db } = makeMockDb({ cancelledStatus: null });

    const result = await cancelBrunch(input, {
      db,
      eventBus: { emit: vi.fn() },
      rateLimiter: new InMemoryRateLimiter(),
    });

    expect(result._unsafeUnwrapErr()).toEqual({
      kind: 'lookup_not_found',
      code: 'BrunchStatus:cancelled',
    });
  });

  it('still succeeds when the event cannot be queued', async () => {
    const { db } = makeMockDb();

    const result = await cancelBrunch(input, {
      db,
      eventBus: { emit: vi.fn().mockRejectedValue(new Error('queue down')) },
      rateLimiter: new InMemoryRateLimiter(),
    });

    expect(result.isOk()).toBe(true);
  });
});
