import type { BrunchId, UserId } from '@brunchsters/shared';
import { describe, expect, it } from 'vitest';
import { assertVotingOpen, isVotingClosed, type ClosableBrunch } from './assertVotingOpen';

function makeBrunch(overrides: Partial<ClosableBrunch> = {}): ClosableBrunch {
  return {
    id: 'brunch-uuid' as BrunchId,
    hostId: 'host-uuid' as UserId,
    status: { code: 'active' },
    votingClosedAt: null,
    votingDeadline: null,
    ...overrides,
  } as ClosableBrunch;
}

describe('assertVotingOpen / isVotingClosed', () => {
  it('is open when nothing has closed it', () => {
    const brunch = makeBrunch();

    expect(isVotingClosed(brunch)).toBe(false);
    expect(assertVotingOpen(brunch).isOk()).toBe(true);
  });

  it('is closed once votingClosedAt is set (early manual close)', () => {
    const brunch = makeBrunch({ votingClosedAt: new Date() });

    expect(isVotingClosed(brunch)).toBe(true);
    expect(assertVotingOpen(brunch)._unsafeUnwrapErr()).toEqual({ kind: 'voting_closed' });
  });

  it('is closed once the brunch is confirmed', () => {
    const brunch = makeBrunch({ status: { code: 'confirmed' } });

    expect(isVotingClosed(brunch)).toBe(true);
    expect(assertVotingOpen(brunch)._unsafeUnwrapErr()).toEqual({ kind: 'voting_closed' });
  });

  it('is closed once the voting deadline has passed', () => {
    const brunch = makeBrunch({ votingDeadline: new Date('2000-01-01T00:00:00.000Z') });

    expect(isVotingClosed(brunch)).toBe(true);
    expect(assertVotingOpen(brunch)._unsafeUnwrapErr()).toEqual({ kind: 'voting_closed' });
  });

  it('is open when the voting deadline is in the future', () => {
    const brunch = makeBrunch({
      votingDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    expect(isVotingClosed(brunch)).toBe(false);
  });
});
