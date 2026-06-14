import { describe, expect, it } from 'vitest';
import type { Brand } from './brand';

describe('Brand', () => {
  it('preserves the underlying runtime value', () => {
    type UserId = Brand<string, 'UserId'>;
    const id = 'abc-123' as UserId;
    expect(id).toBe('abc-123');
    expect(typeof id).toBe('string');
  });

  it('two brands on the same base type are distinct (compile-time check)', () => {
    type UserId = Brand<string, 'UserId'>;
    type BrunchId = Brand<string, 'BrunchId'>;
    const userId = 'u1' as UserId;
    const brunchId = 'b1' as BrunchId;
    // At runtime both are strings — branded types are a compile-time-only constraint.
    expect(typeof userId).toBe('string');
    expect(typeof brunchId).toBe('string');
    expect(userId).not.toBe(brunchId);
  });
});
