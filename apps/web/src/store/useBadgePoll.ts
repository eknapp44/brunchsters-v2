'use client';

import { useEffect } from 'react';
import { BADGE_POLL_INTERVAL_MS, shouldPollBadge, type BadgePollReason } from '@/lib/badgePoll';
import { useAppDispatch } from './hooks';
import { pollUnread } from './notificationsSlice';

// Keeps the bell's number fresh while the tab is on screen (spec 0015, ADR 0017): once when the bell
// appears, about once a minute, and when the person comes back to the tab. What it may ask, and when,
// is `shouldPollBadge`'s; a poll that fails is silent and the next one tries again. The interval and
// the listeners are removed when the bell goes away, so a signed-out page leaves nothing running.
//
// A poll on its way is cancelled when any form is submitted (Sign out is one) and when the bell goes
// away, and nothing new starts for a few seconds after a submit. Why: every authenticated answer
// carries a fresh session cookie, so a poll answered AFTER the sign-out response would put the
// session back, and the person would find themselves signed in on a page that said they were not
// (found in dev mode, where the first poll is slow: journey A2 failed 8 times in 10).
// How long after a form is submitted nothing new is asked (the page is about to change).
const SUBMIT_HOLD_MS = 10_000;

export function useBadgePoll(): void {
  const dispatch = useAppDispatch();

  useEffect(() => {
    let lastPollAt: number | undefined;
    // The poll on its way, if any, so it can be cancelled; and when a submit last happened.
    let onItsWay: { abort: () => void } | undefined;
    let heldUntil = 0;

    function ask(reason: BadgePollReason): void {
      const now = Date.now();
      if (now < heldUntil) return;
      const allowed = shouldPollBadge({
        reason,
        visible: document.visibilityState === 'visible',
        msSinceLastPoll: lastPollAt === undefined ? undefined : now - lastPollAt,
      });
      if (!allowed) return;
      lastPollAt = now;
      onItsWay = dispatch(pollUnread());
    }

    function onSubmit(): void {
      heldUntil = Date.now() + SUBMIT_HOLD_MS;
      onItsWay?.abort();
    }

    const onVisibility = () => ask('focus');
    const onFocus = () => ask('focus');

    ask('mount');
    const timer = window.setInterval(() => ask('tick'), BADGE_POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    // Capture phase, so it runs before the form's own handler sends anything.
    document.addEventListener('submit', onSubmit, true);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('submit', onSubmit, true);
      onItsWay?.abort();
    };
  }, [dispatch]);
}
