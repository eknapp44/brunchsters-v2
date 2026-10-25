import type { PlaceDetails } from '@brunchsters/core';
import { MAX_INVITES_PER_REQUEST } from '@brunchsters/shared';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { ClientErrorCode } from '@/lib/errorCopy';
import { readApiError } from '@/lib/readApiError';
import { createAppAsyncThunk } from './hooks';
import type { RootState } from './makeStore';

export type WizardStep = 1 | 2 | 3 | 4;

// Serializable on purpose (ADR 0011): times are ISO strings, not Dates.
export type WizardState = {
  readonly step: WizardStep;
  readonly title: string;
  readonly description: string;
  readonly locations: readonly PlaceDetails[];
  readonly times: readonly string[];
  readonly votingDeadline: string;
  readonly emails: readonly string[];
  readonly submitting: boolean;
  // Why the create failed, as a code the page words (`errorCopy`): the store holds no text.
  readonly submitError: ClientErrorCode | undefined;
  // The create request this wizard is waiting on; a failure from any other request (one from an
  // earlier visit, before the wizard was reset) must not touch it.
  readonly requestId: string | undefined;
};

export const initialWizardState: WizardState = {
  step: 1,
  title: '',
  description: '',
  locations: [],
  times: [],
  votingDeadline: '',
  emails: [],
  submitting: false,
  submitError: undefined,
  requestId: undefined,
};

// What a successful create hands back. `invitesFailed` is true when the brunch exists but its invite
// batch was refused for a reason the invite panel's own counters do not show (a 500, offline): the
// panel then says so (`noticesSlice`), because the addresses are gone with the wizard. A batch
// refused for the day's budget (a 429) is not a failure here: the brunch page asks the counters and
// opens with its send button waiting and the reason shown (spec 0012).
export type CreatedBrunch = { readonly id: string; readonly invitesFailed: boolean };

// Creates the brunch, then sends the invites. Router navigation stays in the component.
export const createBrunch = createAppAsyncThunk<
  CreatedBrunch,
  undefined,
  { rejectValue: ClientErrorCode }
>(
  'wizard/createBrunch',
  async (_arg, { getState, extra, rejectWithValue }) => {
    const wizard = getState().wizard;
    try {
      const response = await extra.fetch('/api/v1/brunches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: wizard.title.trim(),
          ...(wizard.description !== '' ? { description: wizard.description } : {}),
          locations: wizard.locations.map((location) => ({
            placeId: location.placeId,
            placeName: location.name,
            placeAddress: location.address,
            placeUrl: location.placeUrl,
            timezone: location.timezone,
          })),
          times: wizard.times.map((scheduledAt) => ({ scheduledAt })),
          ...(wizard.votingDeadline !== ''
            ? { votingDeadline: new Date(wizard.votingDeadline).toISOString() }
            : {}),
        }),
      });

      if (!response.ok) return rejectWithValue((await readApiError(response)).code);

      const created = (await response.json()) as { id: string };

      let invitesFailed = false;
      if (wizard.emails.length > 0) {
        // The brunch already exists, so a failed batch must not block the redirect the way a failed
        // create does: the host lands on it, and the invite panel says the invites did not go out.
        try {
          const invites = await extra.fetch(`/api/v1/brunches/${created.id}/invites`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emails: wizard.emails }),
          });
          invitesFailed = !invites.ok && invites.status !== 429;
        } catch {
          invitesFailed = true;
        }
      }

      return { id: created.id, invitesFailed };
    } catch {
      return rejectWithValue('network');
    }
  },
  {
    // A second click while the first create is in flight sends nothing, whatever the button
    // looks like: it must not be possible to create the same brunch twice.
    condition: (_arg, { getState }) => !getState().wizard.submitting,
  },
);

const wizardSlice = createSlice({
  name: 'wizard',
  initialState: initialWizardState,
  reducers: {
    titleChanged(state, action: PayloadAction<string>) {
      state.title = action.payload;
    },
    descriptionChanged(state, action: PayloadAction<string>) {
      state.description = action.payload;
    },
    stepChosen(state, action: PayloadAction<WizardStep>) {
      state.step = action.payload;
    },
    locationAdded(state, action: PayloadAction<PlaceDetails>) {
      state.locations.push(action.payload);
    },
    locationRemoved(state, action: PayloadAction<string>) {
      state.locations = state.locations.filter((location) => location.placeId !== action.payload);
    },
    timeAdded(state, action: PayloadAction<string>) {
      state.times.push(action.payload);
    },
    timeRemoved(state, action: PayloadAction<number>) {
      state.times = state.times.filter((_, index) => index !== action.payload);
    },
    votingDeadlineChanged(state, action: PayloadAction<string>) {
      state.votingDeadline = action.payload;
    },
    emailAdded(state, action: PayloadAction<string>) {
      // The server refuses a request with more addresses than this, and the wizard sends
      // them all at once, so the list stops here rather than failing silently on submit.
      if (state.emails.includes(action.payload) || state.emails.length >= MAX_INVITES_PER_REQUEST) {
        return;
      }
      state.emails.push(action.payload);
    },
    emailRemoved(state, action: PayloadAction<string>) {
      state.emails = state.emails.filter((email) => email !== action.payload);
    },
    // Dispatched when the wizard page unmounts: the store outlives the page (it lives in the
    // layout), but a half-filled wizard must not (journey R1).
    wizardReset() {
      return initialWizardState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(createBrunch.pending, (state, action) => {
        state.submitting = true;
        state.submitError = undefined;
        state.requestId = action.meta.requestId;
      })
      // On success `submitting` stays true: the page is navigating away.
      .addCase(createBrunch.rejected, (state, action) => {
        // A different (or no) request id means the wizard was reset, and perhaps submitted again,
        // since this request started; a late failure must not touch the new state.
        if (state.requestId !== action.meta.requestId) return;
        state.requestId = undefined;
        state.submitting = false;
        state.submitError = action.payload ?? 'internal';
      });
  },
});

export const {
  titleChanged,
  descriptionChanged,
  stepChosen,
  locationAdded,
  locationRemoved,
  timeAdded,
  timeRemoved,
  votingDeadlineChanged,
  emailAdded,
  emailRemoved,
  wizardReset,
} = wizardSlice.actions;

export const wizardReducer = wizardSlice.reducer;

export const selectWizard = (state: RootState): WizardState => state.wizard;
export const selectWizardStep = (state: RootState): WizardStep => state.wizard.step;
