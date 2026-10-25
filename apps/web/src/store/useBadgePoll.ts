'use client';

import { useEffect } from 'react';
import { BADGE_POLL_INTERVAL_MS, shouldPollBadge, type BadgePollReason } from '@/lib/badgePoll';
import { useAppDispatch } from './hooks';
import { pollUnread } from './notificationsSlice';

// Keeps the bell's number fresh while the tab is on screen (spec 0015, ADR 0017): once when the bell
// appears, about once a minute, and when the person comes back to the tab. What it may ask, and when,
// is `shouldPollBadge`'s; a poll that fails is silent and the next one tries again. The interval and
// the listeners are removed when the bell goes away, so a signed-out page leaves nothing running.
export function useBadgePoll(): void {
  const dispatch = useAppDispatch();

  useEffect(() => {
    let lastPollAt: number | undefined;

    function ask(reason: BadgePollReason): void {
      const now = Date.now();
      const allowed = shouldPollBadge({
        reason,
        visible: document.visibilityState === 'visible',
        msSinceLastPoll: lastPollAt === undefined ? undefined : now - lastPollAt,
      });
      if (!allowed) return;
      lastPollAt = now;
      void dispatch(pollUnread());
    }

    const onVisibility = () => ask('focus');
    const onFocus = () => ask('focus');

    ask('mount');
    const timer = window.setInterval(() => ask('tick'), BADGE_POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [dispatch]);
}
