import type { DbClient } from '@brunchsters/database';
import type { BrunchId, BrunchTimeId, UserId } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import type { EventBus } from '../events/EventBus';
import { castTimeBallot } from './castTimeBallot';

const BRUNCH_ID = 'brunch-uuid' as BrunchId;
const VOTER_ID = 'voter-uuid' as UserId;
const OPTION_A = 'option-a-uuid' as BrunchTimeId;
const OPTION_B = 'option-b-uuid' as BrunchTimeId;

const OPEN_BRUNCH = {
  id: BRUNCH_ID,
  hostId: 'host-uuid',
  status: { code: 'active' },
  votingDeadline: null,
  votingClosedAt: null,
};

type MockTx = {
  $executeRaw: ReturnType<typeof vi.fn>;
  brunch: { findFirst: ReturnType<typeof vi.fn> };
  brunchTimeVote: {
    findMany: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
    createMany: ReturnType<typeof vi.fn>;
  };
};

function makeMockTx(
  overrides: Partial<MockTx['brunchTimeVote']> & {
    findFirstBrunch?: ReturnType<typeof vi.fn>;
  } = {},
): MockTx {
  return {
    $executeRaw: vi.fn().mockResolvedValue(0),
    brunch: {
      findFirst: overrides.findFirstBrunch ?? vi.fn().mockResolvedValue(OPEN_BRUNCH),
    },
    brunchTimeVote: {
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
      findFirst: overrides.findFirstBrunch ?? vi.fn().mockResolvedValue(OPEN_BRUNCH),
    },
    brunchAttendee: {
      findFirst:
        overrides.findFirstAttendee ??
        vi
          .fn()
          .mockResolvedValue({ id: 'attendee-uuid', rsvpStatus: { code: 'yes', canVote: true } }),
    },
    brunchTime: {
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

describe('castTimeBallot', () => {
  it('inserts votes for a first-time voter and emits vote/cast', async () => {
    const db = makeMockDb({});
    const emit = vi.fn().mockResolvedValue(undefined);

    const result = await castTimeBallot(
      { brunchId: BRUNCH_ID, voterId: VOTER_ID, optionIds: [OPTION_A, OPTION_B] },
      { db, eventBus: makeMockEventBus(emit) },
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ optionIds: [OPTION_A, OPTION_B] });
    expect(db.tx.brunchTimeVote.createMany).toHaveBeenCalledWith({
      data: [
        { brunchTimeId: OPTION_A, userId: VOTER_ID },
        { brunchTimeId: OPTION_B, userId: VOTER_ID },
      ],
    });
    expect(emit).toHaveBeenCalledWith('vote/cast', {
      brunchId: BRUNCH_ID,
      voterId: VOTER_ID,
      optionIds: [OPTION_A, OPTION_B],
    });
  });

  it('emits vote/changed when the voter already had a vote for this kind', async () => {
    const tx = makeMockTx({ findMany: vi.fn().mockResolvedValue([{ brunchTimeId: OPTION_A }]) });
    const db = makeMockDb({ tx });
    const emit = vi.fn().mockResolvedValue(undefined);

    await castTimeBallot(
      { brunchId: BRUNCH_ID, voterId: VOTER_ID, optionIds: [OPTION_B] },
      { db, eventBus: makeMockEventBus(emit) },
    );

    expect(emit).toHaveBeenCalledWith('vote/changed', {
      brunchId: BRUNCH_ID,
      voterId: VOTER_ID,
      optionIds: [OPTION_B],
    });
  });

  it('deletes votes no longer in the submitted set, scoped to this brunch', async () => {
    const db = makeMockDb({});

    await castTimeBallot(
      { brunchId: BRUNCH_ID, voterId: VOTER_ID, optionIds: [OPTION_A] },
      { db, eventBus: makeMockEventBus() },
    );

    expect(db.tx.brunchTimeVote.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: VOTER_ID,
        brunchTime: { brunchId: BRUNCH_ID },
        brunchTimeId: { notIn: [OPTION_A] },
      },
    });
  });

  it('does not insert a vote that already exists (idempotent re-send)', async () => {
    const tx = makeMockTx({ findMany: vi.fn().mockResolvedValue([{ brunchTimeId: OPTION_A }]) });
    const db = makeMockDb({ tx });

    await castTimeBallot(
      { brunchId: BRUNCH_ID, voterId: VOTER_ID, optionIds: [OPTION_A] },
      { db, eventBus: makeMockEventBus() },
    );

    expect(db.tx.brunchTimeVote.createMany).not.toHaveBeenCalled();
  });

  it('rejects when the brunch does not exist', async () => {
    const db = makeMockDb({ findFirstBrunch: vi.fn().mockResolvedValue(null) });

    const result = await castTimeBallot(
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

    const result = await castTimeBallot(
      { brunchId: BRUNCH_ID, voterId: VOTER_ID, optionIds: [OPTION_A] },
      { db, eventBus: makeMockEventBus() },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_active' });
  });

  it('rejects an empty ballot', async () => {
    const db = makeMockDb({});

    const result = await castTimeBallot(
      { brunchId: BRUNCH_ID, voterId: VOTER_ID, optionIds: [] },
      { db, eventBus: makeMockEventBus() },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'empty_ballot' });
  });

  it('treats someone who is not a member as if the brunch does not exist', async () => {
    const db = makeMockDb({ findFirstAttendee: vi.fn().mockResolvedValue(null) });

    const result = await castTimeBallot(
      { brunchId: BRUNCH_ID, voterId: VOTER_ID, optionIds: [OPTION_A] },
      { db, eventBus: makeMockEventBus() },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
  });

  it('tells an outsider nothing about the brunch: not that it is a draft or already confirmed', async () => {
    const outsider = vi.fn().mockResolvedValue(null);
    for (const code of ['draft', 'confirmed']) {
      const db = makeMockDb({
        findFirstAttendee: outsider,
        findFirstBrunch: vi.fn().mockResolvedValue({ ...OPEN_BRUNCH, status: { code } }),
      });

      const result = await castTimeBallot(
        { brunchId: BRUNCH_ID, voterId: VOTER_ID, optionIds: [OPTION_A] },
        { db, eventBus: makeMockEventBus() },
      );

      expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
    }
  });

  it('rejects an attendee whose RSVP cannot vote', async () => {
    const db = makeMockDb({
      findFirstAttendee: vi
        .fn()
        .mockResolvedValue({ id: 'attendee-uuid', rsvpStatus: { code: 'no', canVote: false } }),
    });

    const result = await castTimeBallot(
      { brunchId: BRUNCH_ID, voterId: VOTER_ID, optionIds: [OPTION_A] },
      { db, eventBus: makeMockEventBus() },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'cannot_vote' });
  });

  it('rejects once voting is closed by a past deadline', async () => {
    const closedBrunch = { ...OPEN_BRUNCH, votingDeadline: new Date('2000-01-01T00:00:00.000Z') };
    const db = makeMockDb({
      findFirstBrunch: vi.fn().mockResolvedValue(closedBrunch),
      tx: makeMockTx({ findFirstBrunch: vi.fn().mockResolvedValue(closedBrunch) }),
    });

    const result = await castTimeBallot(
      { brunchId: BRUNCH_ID, voterId: VOTER_ID, optionIds: [OPTION_A] },
      { db, eventBus: makeMockEventBus() },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'voting_closed' });
  });

  it('rejects once voting is closed by an early manual close (votingClosedAt)', async () => {
    const closedBrunch = { ...OPEN_BRUNCH, votingClosedAt: new Date() };
    const db = makeMockDb({
      findFirstBrunch: vi.fn().mockResolvedValue(closedBrunch),
      tx: makeMockTx({ findFirstBrunch: vi.fn().mockResolvedValue(closedBrunch) }),
    });

    const result = await castTimeBallot(
      { brunchId: BRUNCH_ID, voterId: VOTER_ID, optionIds: [OPTION_A] },
      { db, eventBus: makeMockEventBus() },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'voting_closed' });
  });

  it('closes the race: a close that lands between the pre-transaction check and the write still loses the vote', async () => {
    const tx = makeMockTx({
      findFirstBrunch: vi.fn().mockResolvedValue({ ...OPEN_BRUNCH, votingClosedAt: new Date() }),
    });
    const db = makeMockDb({ findFirstBrunch: vi.fn().mockResolvedValue(OPEN_BRUNCH), tx });

    const result = await castTimeBallot(
      { brunchId: BRUNCH_ID, voterId: VOTER_ID, optionIds: [OPTION_A] },
      { db, eventBus: makeMockEventBus() },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'voting_closed' });
    expect(tx.brunchTimeVote.createMany).not.toHaveBeenCalled();
    expect(tx.brunchTimeVote.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects a kind with only one option — nothing to vote on', async () => {
    const db = makeMockDb({ count: vi.fn().mockResolvedValue(1) });

    const result = await castTimeBallot(
      { brunchId: BRUNCH_ID, voterId: VOTER_ID, optionIds: [OPTION_A] },
      { db, eventBus: makeMockEventBus() },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'not_a_vote' });
  });

  it('rejects an option id that does not belong to this brunch', async () => {
    const db = makeMockDb({ findManyOptions: vi.fn().mockResolvedValue([{ id: OPTION_A }]) });

    const result = await castTimeBallot(
      { brunchId: BRUNCH_ID, voterId: VOTER_ID, optionIds: [OPTION_A, OPTION_B] },
      { db, eventBus: makeMockEventBus() },
    );

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'unknown_option' });
  });

  it('maps a db error from the transaction', async () => {
    const db = makeMockDb({});
    db.$transaction = vi.fn().mockRejectedValue(new Error('connection refused'));

    const result = await castTimeBallot(
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

    const result = await castTimeBallot(
      { brunchId: BRUNCH_ID, voterId: VOTER_ID, optionIds: [OPTION_A] },
      { db, eventBus: makeMockEventBus(emit) },
    );

    expect(result.isOk()).toBe(true);
  });

  it('dedupes a duplicate id instead of inserting it twice and throwing on the unique index', async () => {
    const db = makeMockDb({});

    const result = await castTimeBallot(
      { brunchId: BRUNCH_ID, voterId: VOTER_ID, optionIds: [OPTION_A, OPTION_A] },
      { db, eventBus: makeMockEventBus() },
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ optionIds: [OPTION_A] });
    expect(db.tx.brunchTimeVote.createMany).toHaveBeenCalledWith({
      data: [{ brunchTimeId: OPTION_A, userId: VOTER_ID }],
    });
  });

  it('locks the Brunch row before re-checking voting status inside the transaction', async () => {
    const tx = makeMockTx();
    const db = makeMockDb({ tx });

    await castTimeBallot(
      { brunchId: BRUNCH_ID, voterId: VOTER_ID, optionIds: [OPTION_A] },
      { db, eventBus: makeMockEventBus() },
    );

    expect(tx.$executeRaw).toHaveBeenCalled();
  });
});
