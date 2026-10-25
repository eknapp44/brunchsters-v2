import { describe, expect, it } from 'vitest';
import {
  BADGE_FOCUS_MIN_GAP_MS,
  BADGE_POLL_INTERVAL_MS,
  shouldPollBadge,
  type BadgePollReason,
} from './badgePoll';

const REASONS: readonly BadgePollReason[] = ['mount', 'tick', 'focus'];

describe('shouldPollBadge', () => {
  it('never asks while the tab cannot be seen, whatever the reason', () => {
    for (const reason of REASONS) {
      expect(shouldPollBadge({ reason, visible: false, msSinceLastPoll: undefined })).toBe(false);
      expect(shouldPollBadge({ reason, visible: false, msSinceLastPoll: 10 * 60_000 })).toBe(false);
    }
  });

  it('always asks when the bell first appears', () => {
    expect(shouldPollBadge({ reason: 'mount', visible: true, msSinceLastPoll: 0 })).toBe(true);
    expect(shouldPollBadge({ reason: 'mount', visible: true, msSinceLastPoll: undefined })).toBe(
      true,
    );
  });

  it('asks on coming back to the tab, unless it asked a moment ago', () => {
    expect(shouldPollBadge({ reason: 'focus', visible: true, msSinceLastPoll: undefined })).toBe(
      true,
    );
    expect(
      shouldPollBadge({
        reason: 'focus',
        visible: true,
        msSinceLastPoll: BADGE_FOCUS_MIN_GAP_MS,
      }),
    ).toBe(true);
    expect(
      shouldPollBadge({
        reason: 'focus',
        visible: true,
        msSinceLastPoll: BADGE_FOCUS_MIN_GAP_MS - 1,
      }),
    ).toBe(false);
  });

  it('asks on the interval, but skips a tick that follows a poll by less than half an interval', () => {
    expect(shouldPollBadge({ reason: 'tick', visible: true, msSinceLastPoll: undefined })).toBe(
      true,
    );
    expect(
      shouldPollBadge({
        reason: 'tick',
        visible: true,
        msSinceLastPoll: BADGE_POLL_INTERVAL_MS,
      }),
    ).toBe(true);
    expect(shouldPollBadge({ reason: 'tick', visible: true, msSinceLastPoll: 5_000 })).toBe(false);
  });

  it('keeps the interval at about a minute, as the spec says', () => {
    expect(BADGE_POLL_INTERVAL_MS).toBe(60_000);
  });
});
