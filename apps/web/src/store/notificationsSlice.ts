import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { readApiError } from '@/lib/readApiError';
import { createAppAsyncThunk } from './hooks';
import type { RootState } from './makeStore';
import type { MutationFailure } from './mutationsSlice';

// The bell's number and the marking of notifications as read (spec 0015, ADR 0017). Several
// components read the count (the bell, the inbox page) and marking a row read changes it at once
// and must roll back when the route says no, which is what earns a slice (ADR 0011). It holds a
// count and the requests in flight, never a notification: the rows are the server's, drawn by a
// Server Component and refreshed with `router.refresh()`.
//
// Reset and release: the slice lives in the signed-in layout's store, which is dropped on sign-out,
// so nothing reaches the next person to sign in on the browser. A result that lands after a newer
// request began is ignored (`epoch`), so a poll that started before a mark cannot put back a count
// the mark already removed.

type NotificationsState = {
  // The unread count, or undefined until the first answer (the bell then shows no number).
  readonly unread: number | undefined;
  // A poll is in flight; the badge asks again only when it is not.
  readonly polling: boolean;
  // Counts the reads that began or were rolled back; a poll that started in an earlier epoch is
  // out of date when it lands.
  readonly epoch: number;
  readonly pollEpoch: number;
  // Reads in flight, by request id, with how many unread they took off the count (to put back).
  readonly marks: Readonly<Record<string, number>>;
};

const initialState: NotificationsState = {
  unread: undefined,
  polling: false,
  epoch: 0,
  pollEpoch: 0,
  marks: {},
};

export const selectUnreadCount = (state: RootState): number | undefined =>
  state.notifications.unread;

function noMarksInFlight(state: NotificationsState): boolean {
  return Object.keys(state.marks).length === 0;
}

function without(
  marks: Readonly<Record<string, number>>,
  requestId: string,
): Readonly<Record<string, number>> {
  return Object.fromEntries(Object.entries(marks).filter(([id]) => id !== requestId));
}

const COUNT_URL = '/api/v1/notifications/unread-count';
const READ_URL = '/api/v1/notifications/read';

function countIn(body: unknown): number | undefined {
  if (typeof body !== 'object' || body === null || !('count' in body)) return undefined;
  const { count } = body;
  return typeof count === 'number' && Number.isInteger(count) && count >= 0 ? count : undefined;
}

// Asks the server for the count. A failure is silent on purpose (the bell keeps the number it had):
// a badge that shouts about being unable to refresh is worse than one a minute behind. Not asked
// while a poll is already out or a read is in flight (the read's own answer is the freshest).
export const pollUnread = createAppAsyncThunk<number, undefined>(
  'notifications/pollUnread',
  async (_arg, { extra, rejectWithValue, signal }) => {
    try {
      // The signal lets the hook cancel a poll that is still on its way (see useBadgePoll).
      const response = await extra.fetch(COUNT_URL, { cache: 'no-store', signal });
      if (!response.ok) return rejectWithValue('poll_failed');
      const count = countIn(await response.json());
      return count === undefined ? rejectWithValue('poll_failed') : count;
    } catch {
      return rejectWithValue('poll_failed');
    }
  },
  {
    condition: (_arg, { getState }) => {
      const state = getState().notifications;
      return !state.polling && noMarksInFlight(state);
    },
  },
);

type MarkReadArg =
  // Some rows, and how many of them were unread (the caller knows; the server does not say).
  { readonly ids: readonly string[]; readonly unreadAmong: number } | { readonly all: true };

// Marks rows read: the count drops at once, and comes back if the route says no. The failure's
// words are `errorCopy`'s, from the code, shown as a toast by `toastsSlice`.
export const markNotificationsRead = createAppAsyncThunk<
  undefined,
  MarkReadArg,
  { rejectValue: MutationFailure }
>('notifications/markRead', async (arg, { extra, rejectWithValue }) => {
  try {
    const response = await extra.fetch(READ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify('all' in arg ? { all: true } : { ids: arg.ids }),
    });
    if (!response.ok) return rejectWithValue(await readApiError(response));
    return undefined;
  } catch {
    return rejectWithValue({ code: 'network', rateLimit: undefined });
  }
});

const notificationsSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    // The count the server rendered with the page. Taken only when nothing is in flight, so a page
    // that finishes loading mid-read cannot undo the read.
    unreadSeeded(state, action: PayloadAction<number>) {
      if (noMarksInFlight(state) && !state.polling) state.unread = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(pollUnread.pending, (state) => {
        state.polling = true;
        state.pollEpoch = state.epoch;
      })
      .addCase(pollUnread.fulfilled, (state, action) => {
        state.polling = false;
        if (state.pollEpoch === state.epoch && noMarksInFlight(state)) {
          state.unread = action.payload;
        }
      })
      .addCase(pollUnread.rejected, (state, action) => {
        // A poll the condition turned away never started: the one that did is still out.
        if (action.meta.condition) return;
        state.polling = false;
      })
      .addCase(markNotificationsRead.pending, (state, action) => {
        const unread = state.unread ?? 0;
        const arg = action.meta.arg;
        const taken = 'all' in arg ? unread : Math.min(Math.max(arg.unreadAmong, 0), unread);
        state.epoch += 1;
        state.marks[action.meta.requestId] = taken;
        if (state.unread !== undefined) state.unread = unread - taken;
      })
      .addCase(markNotificationsRead.fulfilled, (state, action) => {
        state.marks = without(state.marks, action.meta.requestId);
      })
      .addCase(markNotificationsRead.rejected, (state, action) => {
        const taken = state.marks[action.meta.requestId];
        if (taken === undefined) return;
        state.marks = without(state.marks, action.meta.requestId);
        state.epoch += 1;
        if (state.unread !== undefined) state.unread += taken;
      });
  },
});

export const { unreadSeeded } = notificationsSlice.actions;
export const notificationsReducer = notificationsSlice.reducer;
