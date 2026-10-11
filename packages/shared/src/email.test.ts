import { describe, expect, it } from 'vitest';
import { normalizeEmail } from './email';

describe('normalizeEmail', () => {
  it('lowercases the address', () => {
    expect(normalizeEmail('Alex.Smith@Example.COM')).toBe('alex.smith@example.com');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeEmail('  alex@example.com \n')).toBe('alex@example.com');
  });

  it('is idempotent', () => {
    const once = normalizeEmail('MiXeD@Example.com');
    expect(normalizeEmail(once)).toBe(once);
  });

  it('makes addresses that differ only in case equal', () => {
    expect(normalizeEmail('Case-X@Example.com')).toBe(normalizeEmail('case-x@example.com'));
  });

  it('leaves the rest of the address alone, including plus tags and dots', () => {
    // Provider aliasing (Gmail ignoring dots and +tags) is deliberately out of scope: ADR 0008.
    expect(normalizeEmail('a.b+tag@Example.com')).toBe('a.b+tag@example.com');
  });
});
