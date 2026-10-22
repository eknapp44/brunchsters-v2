import { describe, expect, it } from 'vitest';
import { barPercent, leadingOptionId } from './leadingOptionId';

const options = (...counts: number[]) =>
  counts.map((voteCount, index) => ({ id: `option-${index}`, voteCount }));

describe('leadingOptionId', () => {
  it('names the option with strictly the most votes', () => {
    expect(leadingOptionId(options(1, 4, 2))).toBe('option-1');
  });

  it('names nobody when the top two are tied', () => {
    expect(leadingOptionId(options(3, 3, 1))).toBeUndefined();
    expect(leadingOptionId(options(1, 3, 3))).toBeUndefined();
  });

  it('names nobody when every option has the same votes', () => {
    expect(leadingOptionId(options(2, 2))).toBeUndefined();
  });

  it('names nobody before anyone has voted', () => {
    expect(leadingOptionId(options(0, 0, 0))).toBeUndefined();
  });

  it('names a lone option once it has a vote, and nothing before', () => {
    expect(leadingOptionId(options(1))).toBe('option-0');
    expect(leadingOptionId(options(0))).toBeUndefined();
  });

  it('names nobody for an empty list', () => {
    expect(leadingOptionId([])).toBeUndefined();
  });

  it('is not fooled by a tie lower down, or by a tie that a later leader breaks', () => {
    expect(leadingOptionId(options(1, 1, 5))).toBe('option-2');
    expect(leadingOptionId(options(5, 1, 1))).toBe('option-0');
    expect(leadingOptionId(options(2, 2, 3))).toBe('option-2');
  });
});

describe('barPercent', () => {
  it('is the share of the top option, rounded', () => {
    expect(barPercent({ voteCount: 4, topVoteCount: 4 })).toBe(100);
    expect(barPercent({ voteCount: 2, topVoteCount: 4 })).toBe(50);
    expect(barPercent({ voteCount: 1, topVoteCount: 3 })).toBe(33);
  });

  it('is empty when nobody has voted', () => {
    expect(barPercent({ voteCount: 0, topVoteCount: 0 })).toBe(0);
  });
});
