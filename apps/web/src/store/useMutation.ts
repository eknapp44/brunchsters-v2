'use client';

import { useEffect } from 'react';
import { errorCopy, type ClientErrorCode } from '@/lib/errorCopy';
import type { RateLimitFacts } from '@/lib/limitedCopy';
import { useAppDispatch, useAppSelector } from './hooks';
import {
  type MutationKey,
  mutationReleased,
  runMutation,
  type RunMutationArg,
  selectMutation,
} from './mutationsSlice';

type MutationView = {
  readonly pending: boolean;
  // The last failure of this key, for a control that shows it inline: its words, its code, and the
  // facts of a 429 (so a control with a wait surface can start its own wait). Cleared by the next run.
  readonly failure:
    | {
        readonly text: string;
        readonly code: ClientErrorCode;
        readonly rateLimit: RateLimitFacts | undefined;
      }
    | undefined;
  // Sends the request. Resolves true when the route said yes, false for anything else (a failure
  // is already in the store and, for a toast, in the queue) and for a tap ignored because this key
  // is already in flight. The caller does `router.refresh()` on true (ADR 0011).
  readonly run: (arg: Omit<RunMutationArg, 'key'>) => Promise<boolean>;
};

// One control's request state, kept in the store under its own key so the status, the failure
// wording and the double-tap rule are the same everywhere (spec 0014).
export function useMutation(key: MutationKey): MutationView {
  const dispatch = useAppDispatch();
  const entry = useAppSelector((state) => selectMutation(state, key));

  // Release on unmount so the next visit starts clean; a late result is ignored by the slice.
  useEffect(() => () => void dispatch(mutationReleased(key)), [dispatch, key]);

  async function run(arg: Omit<RunMutationArg, 'key'>): Promise<boolean> {
    try {
      await dispatch(runMutation({ ...arg, key })).unwrap();
      return true;
    } catch {
      // The slice kept the failure; a tap ignored by `condition` lands here too.
      return false;
    }
  }

  const failure = entry?.failure;
  return {
    pending: entry?.status === 'pending',
    failure:
      failure === undefined
        ? undefined
        : {
            text: errorCopy({ code: failure.code, rateLimit: failure.rateLimit }),
            code: failure.code,
            rateLimit: failure.rateLimit,
          },
    run,
  };
}
