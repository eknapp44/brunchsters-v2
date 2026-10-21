import type { PlaceDetails } from '@brunchsters/core';
import { MAX_INVITES_PER_REQUEST } from '@brunchsters/shared';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
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
  readonly submitError: string | undefined;
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

const CREATE_FAILED_MESSAGE = 'Failed to create brunch';

type ApiErrorBody = {
  readonly error?: string;
  readonly errors?: ReadonlyArray<{ readonly message?: string }>;
};

async function extractErrorMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => undefined)) as ApiErrorBody | undefined;
  if (body?.error !== undefined) return body.error;
  if (body?.errors !== undefined && body.errors.length > 0) {
    const messages = body.errors
      .map((issue) => issue.message)
      .filter((message): message is string => message !== undefined);
    if (messages.length > 0) return messages.join('; ');
  }
  return CREATE_FAILED_MESSAGE;
}

// Creates the brunch, then sends the invites. Router navigation stays in the component.
export const createBrunch = createAppAsyncThunk<{ readonly id: string }, undefined>(
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

      if (!response.ok) return rejectWithValue(await extractErrorMessage(response));

      const created = (await response.json()) as { id: string };

      if (wizard.emails.length > 0) {
        // Best-effort — the brunch already exists at this point, and a failed
        // send here can be retried from the detail page's invite panel, so it
        // shouldn't block the redirect the way a failed brunch creation does.
        try {
          await extra.fetch(`/api/v1/brunches/${created.id}/invites`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emails: wizard.emails }),
          });
        } catch {
          // Ignored — see comment above.
        }
      }

      return { id: created.id };
    } catch {
      return rejectWithValue(CREATE_FAILED_MESSAGE);
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
        state.submitError = action.payload ?? CREATE_FAILED_MESSAGE;
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
