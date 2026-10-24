import { describe, expect, it } from 'vitest';
import { assertBrunchOpen } from './assertBrunchOpen';

const brunchWith = (code: string): { readonly status: { readonly code: string } } => ({
  status: { code },
});

describe('assertBrunchOpen', () => {
  it.each(['draft', 'active', 'confirmed'])('lets a %s brunch take changes', (code) => {
    expect(assertBrunchOpen(brunchWith(code)).isOk()).toBe(true);
  });

  it.each(['cancelled', 'completed', 'archived'])('refuses a %s brunch', (code) => {
    const result = assertBrunchOpen(brunchWith(code));

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_called_off' });
  });
});
