import type { DbClient } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import { reinstateBrunch } from './reinstateBrunch';

const BRUNCH_ID = 'brunch-uuid' as BrunchId;
const HOST_ID = 'host-uuid' as UserId;
const OTHER_ID = 'other-uuid' as UserId;
const input = { brunchId: BRUNCH_ID, requestedById: HOST_ID };

const calledOff = (before: string | null = 'status-confirmed') => ({
  id: BRUNCH_ID,
  hostId: HOST_ID,
  statusId: 'status-cancelled',
  statusBeforeCancelId: before,
  status: { code: 'cancelled' },
});

function makeMockDb(
  overrides: {
    readonly brunch?: unknown;
    readonly before?: unknown;
    readonly updateMany?: ReturnType<typeof vi.fn>;
    readonly member?: boolean;
    // When the confirmed time is; a day from now unless a test says otherwise.
    readonly scheduledAt?: Date | null;
  } = {},
) {
  const updateMany = overrides.updateMany ?? vi.fn().mockResolvedValue({ count: 1 });
  const db = {
    brunch: { findFirst: vi.fn().mockResolvedValue(overrides.brunch ?? calledOff()) },
    brunchAttendee: {
      findFirst: vi.fn().mockResolvedValue(overrides.member === true ? { id: 'a' } : null),
    },
    brunchTime: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          overrides.scheduledAt === null
            ? null
            : { scheduledAt: overrides.scheduledAt ?? new Date(Date.now() + 86_400_000) },
        ),
    },
    brunchStatus: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          'before' in overrides ? overrides.before : { id: 'status-confirmed', code: 'confirmed' },
        ),
    },
    $transaction: vi
      .fn()
      .mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
        fn({ brunch: { updateMany } }),
      ),
  } as unknown as DbClient;
  return { db, updateMany };
}

describe('reinstateBrunch', () => {
  it('puts the status back to what it was and emits the event', async () => {
    const { db, updateMany } = makeMockDb();
    const emit = vi.fn().mockResolvedValue(undefined);

    const result = await reinstateBrunch(input, { db, eventBus: { emit } });

    expect(result._unsafeUnwrap()).toEqual({ brunchId: BRUNCH_ID });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: BRUNCH_ID, statusId: 'status-cancelled' },
      data: { statusId: 'status-confirmed' },
    });
    expect(emit).toHaveBeenCalledWith('brunch/reinstated', { brunchId: BRUNCH_ID });
  });

  it('touches only the status: the cancel bookkeeping stays for the back-on email to read', async () => {
    const { db, updateMany } = makeMockDb();

    await reinstateBrunch(input, { db, eventBus: { emit: vi.fn() } });

    const call = updateMany.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(Object.keys(call.data)).toEqual(['statusId']);
  });

  it('refuses to bring back a confirmed brunch whose time has passed, and changes nothing', async () => {
    const now = new Date('2026-10-26T12:00:00.000Z');
    const { db, updateMany } = makeMockDb({ scheduledAt: new Date('2026-10-26T11:59:00.000Z') });
    const emit = vi.fn();

    const result = await reinstateBrunch({ ...input, now }, { db, eventBus: { emit } });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_over' });
    expect(updateMany).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('brings back one whose time is still ahead, however soon', async () => {
    const now = new Date('2026-10-26T12:00:00.000Z');
    const { db, updateMany } = makeMockDb({ scheduledAt: new Date('2026-10-26T12:01:00.000Z') });

    const result = await reinstateBrunch({ ...input, now }, { db, eventBus: { emit: vi.fn() } });

    expect(result.isOk()).toBe(true);
    expect(updateMany).toHaveBeenCalled();
  });

  it('does not look at the time for a brunch that was only active (it has none yet)', async () => {
    const { db } = makeMockDb({
      before: { id: 'status-active', code: 'active' },
      scheduledAt: new Date('2000-01-01T00:00:00.000Z'),
    });

    const result = await reinstateBrunch(input, { db, eventBus: { emit: vi.fn() } });

    expect(result.isOk()).toBe(true);
  });

  it('refuses a brunch that is not called off', async () => {
    const { db, updateMany } = makeMockDb({
      brunch: { ...calledOff(), status: { code: 'active' } },
    });

    const result = await reinstateBrunch(input, { db, eventBus: { emit: vi.fn() } });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'not_called_off' });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('has nothing to restore when the brunch was called off without a recorded status', async () => {
    const { db, updateMany } = makeMockDb({ brunch: calledOff(null) });

    const result = await reinstateBrunch(input, { db, eventBus: { emit: vi.fn() } });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'nothing_to_restore' });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('will not restore to a status the table does not allow (a draft is never cancelled)', async () => {
    const { db, updateMany } = makeMockDb({ before: { id: 'status-draft', code: 'draft' } });

    const result = await reinstateBrunch(input, { db, eventBus: { emit: vi.fn() } });

    expect(result._unsafeUnwrapErr()).toEqual({
      kind: 'invalid_transition',
      from: 'cancelled',
      to: 'draft',
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('tells an outsider the brunch does not exist, and a member who is not the host not_host', async () => {
    const outsider = makeMockDb({ member: false });
    const member = makeMockDb({ member: true });

    const asOutsider = await reinstateBrunch(
      { ...input, requestedById: OTHER_ID },
      { db: outsider.db, eventBus: { emit: vi.fn() } },
    );
    const asMember = await reinstateBrunch(
      { ...input, requestedById: OTHER_ID },
      { db: member.db, eventBus: { emit: vi.fn() } },
    );

    expect(asOutsider._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
    expect(asMember._unsafeUnwrapErr()).toEqual({ kind: 'not_host' });
  });

  it('loses to whoever changed the status first (two clicks, or a delete)', async () => {
    const { db } = makeMockDb({ updateMany: vi.fn().mockResolvedValue({ count: 0 }) });
    const emit = vi.fn();

    const result = await reinstateBrunch(input, { db, eventBus: { emit } });

    expect(result._unsafeUnwrapErr()).toEqual({
      kind: 'invalid_transition',
      from: 'cancelled',
      to: 'confirmed',
    });
    expect(emit).not.toHaveBeenCalled();
  });

  it('still succeeds when the event cannot be queued', async () => {
    const { db } = makeMockDb();

    const result = await reinstateBrunch(input, {
      db,
      eventBus: { emit: vi.fn().mockRejectedValue(new Error('queue down')) },
    });

    expect(result.isOk()).toBe(true);
  });
});
