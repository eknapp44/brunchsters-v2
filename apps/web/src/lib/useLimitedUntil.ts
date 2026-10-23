'use client';

import { useCallback, useEffect, useState } from 'react';
import type { RateLimitFacts } from './limitedCopy';
import {
  announceLimitChange,
  browserStorage,
  clearLimit,
  LIMIT_CHANGED_EVENT,
  readLimit,
  secondsLeft,
  writeLimit,
  type StoredLimit,
} from './limitedUntil';

export type ActiveLimit = RateLimitFacts & {
  // When the wait ends, in milliseconds since the epoch.
  readonly until: number;
};

function toActive(stored: StoredLimit, now: number): ActiveLimit {
  return {
    until: stored.until,
    policy: stored.policy,
    retryAfterSeconds: secondsLeft({ until: stored.until, now }),
  };
}

// Holds one control's wait after the server said 429 (spec 0012). The control disables itself with
// the line beside it until `until`, then comes back on its own. The end is kept in localStorage
// (see limitedUntil.ts), so a refresh or a sign-out and sign-in as the same person does not lose
// it; the server is still the one that enforces the limit.
//
// Everything that uses the same key hears about it: another tab through the browser's `storage`
// event, and another control on this page through an event on the window. That is what lets the
// invite panel's send button and the suggestion panel's Approve buttons, which spend one budget,
// wait together.
//
// The stored wait is read after the page has mounted, not while rendering, so the server's HTML
// and the first browser render agree and nothing is lost to a hydration mismatch.
export function useLimitedUntil(
  storageKey: string,
  options: {
    // A key another page left a wait under for this control to take over (the wizard's handoff).
    readonly adoptFrom?: string;
  } = {},
): {
  readonly limit: ActiveLimit | undefined;
  readonly start: (facts: RateLimitFacts) => void;
} {
  const [limit, setLimit] = useState<ActiveLimit | undefined>(undefined);
  const { adoptFrom } = options;

  useEffect(() => {
    const storage = browserStorage();

    function reread(): void {
      const now = Date.now();
      const stored = readLimit({ storage, key: storageKey, now });
      setLimit(stored === undefined ? undefined : toActive(stored, now));
    }

    // A wait handed over by the wizard becomes this control's own, once.
    if (adoptFrom !== undefined) {
      const now = Date.now();
      const handed = readLimit({ storage, key: adoptFrom, now });
      if (handed !== undefined) {
        writeLimit({ storage, key: storageKey, limit: handed });
        clearLimit({ storage, key: adoptFrom });
      }
    }
    reread();

    function onStorage(event: StorageEvent): void {
      if (event.key === storageKey || event.key === null) reread();
    }
    function onChanged(event: Event): void {
      if ((event as CustomEvent<string>).detail === storageKey) reread();
    }
    window.addEventListener('storage', onStorage);
    window.addEventListener(LIMIT_CHANGED_EVENT, onChanged);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(LIMIT_CHANGED_EVENT, onChanged);
    };
  }, [storageKey, adoptFrom]);

  // Comes back by itself when the wait is over.
  const until = limit?.until;
  useEffect(() => {
    if (until === undefined) return undefined;
    const timer = setTimeout(
      () => {
        clearLimit({ storage: browserStorage(), key: storageKey });
        setLimit(undefined);
      },
      Math.max(0, until - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [until, storageKey]);

  const start = useCallback(
    (facts: RateLimitFacts): void => {
      const next: ActiveLimit = {
        ...facts,
        until: Date.now() + facts.retryAfterSeconds * 1000,
      };
      writeLimit({
        storage: browserStorage(),
        key: storageKey,
        limit: { until: next.until, policy: next.policy },
      });
      setLimit(next);
      // Other controls on this page that share the key (this one hears its own event too).
      announceLimitChange(storageKey);
    },
    [storageKey],
  );

  return { limit, start };
}
