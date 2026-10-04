import type { DbClient } from '@brunchsters/database';
import type { BrunchId, BrunchLocationId, UserId } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import type { EventBus } from '../events/EventBus';
import { castBallotRequestSchema, castLocationBallot } from './castLocationBallot';

const BRUNCH_ID = 'brunch-uuid' as BrunchId;
const VOTER_ID = 'voter-uuid' as UserId;
const OPTION_A = 'option-a-uuid' as BrunchLocationId;
const OPTION_B = 'option-b-uuid' as BrunchLocationId;

type MockTx = {
  brunchLocationVote: {
    findMany: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
    createMany: ReturnType<typeof vi.fn>;
  };
};

function makeMockTx(overrides: Partial<MockTx['brunchLocationVote']> = {}): MockTx {
  return {
    brunchLocationVote: {
      findMany: overrides.findMany ?? vi.fn().mockResolvedValue([]),
      deleteMany: overrides.deleteMany ?? vi.fn().mockResolvedValue({ count: 0 }),
      createMany: overrides.createMany ?? vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

type Overrides = {
  findFirstBrunch?: ReturnType<typeof vi.fn>;
  findFirstAttendee?: ReturnType<typeof vi.fn>;
  count?: ReturnType<typeof vi.fn>;
  findManyOptions?: ReturnType<typeof vi.fn>;
  tx?: MockTx;
};

function makeMockDb(overrides: Overrides): DbClient & { readonly tx: MockTx } {
  const tx = overrides.tx ?? makeMockTx();
  const db = {
    brunch: {
      findFirst:
        overrides.findFirstBrunch ??
        vi.fn().mockResolvedValue({
          id: BRUNCH_ID,
          hostId: 'host-uuid',
          status: { code: 'active' },
          votingDeadline: null,
        }),
    },
    brunchAttendee: {
      findFirst:
        overrides.findFirstAttendee ??
        vi
          .fn()
          .mockResolvedValue({ id: 'attendee-uuid', rsvpStatus: { code: 'yes', canVote: true } }),
    },
    brunchLocation: {
      count: overrides.count ?? vi.fn().mockResolvedValue(2),
      findMany:
        overrides.findManyOptions ??
        vi.fn().mockResolvedValue([{ id: OPTION_A }, { id: OPTION_B }]),
    },
    $transaction: vi.fn().mockImplementation((fn: (tx: MockTx) => Promise<unknown>) => fn(tx)),
  };
  return { ...db, tx } as unknown as DbClient & { readonly tx: MockTx };
}

function makeMockEventBus(emit = vi.fn().mockResolvedValue(undefined)): EventBus {
  return { emit };
}

describe('castLocationBallot', () => {
  it('inserts votes for a first-time voter and emits vote/cast', async () => {
    const db = makeMockDb({});
    const emit = vi.fn().mockResolvedValue(undefined);

    const result = await castLocationBallot(
      { brunchId: BRUNCH_ID, voterId: VOTER_ID, optionIds: [OPTION_A, OPTION_B] },
      { db, eventBus: makeMockEventBus(emit) },
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ optionIds: [OPTION_A, OPTION_B] });
    expect(db.tx.brunchLocationVote.createMany).toHaveBeenCalledWith({
      data: [
        { brunchLocationId: OPTION_A, userId: VOTER_ID },
        { brunchLocationId: OPTION_B, userId: VOTER_ID },
      ],
    });
    expect(emit).toHaveBeenCalledWith('vote/cast', {
      brunchId: BRUNCH_ID,
      voterId: VOTER_ID,
      optionIds: [OPTION_A, OPTION_B],
    });
  });

  it('emits vote/changed when the voter already had a vote for this kind', async () => {
    const tx = makeMockTx({
      findMany: vi.fn().mockResolvedValue([{ brunchLocationId: OPTION_A }]),
    });
    const db = makeMockDb({ tx });
    const emit = vi.fn().mockResolvedValue(undefined);

    await castLocationBallot(
      { brunchId: BRUNCH_ID, voterId: VOTER_ID, optionIds: [OPTION_B] },
      { db, eventBus: makeMockEventBus(emit) },
    );

    expect(emit).toHaveBeenCalledWith('vote/changed', expect.anything());
  });

  it('deletes votes no longer in the submitted set, scoped to this brunch', async () => {
    const db = makeMockDb({});

    await castLocationBallot(
      { brunchId: BRUNCH_ID, voterId: VOTER_ID, optionIds: [OPTION_A] },
      { db, eventBus: makeMockEventBus() },
    );

    expect(db.tx.brunchLocationVote.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: VOTER_ID,
        brunchLocation: { brunchId: BRUNCH_ID },
        brunchLocationId: { notIn: [OPTION_A] },
      },
    });
  });

  it('does not insert a vote that already exists (idempotent re-send)', async () => {
    const tx = makeMockTx({
      findMany: vi.fn().mockResolvedValue([{ brunchLocationId: OPTION_A }]),
    });
    const db = makeMockDb({ tx });

    await castLocationBallot(
      { brunchId: BRUNCH_ID, voterId: VOTER_ID, optionIds: [OPTION_A] },
      { db, eventBus: makeMockEventBus() },
    );

    expect(db.tx.brunchLocationVote.createMany).not.toHaveBeenCalled();
  });

  it('rejects when the brunch does not exist', async () => {
    const db = makeMockDb({ findFirstBrunch: vi.fn().mockResolvedValue(null) });

    const result = await castLocationBallot(
      { brunchId: BRUNCH_ID, voterId: VOTER_ID, optionIds: [OPTION_A] },
      { db, eventBus: makeMockEventBus() },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
  });

  it('rejects a brunch that is not active', async () => {
    const db = makeMockDb({
      findFirstBrunch: vi.fn().mockResolvedValue({
        id: BRUNCH_ID,
        hostId: 'host-uuid',
        status: { code: 'draft' },
        votingDeadline: null,
      }),
    });

    const result = await castLocationBallot(
      { brunchId: BRUNCH_ID, voterId: VOTER_ID, optionIds: [OPTION_A] },
      { db, eventBus: makeMockEventBus() },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_active' });
  });

  it('rejects an empty ballot', async () => {
    const db = makeMockDb({});

    const result = await castLocationBallot(
      { brunchId: BRUNCH_ID, voterId: VOTER_ID, optionIds: [] },
      { db, eventBus: makeMockEventBus() },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'empty_ballot' });
  });

  it('rejects a non-attendee', async () => {
    const db = makeMockDb({ findFirstAttendee: vi.fn().mockResolvedValue(null) });

    const result = await castLocationBallot(
      { brunchId: BRUNCH_ID, voterId: VOTER_ID, optionIds: [OPTION_A] },
      { db, eventBus: makeMockEventBus() },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'not_an_attendee' });
  });

  it('rejects an attendee whose RSVP cannot vote', async () => {
    const db = makeMockDb({
      findFirstAttendee: vi
        .fn()
        .mockResolvedValue({ id: 'attendee-uuid', rsvpStatus: { code: 'no', canVote: false } }),
    });

    const result = await castLocationBallot(
      { brunchId: BRUNCH_ID, voterId: VOTER_ID, optionIds: [OPTION_A] },
      { db, eventBus: makeMockEventBus() },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'cannot_vote' });
  });

  it('rejects once voting is closed by a past deadline', async () => {
    const db = makeMockDb({
      findFirstBrunch: vi.fn().mockResolvedValue({
        id: BRUNCH_ID,
        hostId: 'host-uuid',
        status: { code: 'active' },
        votingDeadline: new Date('2000-01-01T00:00:00.000Z'),
      }),
    });

    const result = await castLocationBallot(
      { brunchId: BRUNCH_ID, voterId: VOTER_ID, optionIds: [OPTION_A] },
      { db, eventBus: makeMockEventBus() },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'voting_closed' });
  });

  it('rejects once voting is closed because the brunch is confirmed', async () => {
    const db = makeMockDb({
      findFirstBrunch: vi.fn().mockResolvedValue({
        id: BRUNCH_ID,
        hostId: 'host-uuid',
        status: { code: 'confirmed' },
        votingDeadline: null,
      }),
    });

    const result = await castLocationBallot(
      { brunchId: BRUNCH_ID, voterId: VOTER_ID, optionIds: [OPTION_A] },
      { db, eventBus: makeMockEventBus() },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_active' });
  });

  it('rejects a kind with only one option — nothing to vote on', async () => {
    const db = makeMockDb({ count: vi.fn().mockResolvedValue(1) });

    const result = await castLocationBallot(
      { brunchId: BRUNCH_ID, voterId: VOTER_ID, optionIds: [OPTION_A] },
      { db, eventBus: makeMockEventBus() },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'not_a_vote' });
  });

  it('rejects an option id that does not belong to this brunch', async () => {
    const db = makeMockDb({ findManyOptions: vi.fn().mockResolvedValue([{ id: OPTION_A }]) });

    const result = await castLocationBallot(
      { brunchId: BRUNCH_ID, voterId: VOTER_ID, optionIds: [OPTION_A, OPTION_B] },
      { db, eventBus: makeMockEventBus() },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'unknown_option' });
  });

  it('maps a db error from the transaction', async () => {
    const db = makeMockDb({});
    db.$transaction = vi.fn().mockRejectedValue(new Error('connection refused'));

    const result = await castLocationBallot(
      { brunchId: BRUNCH_ID, voterId: VOTER_ID, optionIds: [OPTION_A] },
      { db, eventBus: makeMockEventBus() },
    );

    expect(result._unsafeUnwrapErr()).toEqual({
      kind: 'db_error',
      cause: new Error('connection refused'),
    });
  });

  it('still returns Ok when the event emit throws', async () => {
    const db = makeMockDb({});
    const emit = vi.fn().mockRejectedValue(new Error('bus unavailable'));

    const result = await castLocationBallot(
      { brunchId: BRUNCH_ID, voterId: VOTER_ID, optionIds: [OPTION_A] },
      { db, eventBus: makeMockEventBus(emit) },
    );

    expect(result.isOk()).toBe(true);
  });
});

describe('castBallotRequestSchema', () => {
  it('accepts a non-empty array of uuids', () => {
    const result = castBallotRequestSchema.safeParse({
      optionIds: ['11111111-1111-4111-8111-111111111111'],
    });

    expect(result.success).toBe(true);
  });

  it('rejects an empty array', () => {
    const result = castBallotRequestSchema.safeParse({ optionIds: [] });

    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid entry', () => {
    const result = castBallotRequestSchema.safeParse({ optionIds: ['not-a-uuid'] });

    expect(result.success).toBe(false);
  });
});
