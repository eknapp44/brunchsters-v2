import { describe, expect, it } from 'vitest';
import { ERROR_TOAST_MS, SUCCESS_TOAST_MS, toastDurationMs } from './toastTiming';

describe('toastDurationMs', () => {
  it('keeps a failure up for 8 seconds, because it carries something to act on', () => {
    expect(toastDurationMs('error')).toBe(8000);
  });

  it('keeps a success, and a "give it a few minutes", up for 4 seconds', () => {
    expect(toastDurationMs('success')).toBe(4000);
    expect(toastDurationMs('info')).toBe(4000);
  });

  it('never lets a failure go sooner than a success', () => {
    expect(ERROR_TOAST_MS).toBeGreaterThan(SUCCESS_TOAST_MS);
  });
});
