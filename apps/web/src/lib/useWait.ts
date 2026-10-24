'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

// How long to hold a wait again after `onExpire` asked the server and it has not answered yet.
const RECHECK_SECONDS = 30;

// `onExpire` is for a wait whose end is a guess, not a rule (Delete waiting for the queue to tell
// the guests, which can run late or not at all): instead of letting go on its own, the control asks
// the server again (a `router.refresh()`), keeps holding, and the server's answer replaces it, so
// the button returns only when the server says it may. Without it the wait simply ends, which is
// right for a rate-limit window the server counts to the second.
export function useWait(
  fromServer: Wait | undefined,
  options?: { readonly onExpire?: () => void },
): {
  readonly wait: Wait | undefined;
  readonly start: (facts: Wait) => void;
} {
  const [wait, setWait] = useState<Wait | undefined>(fromServer);
  const onExpire = useRef(options?.onExpire);
  onExpire.current = options?.onExpire;

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
    const timer = setTimeout(() => {
      if (onExpire.current === undefined) {
        setWait(undefined);
        return;
      }
      onExpire.current();
      setWait({ policy: wait.policy, retryAfterSeconds: RECHECK_SECONDS });
    }, wait.retryAfterSeconds * 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const start = useCallback((facts: Wait): void => setWait(facts), []);

  return { wait, start };
}
