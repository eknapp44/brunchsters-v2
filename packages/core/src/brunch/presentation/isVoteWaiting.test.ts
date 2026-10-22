import { describe, expect, it } from 'vitest';
import { isVoteWaiting, type VotableList } from './isVoteWaiting';

const NOW = new Date('2026-10-21T12:00:00.000Z');
const LATER = new Date('2026-10-25T12:00:00.000Z');
const EARLIER = new Date('2026-10-20T12:00:00.000Z');

const UNVOTED_VOTE: VotableList = { liveOptionCount: 2, viewerVoted: false };
const VOTED_VOTE: VotableList = { liveOptionCount: 2, viewerVoted: true };
const SINGLE_OPTION: VotableList = { liveOptionCount: 1, viewerVoted: false };

function waiting(overrides: {
  readonly code?: string;
  readonly votingClosedAt?: Date | null;
  readonly votingDeadline?: Date | null;
  readonly viewerCanVote?: boolean;
  readonly lists?: readonly VotableList[];
}): boolean {
  return isVoteWaiting({
    brunch: {
      status: { code: overrides.code ?? 'active' },
      votingClosedAt: overrides.votingClosedAt ?? null,
      votingDeadline: overrides.votingDeadline ?? null,
    },
    viewerCanVote: overrides.viewerCanVote ?? true,
    lists: overrides.lists ?? [UNVOTED_VOTE, UNVOTED_VOTE],
    now: NOW,
  });
}

describe('isVoteWaiting', () => {
  it('waits when voting is open, the person can vote and has voted on neither list', () => {
    expect(waiting({})).toBe(true);
  });

  it('waits while one real vote list is still unvoted, even if the other is done', () => {
    expect(waiting({ lists: [VOTED_VOTE, UNVOTED_VOTE] })).toBe(true);
  });

  it('does not wait once the person has voted on every list that is a vote', () => {
    expect(waiting({ lists: [VOTED_VOTE, VOTED_VOTE] })).toBe(false);
  });

  it('ignores a list with a single option: there is nothing to choose', () => {
    expect(waiting({ lists: [SINGLE_OPTION, VOTED_VOTE] })).toBe(false);
    expect(waiting({ lists: [SINGLE_OPTION, SINGLE_OPTION] })).toBe(false);
    expect(waiting({ lists: [{ liveOptionCount: 0, viewerVoted: false }] })).toBe(false);
  });

  it('does not wait for a person who has no say (a "no" or an unanswered invite)', () => {
    expect(waiting({ viewerCanVote: false })).toBe(false);
  });

  it('never waits on a draft, a confirmed brunch, or any other status', () => {
    expect(waiting({ code: 'draft' })).toBe(false);
    expect(waiting({ code: 'confirmed' })).toBe(false);
    expect(waiting({ code: 'cancelled' })).toBe(false);
    expect(waiting({ code: 'completed' })).toBe(false);
  });

  it('does not wait once the host closed voting early', () => {
    expect(waiting({ votingClosedAt: EARLIER })).toBe(false);
  });

  it('waits before the deadline and not after it', () => {
    expect(waiting({ votingDeadline: LATER })).toBe(true);
    expect(waiting({ votingDeadline: EARLIER })).toBe(false);
  });

  it('does not wait with no lists at all', () => {
    expect(waiting({ lists: [] })).toBe(false);
  });
});
