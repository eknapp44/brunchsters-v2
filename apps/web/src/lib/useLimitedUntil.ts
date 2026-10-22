'use client';

import { useCallback, useEffect, useState } from 'react';
import type { RateLimitFacts } from './limitedCopy';
import { browserStorage, clearLimit, readLimit, secondsLeft, writeLimit } from './limitedUntil';

export type ActiveLimit = RateLimitFacts & {
  // When the wait ends, in milliseconds since the epoch.
  readonly until: number;
};

// Holds one control's wait after the server said 429 (spec 0012). The control disables itself with
// the line beside it until `until`, then comes back on its own. The end is kept in localStorage
// (see limitedUntil.ts), so a refresh or a sign-out and sign-in as the same person does not lose
// it; the server is still the one that enforces the limit.
//
// The stored wait is read after the page has mounted, not while rendering, so the server's HTML
// and the first browser render agree and nothing is lost to a hydration mismatch.
export function useLimitedUntil(storageKey: string): {
  readonly limit: ActiveLimit | undefined;
  readonly start: (facts: RateLimitFacts) => void;
} {
  const [limit, setLimit] = useState<ActiveLimit | undefined>(undefined);

  useEffect(() => {
    const now = Date.now();
    const stored = readLimit({ storage: browserStorage(), key: storageKey, now });
    setLimit(
      stored === undefined
        ? undefined
        : {
            until: stored.until,
            policy: stored.policy,
            retryAfterSeconds: secondsLeft({ until: stored.until, now }),
          },
    );
  }, [storageKey]);

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
    },
    [storageKey],
  );

  return { limit, start };
}
