import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { createBrunch } from './wizardSlice';
import type { RootState } from './makeStore';

// A notice that has to outlive the page that caused it (spec 0014, ADR 0016). The wizard resets
// when its page unmounts, so what it learned about the invite batch cannot stay there: a brunch
// created with an invite batch that did not go out is noted here by id, and the brunch page's
// Invites panel says so until an invite is sent. The store is per mount, so a reload drops it
// (the panel then shows its ordinary "No invites sent yet.", which is true).
export type NoticesState = {
  readonly invitesDidNotGoOut: readonly string[];
};

const initialState: NoticesState = { invitesDidNotGoOut: [] };

export const selectInvitesDidNotGoOut = (state: RootState, brunchId: string): boolean =>
  state.notices.invitesDidNotGoOut.includes(brunchId);

const noticesSlice = createSlice({
  name: 'notices',
  initialState,
  reducers: {
    // An invite went out: the notice is over.
    invitesNoticeCleared(state, action: PayloadAction<string>) {
      state.invitesDidNotGoOut = state.invitesDidNotGoOut.filter((id) => id !== action.payload);
    },
  },
  extraReducers: (builder) => {
    builder.addCase(createBrunch.fulfilled, (state, action) => {
      const { id, invitesFailed } = action.payload;
      if (invitesFailed && !state.invitesDidNotGoOut.includes(id)) {
        state.invitesDidNotGoOut = [...state.invitesDidNotGoOut, id];
      }
    });
  },
});

export const { invitesNoticeCleared } = noticesSlice.actions;
export const noticesReducer = noticesSlice.reducer;
