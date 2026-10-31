import { describe, expect, it } from 'vitest';
import { assertBrunchOpen } from './assertBrunchOpen';

const brunchWith = (code: string): { readonly status: { readonly code: string } } => ({
  status: { code },
});

describe('assertBrunchOpen', () => {
  it.each(['draft', 'active', 'confirmed'])('lets a %s brunch take changes', (code) => {
    expect(assertBrunchOpen(brunchWith(code)).isOk()).toBe(true);
  });

  it('refuses a called-off brunch as called off', () => {
    expect(assertBrunchOpen(brunchWith('cancelled'))._unsafeUnwrapErr()).toEqual({
      kind: 'brunch_called_off',
    });
  });

  // A brunch that happened is not "called off": it has a different thing to say and no way back.
  it.each(['completed', 'archived'])('refuses a %s brunch as over', (code) => {
    expect(assertBrunchOpen(brunchWith(code))._unsafeUnwrapErr()).toEqual({ kind: 'brunch_over' });
  });
});
