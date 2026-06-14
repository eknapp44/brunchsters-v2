import { describe, expect, it } from 'vitest';
import { createDb } from './index';

describe('packages/database', () => {
  it('createDb is a function', () => {
    expect(typeof createDb).toBe('function');
  });
});
