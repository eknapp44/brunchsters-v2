import { describe, expect, it } from 'vitest';

describe('packages/core', () => {
  it('module is importable and exports expected runtime functions', async () => {
    const mod = await import('./index');
    expect(mod.signInWithProvider).toBeTypeOf('function');
  });
});
