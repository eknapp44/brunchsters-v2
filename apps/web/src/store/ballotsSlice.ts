import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { ClientErrorCode } from '@/lib/errorCopy';
import { readApiError } from '@/lib/readApiError';
import { createAppAsyncThunk } from './hooks';
import type { RootState } from './makeStore';

export type BallotKind = 'location' | 'time';

// One ballot per brunch and kind, so the place and time ballots of a brunch never touch.
export type BallotKey = `${string}:${BallotKind}`;

export function ballotKey(params: {
  readonly brunchId: string;
  readonly kind: BallotKind;
}): BallotKey {
  return `${params.brunchId}:${params.kind}`;
}

// Created on the first toggle. Until then the selection is whatever the server rendered.
export type BallotEntry = {
  readonly selected: readonly string[];
  // What to put back if the save fails.
  readonly previous: readonly string[];
  // The save this entry is waiting on. A result from any other request (one started on an
  // earlier visit, before the entry was released) must not touch it.
  readonly requestId: string;
  readonly submitting: boolean;
  // Why the last save failed, as a code the hook words (`errorCopy`): the store holds no text.
  readonly error: ClientErrorCode | undefined;
  readonly emptyWarning: boolean;
};

export type BallotsState = {
  readonly byKey: Readonly<Record<string, BallotEntry | undefined>>;
  // How many of this person's own votes have been saved (spec 0015 M8). The vote-count live region
  // compares it with what it last saw: a count that changed while this went up is the person's own
  // tap and is not announced; a change with this unchanged came from someone else.
  readonly ownSaves: number;
};

const initialState: BallotsState = { byKey: {}, ownSaves: 0 };

const VOTE_PATH: Record<BallotKind, string> = {
  location: 'locations',
  time: 'times',
};

// What the voter has ticked: the stored selection, or the server's, minus any option that no
// longer exists. The filter runs on every read, so an option the host removed drops out
// instead of being resubmitted forever and refused as unknown (spec 0005 review F2).
export function effectiveSelection(params: {
  readonly entry: BallotEntry | undefined;
  readonly seeded: readonly string[];
  readonly optionIds: readonly string[];
}): readonly string[] {
  const valid = new Set(params.optionIds);
  return (params.entry?.selected ?? params.seeded).filter((id) => valid.has(id));
}

function toggled(current: readonly string[], optionId: string): readonly string[] {
  return current.includes(optionId)
    ? current.filter((id) => id !== optionId)
    : [...current, optionId];
}

export const selectBallotEntry = (state: RootState, key: BallotKey): BallotEntry | undefined =>
  state.ballots.byKey[key];

export const selectOwnSaves = (state: RootState): number => state.ballots.ownSaves;

// A ballot with something the page must not replace under the voter's hands: a save on its way, a
// failure still showing beside the boxes, or everything unticked (nothing to save, a warning shown).
// Used by the refresh on focus (spec 0015 M8).
export const selectHasUnsavedBallot = (state: RootState): boolean =>
  Object.values(state.ballots.byKey).some(
    (entry) =>
      entry !== undefined && (entry.submitting || entry.error !== undefined || entry.emptyWarning),
  );

export type ToggleBallotArg = {
  readonly brunchId: string;
  readonly kind: BallotKind;
  readonly optionId: string;
  // The effective selection the voter sees right now (see `effectiveSelection`).
  readonly current: readonly string[];
  // Voting closed, or the voter's RSVP does not allow it.
  readonly readOnly: boolean;
};

// Applies the toggle at once and saves the whole ballot. Resolves `{ saved: false }` when
// nothing was sent (an empty ballot is never submitted); rejects with the code of the failure
// (the route's, or `network`), which the ballot shows inline: a failed vote rolls back and stays
// beside the checkboxes, because it is the voter's to try again (spec 0014).
export const toggleBallotOption = createAppAsyncThunk<
  { readonly saved: boolean },
  ToggleBallotArg,
  { rejectValue: ClientErrorCode }
>(
  'ballots/toggleBallotOption',
  async (arg, { extra, rejectWithValue }) => {
    const next = toggled(arg.current, arg.optionId);
    if (next.length === 0) return { saved: false };
    try {
      const response = await extra.fetch(
        `/api/v1/brunches/${arg.brunchId}/votes/${VOTE_PATH[arg.kind]}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ optionIds: next }),
        },
      );
      if (!response.ok) return rejectWithValue((await readApiError(response)).code);
      return { saved: true };
    } catch {
      return rejectWithValue('network');
    }
  },
  {
    // A click while a save is in flight, or on a read-only ballot, does nothing at all.
    condition: (arg, { getState }) =>
      !arg.readOnly && selectBallotEntry(getState(), ballotKey(arg))?.submitting !== true,
  },
);

const ballotsSlice = createSlice({
  name: 'ballots',
  initialState,
  reducers: {
    // The ballot's checklist unmounted: a later visit reseeds from the server.
    ballotReleased(state, action: PayloadAction<BallotKey>) {
      state.byKey = Object.fromEntries(
        Object.entries(state.byKey).filter(([key]) => key !== action.payload),
      );
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(toggleBallotOption.pending, (state, action) => {
        const arg = action.meta.arg;
        const selected = [...toggled(arg.current, arg.optionId)];
        const sending = selected.length > 0;
        const entry = state.byKey[ballotKey(arg)];
        state.byKey[ballotKey(arg)] = {
          selected,
          previous: [...arg.current],
          requestId: action.meta.requestId,
          submitting: sending,
          // Only a new save clears the last error; unchecking the last box does not.
          error: sending ? undefined : entry?.error,
          emptyWarning: !sending,
        };
      })
      .addCase(toggleBallotOption.fulfilled, (state, action) => {
        const entry = state.byKey[ballotKey(action.meta.arg)];
        if (entry?.requestId === action.meta.requestId) entry.submitting = false;
        if (action.payload.saved) state.ownSaves += 1;
      })
      // A failed save must not leave a checked box for a vote that was never recorded.
      .addCase(toggleBallotOption.rejected, (state, action) => {
        const entry = state.byKey[ballotKey(action.meta.arg)];
        if (entry?.requestId !== action.meta.requestId) return;
        entry.selected = [...entry.previous];
        entry.submitting = false;
        entry.error = action.payload ?? 'internal';
      });
  },
});

export const { ballotReleased } = ballotsSlice.actions;
export const ballotsReducer = ballotsSlice.reducer;
