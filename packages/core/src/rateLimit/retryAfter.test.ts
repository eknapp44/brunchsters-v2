import { describe, expect, it } from 'vitest';
import { secondsUntilWindowEnd, windowStartFor } from './retryAfter';

const at = (iso: string): Date => new Date(iso);

describe('windowStartFor', () => {
  it('rounds down to the start of the window, aligned to the epoch', () => {
    expect(windowStartFor({ now: at('2026-01-01T00:00:10Z'), windowSeconds: 60 })).toEqual(
      at('2026-01-01T00:00:00Z'),
    );
    expect(windowStartFor({ now: at('2026-01-01T13:45:00Z'), windowSeconds: 86_400 })).toEqual(
      at('2026-01-01T00:00:00Z'),
    );
    expect(windowStartFor({ now: at('2026-01-01T00:17:00Z'), windowSeconds: 600 })).toEqual(
      at('2026-01-01T00:10:00Z'),
    );
  });

  it('puts the exact boundary in the new window', () => {
    expect(windowStartFor({ now: at('2026-01-01T00:01:00Z'), windowSeconds: 60 })).toEqual(
      at('2026-01-01T00:01:00Z'),
    );
  });
});

describe('secondsUntilWindowEnd', () => {
  it('counts the seconds left in the window', () => {
    expect(secondsUntilWindowEnd({ now: at('2026-01-01T00:00:10Z'), windowSeconds: 60 })).toBe(50);
    expect(secondsUntilWindowEnd({ now: at('2026-01-01T23:00:00Z'), windowSeconds: 86_400 })).toBe(
      3_600,
    );
  });

  it('rounds a part of a second up', () => {
    expect(secondsUntilWindowEnd({ now: at('2026-01-01T00:00:59.200Z'), windowSeconds: 60 })).toBe(
      1,
    );
  });

  it('is a whole window at the very start and never less than one second', () => {
    expect(secondsUntilWindowEnd({ now: at('2026-01-01T00:00:00Z'), windowSeconds: 60 })).toBe(60);
    expect(secondsUntilWindowEnd({ now: at('2026-01-01T00:00:59.999Z'), windowSeconds: 60 })).toBe(
      1,
    );
  });
});
