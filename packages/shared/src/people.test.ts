import { describe, expect, it } from 'vitest';
import { AVATAR_COLOR_COUNT, avatarColorIndex, formatPersonName, initialsOf } from './people';

describe('initialsOf', () => {
  it('takes the first letter of the first two words, in capitals', () => {
    expect(initialsOf('maya reyes')).toBe('MR');
    expect(initialsOf('Anna Maria Lopez')).toBe('AM');
  });

  it('copes with one word, extra spaces and nothing at all', () => {
    expect(initialsOf('Prince')).toBe('P');
    expect(initialsOf('  Devon   Kim  ')).toBe('DK');
    expect(initialsOf('   ')).toBe('?');
  });

  it('does not cut a character in half', () => {
    expect(initialsOf('🍳 Chef')).toBe('🍳C');
    expect(initialsOf('éva Nagy')).toBe('ÉN');
  });
});

describe('formatPersonName', () => {
  it('shows a member "First L."', () => {
    expect(formatPersonName({ fullName: 'Maya Reyes', audience: 'member' })).toBe('Maya R.');
  });

  it('uses the last word as the surname and ignores extra spaces', () => {
    expect(formatPersonName({ fullName: '  Anna  Maria   Lopez ', audience: 'member' })).toBe(
      'Anna L.',
    );
  });

  it('leaves a one-word name alone, and gives a blank one a placeholder', () => {
    expect(formatPersonName({ fullName: 'Prince', audience: 'member' })).toBe('Prince');
    expect(formatPersonName({ fullName: '   ', audience: 'member' })).toBe('Someone');
    expect(formatPersonName({ fullName: '', audience: 'host' })).toBe('Someone');
  });

  it('shows the host the full name, with single spaces', () => {
    expect(formatPersonName({ fullName: 'Maya   Reyes', audience: 'host' })).toBe('Maya Reyes');
  });

  it('never gives a member the surname', () => {
    expect(formatPersonName({ fullName: 'Maya Reyes', audience: 'member' })).not.toContain('Reyes');
  });
});

describe('avatarColorIndex', () => {
  it('is stable for a seed', () => {
    expect(avatarColorIndex('3f2a-user-id')).toBe(avatarColorIndex('3f2a-user-id'));
  });

  it('stays inside the palette and uses all of it across many seeds', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 200; i += 1) {
      const index = avatarColorIndex(`user-${i}`);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(AVATAR_COLOR_COUNT);
      seen.add(index);
    }
    expect(seen.size).toBe(AVATAR_COLOR_COUNT);
  });
});
