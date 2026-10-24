import { CANCEL_NOTICE_GRACE_SECONDS, CANCEL_NOTICE_HOLD_SECONDS } from '@brunchsters/shared';
import { describe, expect, it } from 'vitest';
import { cancelNoticeWaitSeconds, isCancelNoticePending } from './isCancelNoticePending';

const CANCELLED_AT = new Date('2026-10-23T12:00:00.000Z');
const after = (seconds: number): Date => new Date(CANCELLED_AT.getTime() + seconds * 1000);
const calledOff = {
  statusCode: 'cancelled',
  cancelledAt: CANCELLED_AT,
  cancelNoticeSentAt: undefined,
};

describe('isCancelNoticePending', () => {
  it('is pending from the moment it is called off, through the hold and until the function runs', () => {
    expect(isCancelNoticePending({ ...calledOff, now: after(0) })).toBe(true);
    expect(
      isCancelNoticePending({ ...calledOff, now: after(CANCEL_NOTICE_HOLD_SECONDS - 1) }),
    ).toBe(true);
    expect(
      isCancelNoticePending({ ...calledOff, now: after(CANCEL_NOTICE_HOLD_SECONDS + 1) }),
    ).toBe(true);
  });

  it('ends by itself a grace period after the hold, so a host is never trapped by a dead queue', () => {
    const edge = CANCEL_NOTICE_HOLD_SECONDS + CANCEL_NOTICE_GRACE_SECONDS;

    expect(isCancelNoticePending({ ...calledOff, now: after(edge - 1) })).toBe(true);
    expect(isCancelNoticePending({ ...calledOff, now: after(edge) })).toBe(false);
  });

  it('is over as soon as the notice is recorded as sent', () => {
    expect(
      isCancelNoticePending({ ...calledOff, cancelNoticeSentAt: after(301), now: after(302) }),
    ).toBe(false);
  });

  it('has nothing to wait for without a recorded cancellation moment', () => {
    expect(isCancelNoticePending({ ...calledOff, cancelledAt: undefined, now: after(1) })).toBe(
      false,
    );
  });

  it.each(['draft', 'active', 'confirmed'])('never applies to a %s brunch', (statusCode) => {
    expect(isCancelNoticePending({ ...calledOff, statusCode, now: after(1) })).toBe(false);
  });
});

describe('cancelNoticeWaitSeconds', () => {
  it('is the rest of the hold plus a moment for the queue to run', () => {
    expect(cancelNoticeWaitSeconds({ cancelledAt: CANCELLED_AT, now: after(0) })).toBe(
      CANCEL_NOTICE_HOLD_SECONDS + 20,
    );
    expect(cancelNoticeWaitSeconds({ cancelledAt: CANCELLED_AT, now: after(100) })).toBe(
      CANCEL_NOTICE_HOLD_SECONDS - 100 + 20,
    );
  });

  it('never drops below half a minute, even past the hold', () => {
    expect(
      cancelNoticeWaitSeconds({
        cancelledAt: CANCELLED_AT,
        now: after(CANCEL_NOTICE_HOLD_SECONDS),
      }),
    ).toBe(30);
    expect(cancelNoticeWaitSeconds({ cancelledAt: CANCELLED_AT, now: after(4000) })).toBe(30);
  });
});
