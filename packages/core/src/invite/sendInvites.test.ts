import type { DbClient } from '@brunchsters/database';
import type { BrunchId, UserId } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import type { EventBus } from '../events/EventBus';
import { sendInvites, sendInvitesRequestSchema, type SendInvitesInput } from './sendInvites';

const BRUNCH_ID = 'brunch-uuid' as BrunchId;
const HOST_ID = 'host-uuid' as UserId;

const DRAFT_BRUNCH = {
  id: BRUNCH_ID,
  hostId: HOST_ID,
  status: { id: 'status-draft', code: 'draft' },
  host: { id: HOST_ID, email: 'host@example.com' },
};

const ACTIVE_BRUNCH = {
  ...DRAFT_BRUNCH,
  status: { id: 'status-active', code: 'active' },
};

type MockTx = {
  rsvpStatus: { findFirst: ReturnType<typeof vi.fn> };
  brunchInvite: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  user: { findFirst: ReturnType<typeof vi.fn> };
  brunchAttendee: { create: ReturnType<typeof vi.fn> };
  brunchStatus: { findFirst: ReturnType<typeof vi.fn> };
  brunch: { update: ReturnType<typeof vi.fn> };
};

function makeMockTx(overrides: Partial<MockTx> = {}): MockTx {
  return {
    rsvpStatus: { findFirst: vi.fn().mockResolvedValue({ id: 'rsvp-invited', code: 'invited' }) },
    brunchInvite: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi
        .fn()
        .mockImplementation(
          ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
            Promise.resolve({ id: where.id, invitedEmail: 'revived@example.com', ...data }),
        ),
      create: vi
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: 'new-invite-uuid', ...data }),
        ),
    },
    user: { findFirst: vi.fn().mockResolvedValue(null) },
    brunchAttendee: { create: vi.fn().mockResolvedValue({}) },
    brunchStatus: { findFirst: vi.fn().mockResolvedValue({ id: 'status-active' }) },
    brunch: { update: vi.fn().mockResolvedValue({}) },
    ...overrides,
  };
}

function makeMockDb(tx: MockTx, brunch: unknown = DRAFT_BRUNCH): DbClient {
  return {
    brunch: { findFirst: vi.fn().mockResolvedValue(brunch) },
    $transaction: vi.fn().mockImplementation((fn: (tx: MockTx) => Promise<unknown>) => fn(tx)),
  } as unknown as DbClient;
}

function makeMockEventBus(emit = vi.fn().mockResolvedValue(undefined)): EventBus {
  return { emit };
}

const BASE_INPUT: SendInvitesInput = {
  brunchId: BRUNCH_ID,
  invitedById: HOST_ID,
  emails: ['alice@example.com'],
};

describe('sendInvites', () => {
  it('creates a new invite with no attendee for an unregistered email', async () => {
    const tx = makeMockTx();
    const db = makeMockDb(tx);

    const result = await sendInvites(BASE_INPUT, { db, eventBus: makeMockEventBus() });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([
      { id: 'new-invite-uuid', invitedEmail: 'alice@example.com' },
    ]);
    expect(tx.brunchInvite.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ invitedUserId: null, invitedEmail: 'alice@example.com' }),
      }),
    );
    expect(tx.brunchAttendee.create).not.toHaveBeenCalled();
  });

  it('creates an invite and an eager attendee row for an already-registered email', async () => {
    const tx = makeMockTx({
      user: {
        findFirst: vi.fn().mockResolvedValue({ id: 'alice-uuid', email: 'alice@example.com' }),
      },
    });
    const db = makeMockDb(tx);

    const result = await sendInvites(BASE_INPUT, { db, eventBus: makeMockEventBus() });

    expect(result.isOk()).toBe(true);
    expect(tx.brunchInvite.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ invitedUserId: 'alice-uuid' }) }),
    );
    expect(tx.brunchAttendee.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'alice-uuid', rsvpStatusId: 'rsvp-invited' }),
      }),
    );
  });

  it('resends instead of duplicating when an active invite already exists for the email', async () => {
    const tx = makeMockTx({
      brunchInvite: {
        findUnique: vi.fn().mockResolvedValue({ id: 'existing-invite-uuid' }),
        update: vi
          .fn()
          .mockResolvedValue({ id: 'existing-invite-uuid', invitedEmail: 'alice@example.com' }),
        create: vi.fn(),
      },
    });
    const db = makeMockDb(tx);

    const result = await sendInvites(BASE_INPUT, { db, eventBus: makeMockEventBus() });

    expect(result.isOk()).toBe(true);
    expect(tx.brunchInvite.create).not.toHaveBeenCalled();
    expect(tx.brunchInvite.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'existing-invite-uuid' },
        data: expect.objectContaining({ deletedAt: null, deletedBy: null }),
      }),
    );
  });

  it('revives a soft-deleted (revoked) invite via the same resend path', async () => {
    const tx = makeMockTx({
      brunchInvite: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: 'revoked-invite-uuid', deletedAt: new Date('2026-01-01') }),
        update: vi
          .fn()
          .mockResolvedValue({ id: 'revoked-invite-uuid', invitedEmail: 'alice@example.com' }),
        create: vi.fn(),
      },
    });
    const db = makeMockDb(tx);

    const result = await sendInvites(BASE_INPUT, { db, eventBus: makeMockEventBus() });

    expect(result.isOk()).toBe(true);
    const [updateArgs] = tx.brunchInvite.update.mock.calls[0] as [{ data: { deletedAt: unknown } }];
    expect(updateArgs.data.deletedAt).toBeNull();
  });

  it('transitions the brunch from draft to active on send', async () => {
    const tx = makeMockTx();
    const db = makeMockDb(tx, DRAFT_BRUNCH);

    await sendInvites(BASE_INPUT, { db, eventBus: makeMockEventBus() });

    expect(tx.brunch.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { statusId: 'status-active' } }),
    );
  });

  it('does not touch brunch status when it is already active', async () => {
    const tx = makeMockTx();
    const db = makeMockDb(tx, ACTIVE_BRUNCH);

    await sendInvites(BASE_INPUT, { db, eventBus: makeMockEventBus() });

    expect(tx.brunch.update).not.toHaveBeenCalled();
  });

  it('returns brunch_not_found when the brunch does not exist', async () => {
    const tx = makeMockTx();
    const db = makeMockDb(tx, null);

    const result = await sendInvites(BASE_INPUT, { db, eventBus: makeMockEventBus() });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
  });

  it('returns not_host when the requester is not the brunch host', async () => {
    const tx = makeMockTx();
    const db = makeMockDb(tx, DRAFT_BRUNCH);

    const result = await sendInvites(
      { ...BASE_INPUT, invitedById: 'someone-else-uuid' as UserId },
      { db, eventBus: makeMockEventBus() },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'not_host' });
  });

  it('returns cannot_invite_self when an email matches the host', async () => {
    const tx = makeMockTx();
    const db = makeMockDb(tx, DRAFT_BRUNCH);

    const result = await sendInvites(
      { ...BASE_INPUT, emails: ['host@example.com'] },
      { db, eventBus: makeMockEventBus() },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'cannot_invite_self' });
  });

  it('returns lookup_not_found when the invited RsvpStatus row is missing', async () => {
    const tx = makeMockTx({ rsvpStatus: { findFirst: vi.fn().mockResolvedValue(null) } });
    const db = makeMockDb(tx);

    const result = await sendInvites(BASE_INPUT, { db, eventBus: makeMockEventBus() });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({
      kind: 'lookup_not_found',
      code: 'RsvpStatus:invited',
    });
  });

  it('returns db_error on unexpected transaction failure', async () => {
    const tx = makeMockTx();
    const db = makeMockDb(tx);
    db.$transaction = vi
      .fn()
      .mockRejectedValue(new Error('boom')) as unknown as typeof db.$transaction;

    const result = await sendInvites(BASE_INPUT, { db, eventBus: makeMockEventBus() });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'db_error', cause: expect.any(Error) });
  });

  it('still returns Ok when event emission fails', async () => {
    const tx = makeMockTx();
    const db = makeMockDb(tx);
    const eventBus = makeMockEventBus(vi.fn().mockRejectedValue(new Error('emit failed')));

    const result = await sendInvites(BASE_INPUT, { db, eventBus });

    expect(result.isOk()).toBe(true);
  });

  it('emits invite/sent for each invite', async () => {
    const tx = makeMockTx();
    const db = makeMockDb(tx);
    const emit = vi.fn().mockResolvedValue(undefined);

    await sendInvites(BASE_INPUT, { db, eventBus: makeMockEventBus(emit) });

    expect(emit).toHaveBeenCalledWith(
      'invite/sent',
      expect.objectContaining({ brunchId: BRUNCH_ID, invitedEmail: 'alice@example.com' }),
    );
  });
});

describe('sendInvitesRequestSchema', () => {
  it('rejects an empty emails array', () => {
    expect(sendInvitesRequestSchema.safeParse({ emails: [] }).success).toBe(false);
  });

  it('rejects an invalid email', () => {
    expect(sendInvitesRequestSchema.safeParse({ emails: ['not-an-email'] }).success).toBe(false);
  });

  it('accepts a list of valid emails', () => {
    expect(
      sendInvitesRequestSchema.safeParse({ emails: ['a@example.com', 'b@example.com'] }).success,
    ).toBe(true);
  });
});
