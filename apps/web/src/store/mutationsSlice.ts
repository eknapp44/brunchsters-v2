import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { type ClientErrorCode } from '@/lib/errorCopy';
import type { RateLimitFacts } from '@/lib/limitedCopy';
import { readApiError } from '@/lib/readApiError';
import { createAppAsyncThunk } from './hooks';
import type { RootState } from './makeStore';

// One shared mutation thunk with a status per key (spec 0014, ADR 0016). A control no longer owns a
// `submitting`/`error` pair, a `fetch` and its failure wording: it dispatches `runMutation` under a
// key of its own (`rsvp:<brunchId>`) and reads the entry. What a failure says is `errorCopy`'s, from
// the code the route sent; where it shows (a toast, or inline beside the control) is the caller's.
// The store holds status only: no copy of any server data, and no wait (a wait is the server's,
// `useWait`).

export type MutationKey = string;

export type MutationRequest = {
  readonly url: string;
  readonly method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly body?: unknown;
};

export type RunMutationArg = {
  readonly key: MutationKey;
  readonly request: MutationRequest;
  // The words of a toast on success (from a `*Copy.ts` module), or none for a success the page
  // already shows plainly.
  readonly success?: string;
  // Where a failure shows: a toast for a one-tap result, inline for what the person has to fix or
  // wait out. Either way the entry keeps the code.
  readonly failure: 'toast' | 'inline';
  // The control has its own place to show a 429 (an inline wait beside its button, `useWait`), so
  // the toast queue leaves a refusal to it. The entry still keeps the facts for the control to read.
  readonly ownsWait?: boolean;
};

export type MutationFailure = {
  readonly code: ClientErrorCode;
  // The facts of a 429, so a control with a wait surface can start its own wait.
  readonly rateLimit: RateLimitFacts | undefined;
};

export type MutationEntry = {
  readonly status: 'pending' | 'failed';
  // The request this entry is waiting on. A result from any other request (one that started
  // before the entry was released) must not touch it.
  readonly requestId: string;
  readonly failure: MutationFailure | undefined;
};

export type MutationsState = {
  readonly byKey: Readonly<Record<string, MutationEntry | undefined>>;
};

const initialState: MutationsState = { byKey: {} };

export const selectMutation = (state: RootState, key: MutationKey): MutationEntry | undefined =>
  state.mutations.byKey[key];

// Resolves when the route said 2xx; rejects with the code (never a message) otherwise. A request
// that never got an answer is the code `network`.
export const runMutation = createAppAsyncThunk<
  { readonly status: number },
  RunMutationArg,
  { rejectValue: MutationFailure }
>(
  'mutations/runMutation',
  async ({ request }, { extra, rejectWithValue }) => {
    try {
      const response = await extra.fetch(request.url, {
        method: request.method,
        ...(request.body !== undefined
          ? {
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(request.body),
            }
          : {}),
      });
      if (!response.ok) return rejectWithValue(await readApiError(response));
      return { status: response.status };
    } catch {
      return rejectWithValue({ code: 'network', rateLimit: undefined });
    }
  },
  {
    // A second tap on a key already in flight does nothing at all (no request, no state change).
    condition: (arg, { getState }) => selectMutation(getState(), arg.key)?.status !== 'pending',
  },
);

const mutationsSlice = createSlice({
  name: 'mutations',
  initialState,
  reducers: {
    // The control unmounted: a later visit starts clean, and a result that lands after this is
    // ignored here (it still reaches the toast queue: the action did happen).
    mutationReleased(state, action: PayloadAction<MutationKey>) {
      state.byKey = Object.fromEntries(
        Object.entries(state.byKey).filter(([key]) => key !== action.payload),
      );
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(runMutation.pending, (state, action) => {
        state.byKey[action.meta.arg.key] = {
          status: 'pending',
          requestId: action.meta.requestId,
          failure: undefined,
        };
      })
      .addCase(runMutation.fulfilled, (state, action) => {
        const entry = state.byKey[action.meta.arg.key];
        if (entry?.requestId !== action.meta.requestId) return;
        state.byKey = Object.fromEntries(
          Object.entries(state.byKey).filter(([key]) => key !== action.meta.arg.key),
        );
      })
      .addCase(runMutation.rejected, (state, action) => {
        const entry = state.byKey[action.meta.arg.key];
        if (entry?.requestId !== action.meta.requestId) return;
        state.byKey[action.meta.arg.key] = {
          status: 'failed',
          requestId: action.meta.requestId,
          // `payload` is missing only if the thunk itself threw, which it does not.
          failure: action.payload ?? { code: 'internal', rateLimit: undefined },
        };
      });
  },
});

export const { mutationReleased } = mutationsSlice.actions;
export const mutationsReducer = mutationsSlice.reducer;
