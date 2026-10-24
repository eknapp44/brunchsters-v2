import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { errorCopy } from '@/lib/errorCopy';
import type { RootState } from './makeStore';
import { runMutation } from './mutationsSlice';

// The toast queue (spec 0014, ADR 0016): what a one-tap result says, for a few seconds. It is fed
// by `runMutation` (its `fulfilled` and `rejected` cases read `meta.arg`, so the reducers stay pure
// and the text is fixed when the toast is shown). Timers belong to the toast on screen (`ToastHost`),
// not to the store. A toast is never how a wait is shown: a 429 on a control with a wait surface is
// that control's own inline line, because it must stay readable beside its button.

export type ToastTone = 'success' | 'error' | 'info';

export type Toast = {
  readonly id: string;
  // A repeat of the same result replaces the earlier toast instead of stacking: key + outcome.
  readonly key: string;
  readonly tone: ToastTone;
  readonly text: string;
};

export type ToastsState = { readonly queue: readonly Toast[] };

// Three at a time: more than that is noise on a phone, and the oldest has been read.
export const MAX_TOASTS = 3;

const initialState: ToastsState = { queue: [] };

export const selectToasts = (state: RootState): readonly Toast[] => state.toasts.queue;

function pushed(queue: readonly Toast[], toast: Toast): readonly Toast[] {
  return [...queue.filter((existing) => existing.key !== toast.key), toast].slice(-MAX_TOASTS);
}

const toastsSlice = createSlice({
  name: 'toasts',
  initialState,
  reducers: {
    toastDismissed(state, action: PayloadAction<string>) {
      state.queue = state.queue.filter((toast) => toast.id !== action.payload);
    },
    // For a result that is not a request (a link was copied): the caller makes the id.
    toastShown(state, action: PayloadAction<Toast>) {
      state.queue = [...pushed(state.queue, action.payload)];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(runMutation.fulfilled, (state, action) => {
        const { success, key } = action.meta.arg;
        if (success === undefined) return;
        state.queue = [
          ...pushed(state.queue, {
            id: action.meta.requestId,
            key: `${key}:done`,
            tone: 'success',
            text: success,
          }),
        ];
      })
      .addCase(runMutation.rejected, (state, action) => {
        if (action.meta.arg.failure !== 'toast') return;
        const failure = action.payload ?? { code: 'internal' as const, rateLimit: undefined };
        // A control that shows its own wait does not also toast it.
        if (failure.code === 'rate_limited' && action.meta.arg.ownsWait === true) return;
        state.queue = [
          ...pushed(state.queue, {
            id: action.meta.requestId,
            key: `${action.meta.arg.key}:${failure.code}`,
            // Being held back is not a fault: it reads as news, not as an error.
            tone: failure.code === 'rate_limited' ? 'info' : 'error',
            text: errorCopy({ code: failure.code, rateLimit: failure.rateLimit }),
          }),
        ];
      });
  },
});

export const { toastDismissed, toastShown } = toastsSlice.actions;
export const toastsReducer = toastsSlice.reducer;
