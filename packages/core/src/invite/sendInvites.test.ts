import type { DbClient } from '@brunchsters/database';
import { normalizeEmail, type Email, type BrunchId, type UserId } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import type { EventBus } from '../events/EventBus';
import { sendInvites, sendInvitesRequestSchema, type SendInvitesInput } from './sendInvites';
import { InMemoryRateLimiter } from '../rateLimit/InMemoryRateLimiter';
import { RecordingRateLimiter } from '../rateLimit/RecordingRateLimiter';

const BRUNCH_ID = 'brunch-uuid' as BrunchId;
const HOST_ID = 'host-uuid' as UserId;

const DRAFT_BRUNCH = {
  id: BRUNCH_ID,
  hostId: HOST_ID,
  statusId: 'status-draft',
  status: { id: 'status-draft', code: 'draft' },
  host: { id: HOST_ID, email: 'host@example.com' },
};

const ACTIVE_BRUNCH = {
  ...DRAFT_BRUNCH,
  statusId: 'status-active',
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
  brunchAttendee: {
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  brunchStatus: { findFirst: ReturnType<typeof vi.fn> };
  brunch: { updateMany: ReturnType<typeof vi.fn> };
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
    brunchAttendee: {
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    brunchStatus: { findFirst: vi.fn().mockResolvedValue({ id: 'status-active' }) },
    brunch: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
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
  emails: [normalizeEmail('alice@example.com')],
};

describe('sendInvites', () => {
  it('creates a new invite with no attendee for an unregistered email', async () => {
    const tx = makeMockTx();
    const db = makeMockDb(tx);

    const result = await sendInvites(BASE_INPUT, {
      rateLimiter: new InMemoryRateLimiter(),
      db,
      eventBus: makeMockEventBus(),
    });

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

    const result = await sendInvites(BASE_INPUT, {
      rateLimiter: new InMemoryRateLimiter(),
      db,
      eventBus: makeMockEventBus(),
    });

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

    const result = await sendInvites(BASE_INPUT, {
      rateLimiter: new InMemoryRateLimiter(),
      db,
      eventBus: makeMockEventBus(),
    });

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

    const result = await sendInvites(BASE_INPUT, {
      rateLimiter: new InMemoryRateLimiter(),
      db,
      eventBus: makeMockEventBus(),
    });

    expect(result.isOk()).toBe(true);
    const [updateArgs] = tx.brunchInvite.update.mock.calls[0] as [{ data: { deletedAt: unknown } }];
    expect(updateArgs.data.deletedAt).toBeNull();
  });

  it('also revives a soft-deleted attendee row left behind by a prior revoke, instead of leaving it deleted', async () => {
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
      brunchAttendee: {
        create: vi.fn(),
        findUnique: vi.fn().mockResolvedValue({
          id: 'attendee-uuid',
          deletedAt: new Date('2026-01-01'),
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    });
    const db = makeMockDb(tx);

    const result = await sendInvites(BASE_INPUT, {
      rateLimiter: new InMemoryRateLimiter(),
      db,
      eventBus: makeMockEventBus(),
    });

    expect(result.isOk()).toBe(true);
    expect(tx.brunchAttendee.findUnique).toHaveBeenCalledWith({
      where: { inviteId: 'revoked-invite-uuid' },
    });
    expect(tx.brunchAttendee.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'attendee-uuid' },
        data: expect.objectContaining({
          deletedAt: null,
          deletedBy: null,
          rsvpStatusId: 'rsvp-invited',
          respondedAt: null,
        }),
      }),
    );
    expect(tx.brunchAttendee.create).not.toHaveBeenCalled();
  });

  it('does not touch the attendee row when reviving an invite that never had one (unregistered invitee)', async () => {
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

    const result = await sendInvites(BASE_INPUT, {
      rateLimiter: new InMemoryRateLimiter(),
      db,
      eventBus: makeMockEventBus(),
    });

    expect(result.isOk()).toBe(true);
    expect(tx.brunchAttendee.findUnique).toHaveBeenCalledWith({
      where: { inviteId: 'revoked-invite-uuid' },
    });
    expect(tx.brunchAttendee.update).not.toHaveBeenCalled();
  });

  it('does not re-revive an attendee row that is already live when resending an active (non-revoked) invite', async () => {
    const tx = makeMockTx({
      brunchInvite: {
        findUnique: vi.fn().mockResolvedValue({ id: 'existing-invite-uuid', deletedAt: null }),
        update: vi
          .fn()
          .mockResolvedValue({ id: 'existing-invite-uuid', invitedEmail: 'alice@example.com' }),
        create: vi.fn(),
      },
      brunchAttendee: {
        create: vi.fn(),
        findUnique: vi.fn().mockResolvedValue({ id: 'attendee-uuid', deletedAt: null }),
        update: vi.fn(),
      },
    });
    const db = makeMockDb(tx);

    const result = await sendInvites(BASE_INPUT, {
      rateLimiter: new InMemoryRateLimiter(),
      db,
      eventBus: makeMockEventBus(),
    });

    expect(result.isOk()).toBe(true);
    expect(tx.brunchAttendee.update).not.toHaveBeenCalled();
  });

  it('transitions the brunch from draft to active on send', async () => {
    const tx = makeMockTx();
    const db = makeMockDb(tx, DRAFT_BRUNCH);

    await sendInvites(BASE_INPUT, {
      rateLimiter: new InMemoryRateLimiter(),
      db,
      eventBus: makeMockEventBus(),
    });

    expect(tx.brunch.updateMany).toHaveBeenCalledWith({
      where: { id: BRUNCH_ID, statusId: 'status-draft' },
      data: { statusId: 'status-active' },
    });
  });

  it('does not touch brunch status when it is already active', async () => {
    const tx = makeMockTx();
    const db = makeMockDb(tx, ACTIVE_BRUNCH);

    await sendInvites(BASE_INPUT, {
      rateLimiter: new InMemoryRateLimiter(),
      db,
      eventBus: makeMockEventBus(),
    });

    expect(tx.brunch.updateMany).not.toHaveBeenCalled();
  });

  it('returns brunch_not_found when the brunch does not exist', async () => {
    const tx = makeMockTx();
    const db = makeMockDb(tx, null);

    const result = await sendInvites(BASE_INPUT, {
      rateLimiter: new InMemoryRateLimiter(),
      db,
      eventBus: makeMockEventBus(),
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
  });

  it('refuses a member who is not the host (they may know the brunch exists)', async () => {
    const tx = makeMockTx();
    const db = makeMockDb(tx, DRAFT_BRUNCH);

    // Membership is looked up only on this path.
    Object.assign(db, {
      brunchAttendee: { findFirst: vi.fn().mockResolvedValue({ id: 'attendee-id' }) },
    });

    const result = await sendInvites(
      { ...BASE_INPUT, invitedById: 'someone-else-uuid' as UserId },
      { rateLimiter: new InMemoryRateLimiter(), db, eventBus: makeMockEventBus() },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'not_host' });
  });

  it('treats an outsider as if it does not exist (no 403 that confirms it is real)', async () => {
    const tx = makeMockTx();
    const db = makeMockDb(tx, DRAFT_BRUNCH);

    // Membership is looked up only on this path.
    Object.assign(db, {
      brunchAttendee: { findFirst: vi.fn().mockResolvedValue(null) },
    });

    const result = await sendInvites(
      { ...BASE_INPUT, invitedById: 'someone-else-uuid' as UserId },
      { rateLimiter: new InMemoryRateLimiter(), db, eventBus: makeMockEventBus() },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
  });

  it("filters out the host's own email rather than rejecting the whole batch", async () => {
    const tx = makeMockTx();
    const db = makeMockDb(tx, DRAFT_BRUNCH);

    const result = await sendInvites(
      {
        ...BASE_INPUT,
        emails: [normalizeEmail('host@example.com'), normalizeEmail('alice@example.com')],
      },
      { rateLimiter: new InMemoryRateLimiter(), db, eventBus: makeMockEventBus() },
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([
      { id: 'new-invite-uuid', invitedEmail: 'alice@example.com' },
    ]);
    expect(tx.brunchInvite.create).toHaveBeenCalledTimes(1);
  });

  it("filters out the host's own email case-insensitively", async () => {
    const tx = makeMockTx();
    const db = makeMockDb(tx, DRAFT_BRUNCH); // host email is 'host@example.com'

    const result = await sendInvites(
      { ...BASE_INPUT, emails: ['Host@Example.com' as Email, normalizeEmail('alice@example.com')] },
      { rateLimiter: new InMemoryRateLimiter(), db, eventBus: makeMockEventBus() },
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([
      { id: 'new-invite-uuid', invitedEmail: 'alice@example.com' },
    ]);
    expect(tx.brunchInvite.create).toHaveBeenCalledTimes(1);
  });

  it('de-duplicates the same email appearing twice in one batch', async () => {
    const tx = makeMockTx();
    const db = makeMockDb(tx, DRAFT_BRUNCH);

    const result = await sendInvites(
      {
        ...BASE_INPUT,
        emails: [normalizeEmail('alice@example.com'), normalizeEmail('alice@example.com')],
      },
      { rateLimiter: new InMemoryRateLimiter(), db, eventBus: makeMockEventBus() },
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([
      { id: 'new-invite-uuid', invitedEmail: 'alice@example.com' },
    ]);
    expect(tx.brunchInvite.create).toHaveBeenCalledTimes(1);
    expect(tx.brunchInvite.findUnique).toHaveBeenCalledTimes(1);
  });

  it('de-duplicates the same email appearing twice with different casing, keeping the first casing seen', async () => {
    const tx = makeMockTx();
    const db = makeMockDb(tx, DRAFT_BRUNCH);

    const result = await sendInvites(
      {
        ...BASE_INPUT,
        emails: ['Alice@Example.com' as Email, normalizeEmail('alice@example.com')],
      },
      { rateLimiter: new InMemoryRateLimiter(), db, eventBus: makeMockEventBus() },
    );

    expect(result.isOk()).toBe(true);
    expect(tx.brunchInvite.create).toHaveBeenCalledTimes(1);
    expect(tx.brunchInvite.findUnique).toHaveBeenCalledTimes(1);
    expect(tx.brunchInvite.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          brunchId_invitedEmail: expect.objectContaining({ invitedEmail: 'Alice@Example.com' }),
        },
      }),
    );
  });

  it("returns Ok with no invites when every email is the host's own", async () => {
    const tx = makeMockTx();
    const db = makeMockDb(tx, DRAFT_BRUNCH);

    const result = await sendInvites(
      { ...BASE_INPUT, emails: [normalizeEmail('host@example.com')] },
      { rateLimiter: new InMemoryRateLimiter(), db, eventBus: makeMockEventBus() },
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([]);
    expect(tx.brunchInvite.create).not.toHaveBeenCalled();
  });

  it('returns lookup_not_found when the invited RsvpStatus row is missing', async () => {
    const tx = makeMockTx({ rsvpStatus: { findFirst: vi.fn().mockResolvedValue(null) } });
    const db = makeMockDb(tx);

    const result = await sendInvites(BASE_INPUT, {
      rateLimiter: new InMemoryRateLimiter(),
      db,
      eventBus: makeMockEventBus(),
    });

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

    const result = await sendInvites(BASE_INPUT, {
      rateLimiter: new InMemoryRateLimiter(),
      db,
      eventBus: makeMockEventBus(),
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'db_error', cause: expect.any(Error) });
  });

  it('still returns Ok when event emission fails', async () => {
    const tx = makeMockTx();
    const db = makeMockDb(tx);
    const eventBus = makeMockEventBus(vi.fn().mockRejectedValue(new Error('emit failed')));

    const result = await sendInvites(BASE_INPUT, {
      rateLimiter: new InMemoryRateLimiter(),
      db,
      eventBus,
    });

    expect(result.isOk()).toBe(true);
  });

  it('emits invite/sent for each invite', async () => {
    const tx = makeMockTx();
    const db = makeMockDb(tx);
    const emit = vi.fn().mockResolvedValue(undefined);

    await sendInvites(BASE_INPUT, {
      rateLimiter: new InMemoryRateLimiter(),
      db,
      eventBus: makeMockEventBus(emit),
    });

    expect(emit).toHaveBeenCalledWith(
      'invite/sent',
      expect.objectContaining({ brunchId: BRUNCH_ID, invitedEmail: 'alice@example.com' }),
    );
  });

  it('emits the events all at once, so the request waits for the slowest, not the sum', async () => {
    const tx = makeMockTx();
    const db = makeMockDb(tx);
    let inFlight = 0;
    let mostInFlight = 0;
    const emit = vi.fn().mockImplementation(async () => {
      inFlight += 1;
      mostInFlight = Math.max(mostInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
    });

    await sendInvites(
      {
        ...BASE_INPUT,
        emails: [
          normalizeEmail('alice@example.com'),
          normalizeEmail('bob@example.com'),
          normalizeEmail('carol@example.com'),
        ],
      },
      { rateLimiter: new InMemoryRateLimiter(), db, eventBus: makeMockEventBus(emit) },
    );

    expect(emit).toHaveBeenCalledTimes(3);
    expect(mostInFlight).toBe(3);
  });

  it('still returns Ok when one of the events fails to send', async () => {
    const tx = makeMockTx();
    const db = makeMockDb(tx);
    const emit = vi.fn().mockRejectedValue(new Error('queue unreachable'));

    const result = await sendInvites(
      {
        ...BASE_INPUT,
        emails: [normalizeEmail('alice@example.com'), normalizeEmail('bob@example.com')],
      },
      { rateLimiter: new InMemoryRateLimiter(), db, eventBus: makeMockEventBus(emit) },
    );

    expect(result.isOk()).toBe(true);
    expect(emit).toHaveBeenCalledTimes(2);
  });
});

describe('sendInvitesRequestSchema', () => {
  it('normalizes every address to its canonical lowercase form (ADR 0008)', () => {
    const parsed = sendInvitesRequestSchema.parse({
      emails: ['Alice@Example.COM', 'BOB@example.com', 'carol@example.com'],
    });

    expect(parsed.emails).toEqual(['alice@example.com', 'bob@example.com', 'carol@example.com']);
  });

  it('makes the same address typed in two cases come out identical', () => {
    const [first] = sendInvitesRequestSchema.parse({ emails: ['Case-X@Example.com'] }).emails;
    const [later] = sendInvitesRequestSchema.parse({ emails: ['case-x@example.com'] }).emails;

    expect(first).toBe(later);
  });

  it('rejects an empty emails array', () => {
    expect(sendInvitesRequestSchema.safeParse({ emails: [] }).success).toBe(false);
  });

  it('accepts exactly 50 addresses and rejects 51, with a message that says why', () => {
    const emails = (count: number): string[] =>
      Array.from({ length: count }, (_, index) => `guest-${index}@example.com`);

    expect(sendInvitesRequestSchema.safeParse({ emails: emails(50) }).success).toBe(true);

    const tooMany = sendInvitesRequestSchema.safeParse({ emails: emails(51) });
    expect(tooMany.success).toBe(false);
    expect(tooMany.error?.issues[0]?.message).toBe('You can invite at most 50 people at a time');
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

describe('sendInvites — rate limits', () => {
  const HOST_CTX = (
    rateLimiter: RecordingRateLimiter,
    db: DbClient,
    eventBus = makeMockEventBus(),
  ) => ({
    rateLimiter,
    db,
    eventBus,
  });

  it('spends the per-brunch budget, then the per-host one, for the addresses that will be emailed', async () => {
    const rateLimiter = new RecordingRateLimiter();
    const db = makeMockDb(makeMockTx());

    const result = await sendInvites(
      {
        ...BASE_INPUT,
        // The host's own address and a repeat are dropped before anything is emailed, so they are
        // not charged for.
        emails: [
          normalizeEmail('alice@example.com'),
          normalizeEmail('host@example.com'),
          normalizeEmail('bob@example.com'),
          normalizeEmail('Alice@Example.com'),
        ],
      },
      HOST_CTX(rateLimiter, db),
    );

    expect(result.isOk()).toBe(true);
    expect(rateLimiter.spends).toEqual([
      { policy: 'invite-emails-brunch', subject: BRUNCH_ID, cost: 2 },
      { policy: 'invite-emails-host', subject: HOST_ID, cost: 2 },
    ]);
  });

  it("spends nothing when there is nothing to email (only the host's own address)", async () => {
    const rateLimiter = new RecordingRateLimiter();
    const db = makeMockDb(makeMockTx());

    const result = await sendInvites(
      { ...BASE_INPUT, emails: [normalizeEmail('host@example.com')] },
      HOST_CTX(rateLimiter, db),
    );

    expect(result._unsafeUnwrap()).toEqual([]);
    expect(rateLimiter.spends).toEqual([]);
  });

  it.each([
    ['invite-emails-brunch', 1],
    ['invite-emails-host', 2],
  ])(
    'refuses when the %s budget is spent: nothing is written and nothing is emailed',
    async (policy, spendsMade) => {
      const rateLimiter = new RecordingRateLimiter({ refusePolicy: policy });
      const db = makeMockDb(makeMockTx());
      const emit = vi.fn().mockResolvedValue(undefined);

      const result = await sendInvites(
        BASE_INPUT,
        HOST_CTX(rateLimiter, db, makeMockEventBus(emit)),
      );

      expect(result._unsafeUnwrapErr()).toEqual({
        kind: 'rate_limited',
        policy,
        retryAfterSeconds: 321,
      });
      expect(rateLimiter.spends).toHaveLength(spendsMade);
      expect(db.$transaction).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    },
  );

  it('fails closed when the limiter cannot count: nothing is written and nothing is emailed', async () => {
    const cause = new Error('database is down');
    const rateLimiter = new RecordingRateLimiter({ failWith: cause });
    const db = makeMockDb(makeMockTx());
    const emit = vi.fn().mockResolvedValue(undefined);

    const result = await sendInvites(BASE_INPUT, HOST_CTX(rateLimiter, db, makeMockEventBus(emit)));

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'rate_limiter_unavailable', cause });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it.each([
    ['a member who is not the host', { id: 'attendee-id' }, 'not_host'],
    ['an outsider', null, 'brunch_not_found'],
    ['a brunch that does not exist', undefined, 'brunch_not_found'],
  ])(
    'never reaches a budget that names the brunch for %s, and answers exactly as before',
    async (_who, attendee, kind) => {
      const rateLimiter = new RecordingRateLimiter();
      const db = makeMockDb(makeMockTx(), attendee === undefined ? null : DRAFT_BRUNCH);
      Object.assign(db, {
        brunchAttendee: { findFirst: vi.fn().mockResolvedValue(attendee ?? null) },
      });

      const result = await sendInvites(
        { ...BASE_INPUT, invitedById: 'someone-else-uuid' as UserId },
        HOST_CTX(rateLimiter, db),
      );

      expect(result._unsafeUnwrapErr()).toEqual({ kind });
      expect(rateLimiter.spends).toEqual([]);
    },
  );
});

describe('sendInvites — a brunch that is not open', () => {
  it.each([
    ['cancelled', 'brunch_called_off'],
    ['completed', 'brunch_over'],
    ['archived', 'brunch_over'],
  ])(
    'refuses a %s brunch (%s) before spending a budget, writing or emailing',
    async (code, kind) => {
      const tx = makeMockTx();
      const db = makeMockDb(tx, { ...ACTIVE_BRUNCH, status: { id: `status-${code}`, code } });
      const rateLimiter = new RecordingRateLimiter();
      const emit = vi.fn().mockResolvedValue(undefined);

      const result = await sendInvites(BASE_INPUT, { rateLimiter, db, eventBus: { emit } });

      expect(result._unsafeUnwrapErr()).toEqual({ kind });
      expect(rateLimiter.spends).toEqual([]);
      expect(db.$transaction).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    },
  );

  it('tells a member who is not the host not_host, not that the brunch is called off', async () => {
    const db = makeMockDb(makeMockTx(), {
      ...ACTIVE_BRUNCH,
      status: { id: 'status-cancelled', code: 'cancelled' },
    });
    Object.assign(db, { brunchAttendee: { findFirst: vi.fn().mockResolvedValue({ id: 'a' }) } });

    const result = await sendInvites(
      { ...BASE_INPUT, invitedById: 'member-uuid' as UserId },
      { rateLimiter: new InMemoryRateLimiter(), db, eventBus: makeMockEventBus() },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'not_host' });
  });

  it('rolls back and reports invalid_transition when the draft changed status while sending', async () => {
    const tx = makeMockTx({ brunch: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) } });
    const db = makeMockDb(tx, DRAFT_BRUNCH);
    const emit = vi.fn().mockResolvedValue(undefined);

    const result = await sendInvites(BASE_INPUT, {
      rateLimiter: new InMemoryRateLimiter(),
      db,
      eventBus: { emit },
    });

    expect(result._unsafeUnwrapErr()).toEqual({
      kind: 'invalid_transition',
      from: 'draft',
      to: 'active',
    });
    expect(emit).not.toHaveBeenCalled();
  });
});
