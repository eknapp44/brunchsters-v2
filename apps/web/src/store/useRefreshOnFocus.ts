'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { shouldRefreshOnFocus } from '@/lib/refreshOnFocus';
import { useAppStore } from './hooks';
import { selectHasUnsavedBallot } from './ballotsSlice';
import { selectAnyMutationPending } from './mutationsSlice';

// Asks the server for the page again when the person comes back to the tab (spec 0015 M8): what
// others did since appears without a reload. When it may is `shouldRefreshOnFocus`'s. The page counts
// as just refreshed when it mounts, so coming back within 15 seconds changes nothing. Nothing runs
// after the page goes away.
export function useRefreshOnFocus(): void {
  const router = useRouter();
  const store = useAppStore();

  useEffect(() => {
    let lastRefreshAt = Date.now();
    let lastSubmitAt: number | undefined;

    function ask(): void {
      const now = Date.now();
      const state = store.getState();
      const allowed = shouldRefreshOnFocus({
        visible: document.visibilityState === 'visible',
        msSinceLastRefresh: now - lastRefreshAt,
        requestPending: selectAnyMutationPending(state),
        ballotUnsaved: selectHasUnsavedBallot(state),
        dialogOpen: document.querySelector('dialog[open]') !== null,
        msSinceSubmit: lastSubmitAt === undefined ? undefined : now - lastSubmitAt,
      });
      if (!allowed) return;
      lastRefreshAt = now;
      router.refresh();
    }

    function onSubmit(): void {
      lastSubmitAt = Date.now();
    }

    document.addEventListener('visibilitychange', ask);
    window.addEventListener('focus', ask);
    document.addEventListener('submit', onSubmit, true);
    return () => {
      document.removeEventListener('visibilitychange', ask);
      window.removeEventListener('focus', ask);
      document.removeEventListener('submit', onSubmit, true);
    };
  }, [router, store]);
}
