'use client';

import { useCallback, useEffect, useState } from 'react';
import type { RateLimitFacts } from './limitedCopy';

// What a control is waiting on (spec 0012, ADR 0013 addendum). The truth is the server's: the page
// asks the counters as it loads and hands the answer in (`fromServer`), and a `router.refresh()`
// brings a fresh one, so the same wait shows in every tab and on every device and survives
// anything the browser forgets. This hook only adds two things on top of that:
//
//  - `start(facts)`: a refusal the control just got (a 429), shown at once, without waiting for
//    the refresh that follows it to land;
//  - a timer that lets go of the wait when it is over, so the button comes back by itself.
//
// There is no storage here. The first render uses `fromServer` as it is, so the server's HTML and
// the browser's first render agree.
export type Wait = RateLimitFacts;

export function useWait(fromServer: Wait | undefined): {
  readonly wait: Wait | undefined;
  readonly start: (facts: Wait) => void;
} {
  const [wait, setWait] = useState<Wait | undefined>(fromServer);

  // A new answer from the server (the page was refreshed) replaces what the control has. Keyed by
  // the values, not the object, because the page builds a new object on every render.
  const policy = fromServer?.policy;
  const retryAfterSeconds = fromServer?.retryAfterSeconds;
  useEffect(() => {
    setWait(
      policy === undefined || retryAfterSeconds === undefined
        ? undefined
        : { policy, retryAfterSeconds },
    );
  }, [policy, retryAfterSeconds]);

  // Lets go of the wait when it is over. The seconds are relative to when the server (or the 429)
  // said them, which is now, within the length of a render.
  useEffect(() => {
    if (wait === undefined) return undefined;
    const timer = setTimeout(() => setWait(undefined), wait.retryAfterSeconds * 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const start = useCallback((facts: Wait): void => setWait(facts), []);

  return { wait, start };
}
