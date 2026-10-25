'use client';

import { useEffect } from 'react';
import { errorCopy, type ClientErrorCode } from '@/lib/errorCopy';
import type { RateLimitFacts } from '@/lib/limitedCopy';
import { useSignedOutRedirect } from '@/lib/useSignedOutRedirect';
import { useAppDispatch, useAppSelector } from './hooks';
import { toastShown } from './toastsSlice';
import {
  type MutationFailure,
  type MutationKey,
  mutationReleased,
  runMutation,
  type RunMutationArg,
  selectMutation,
} from './mutationsSlice';

export type MutationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly failure: MutationFailure | undefined };

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
  // Sends the request. Resolves `ok: true` when the route said yes, and `ok: false` for anything
  // else, with the failure (the code, and the facts of a 429 for a control that holds its own wait);
  // the failure is already in the store and, for a toast, in the queue. `failure` is undefined for
  // a tap ignored because this key is already in flight. The caller does `router.refresh()` on ok
  // (ADR 0011).
  readonly run: (arg: Omit<RunMutationArg, 'key'>) => Promise<MutationResult>;
  // Forgets the last failure (a dialog opening again should not show the last attempt's line).
  readonly reset: () => void;
};

function isMutationFailure(value: unknown): value is MutationFailure {
  return typeof value === 'object' && value !== null && 'code' in value && 'rateLimit' in value;
}

// One control's request state, kept in the store under its own key so the status, the failure
// wording and the double-tap rule are the same everywhere (spec 0014).
export function useMutation(key: MutationKey): MutationView {
  const dispatch = useAppDispatch();
  const redirectIfSignedOut = useSignedOutRedirect();
  const entry = useAppSelector((state) => selectMutation(state, key));

  // Release on unmount so the next visit starts clean; a late result is ignored by the slice.
  useEffect(() => () => void dispatch(mutationReleased(key)), [dispatch, key]);

  async function run(arg: Omit<RunMutationArg, 'key'>): Promise<MutationResult> {
    try {
      await dispatch(runMutation({ ...arg, key })).unwrap();
      return { ok: true };
    } catch (thrown) {
      // The slice kept the failure. A tap ignored by `condition` lands here too, with no failure.
      const failure = isMutationFailure(thrown) ? thrown : undefined;
      // The session ended while the page was open: nothing on it will work again, so send the
      // person to sign in and bring them back here (the same callback the middleware gives a page
      // request). The toast says why; the sign-in page then takes over.
      redirectIfSignedOut(failure?.code);
      return { ok: false, failure };
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
    reset: () => void dispatch(mutationReleased(key)),
  };
}

// A toast that is not the answer to a request (a link was copied): dispatched by the control.
export function useToast(): (toast: {
  readonly key: string;
  readonly tone: 'success' | 'error' | 'info';
  readonly text: string;
}) => void {
  const dispatch = useAppDispatch();
  return (toast) => {
    dispatch(toastShown({ ...toast, id: crypto.randomUUID() }));
  };
}
