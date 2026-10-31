import { describe, expect, it } from 'vitest';
import { describeVoteChanges, type CountedOption } from './voteAnnouncements';

const option = (id: string, name: string, voteCount: number): CountedOption => ({
  id,
  name,
  voteCount,
});

describe('describeVoteChanges', () => {
  it('says nothing when no count changed', () => {
    const options = [option('a', 'Sunny Side', 2)];
    expect(describeVoteChanges({ before: options, after: options })).toBeUndefined();
  });

  it('names the option and its new count', () => {
    expect(
      describeVoteChanges({
        before: [option('a', 'Sunny Side', 1), option('b', 'Harbor', 0)],
        after: [option('a', 'Sunny Side', 2), option('b', 'Harbor', 0)],
      }),
    ).toBe('Votes changed. Sunny Side: 2 votes.');
  });

  it('uses the singular for one vote', () => {
    expect(
      describeVoteChanges({
        before: [option('a', 'Harbor', 2)],
        after: [option('a', 'Harbor', 1)],
      }),
    ).toBe('Votes changed. Harbor: 1 vote.');
  });

  it('names at most three and counts the rest', () => {
    const before = ['a', 'b', 'c', 'd', 'e'].map((id) => option(id, id.toUpperCase(), 0));
    const after = before.map((o) => ({ ...o, voteCount: 1 }));
    expect(describeVoteChanges({ before, after })).toBe(
      'Votes changed. A: 1 vote. B: 1 vote. C: 1 vote. And 2 more.',
    );
  });

  it('ignores an option that is new or gone: only a changed count is news', () => {
    expect(
      describeVoteChanges({
        before: [option('a', 'Old', 1)],
        after: [option('b', 'New', 3)],
      }),
    ).toBeUndefined();
  });
});
