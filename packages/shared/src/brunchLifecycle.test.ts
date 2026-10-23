import { describe, expect, it } from 'vitest';
import { CANCEL_NOTICE_HOLD_SECONDS, PAST_BRUNCHES_SHOWN } from './brunchLifecycle';

describe('brunch lifecycle constants', () => {
  it('holds the cancel notice for a whole, positive number of seconds', () => {
    expect(Number.isInteger(CANCEL_NOTICE_HOLD_SECONDS)).toBe(true);
    expect(CANCEL_NOTICE_HOLD_SECONDS).toBeGreaterThan(0);
  });

  it('shows at least one past brunch', () => {
    expect(Number.isInteger(PAST_BRUNCHES_SHOWN)).toBe(true);
    expect(PAST_BRUNCHES_SHOWN).toBeGreaterThanOrEqual(1);
  });
});
