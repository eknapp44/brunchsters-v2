import { describe, expect, it } from 'vitest';

describe('packages/core', () => {
  it('module is importable and has no unexpected runtime exports', async () => {
    const mod = await import('./index');
    // All exports from core/index.ts are `export type` — runtime module is empty.
    expect(Object.keys(mod)).toHaveLength(0);
  });
});
