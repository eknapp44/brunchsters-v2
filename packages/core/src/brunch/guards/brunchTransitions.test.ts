import { BRUNCH_STATUSES } from '@brunchsters/database';
import { describe, expect, it } from 'vitest';
import { assertCanTransition, BRUNCH_TRANSITIONS } from './brunchTransitions';

const SEEDED_CODES: readonly string[] = BRUNCH_STATUSES.map((status) => status.code);

describe('BRUNCH_TRANSITIONS', () => {
  it('has a row for every seeded status, and no row for anything else', () => {
    expect(Object.keys(BRUNCH_TRANSITIONS).sort()).toEqual([...SEEDED_CODES].sort());
  });

  it('only ever moves to a seeded status', () => {
    for (const targets of Object.values(BRUNCH_TRANSITIONS)) {
      for (const target of targets) expect(SEEDED_CODES).toContain(target);
    }
  });

  it('never moves a status to itself', () => {
    for (const [from, targets] of Object.entries(BRUNCH_TRANSITIONS)) {
      expect(targets).not.toContain(from);
    }
  });
});

describe('assertCanTransition', () => {
  it.each([
    ['draft', 'active'],
    ['active', 'confirmed'],
    ['active', 'cancelled'],
    ['confirmed', 'cancelled'],
    ['cancelled', 'active'],
    ['cancelled', 'confirmed'],
  ])('allows %s to %s', (from, to) => {
    expect(assertCanTransition({ from, to }).isOk()).toBe(true);
  });

  it('refuses every other pair of seeded statuses', () => {
    const allowed = new Set(
      Object.entries(BRUNCH_TRANSITIONS).flatMap(([from, targets]) =>
        targets.map((to) => `${from}>${to}`),
      ),
    );

    for (const from of SEEDED_CODES) {
      for (const to of SEEDED_CODES) {
        if (allowed.has(`${from}>${to}`)) continue;
        expect(assertCanTransition({ from, to }).isErr()).toBe(true);
      }
    }
  });

  it('does not cancel a draft (it can only be deleted)', () => {
    expect(assertCanTransition({ from: 'draft', to: 'cancelled' })._unsafeUnwrapErr()).toEqual({
      kind: 'invalid_transition',
      from: 'draft',
      to: 'cancelled',
    });
  });

  it('refuses a status it does not know, from or to', () => {
    expect(assertCanTransition({ from: 'nonsense', to: 'active' }).isErr()).toBe(true);
    expect(assertCanTransition({ from: 'draft', to: 'nonsense' }).isErr()).toBe(true);
  });
});
