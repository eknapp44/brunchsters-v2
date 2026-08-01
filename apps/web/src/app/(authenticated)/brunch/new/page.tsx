'use client';

import type { PlaceDetails, PlaceResult } from '@brunchsters/core';
import { useRouter } from 'next/navigation';
import { type Dispatch, useEffect, useReducer, useState } from 'react';

type WizardState = {
  readonly step: 1 | 2 | 3;
  readonly title: string;
  readonly description: string;
  readonly locations: readonly PlaceDetails[];
  readonly times: readonly Date[];
  readonly votingDeadline: string;
};

type WizardAction =
  | { readonly type: 'SET_TITLE'; readonly title: string }
  | { readonly type: 'SET_DESCRIPTION'; readonly description: string }
  | { readonly type: 'GO_TO_STEP'; readonly step: 1 | 2 | 3 }
  | { readonly type: 'ADD_LOCATION'; readonly location: PlaceDetails }
  | { readonly type: 'REMOVE_LOCATION'; readonly placeId: string }
  | { readonly type: 'ADD_TIME'; readonly time: Date }
  | { readonly type: 'REMOVE_TIME'; readonly index: number }
  | { readonly type: 'SET_VOTING_DEADLINE'; readonly value: string };

const initialState: WizardState = {
  step: 1,
  title: '',
  description: '',
  locations: [],
  times: [],
  votingDeadline: '',
};

const TITLE_MAX_LENGTH = 100;
const DESCRIPTION_MAX_LENGTH = 500;

// For the "Voting closes by" datetime-local input's min attribute — matches
// the server's future-only requirement so the browser blocks past dates too.
function nowAsDatetimeLocalValue(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

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
  return 'Failed to create brunch';
}

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_TITLE':
      return { ...state, title: action.title };
    case 'SET_DESCRIPTION':
      return { ...state, description: action.description };
    case 'GO_TO_STEP':
      return { ...state, step: action.step };
    case 'ADD_LOCATION':
      return { ...state, locations: [...state.locations, action.location] };
    case 'REMOVE_LOCATION':
      return {
        ...state,
        locations: state.locations.filter((location) => location.placeId !== action.placeId),
      };
    case 'ADD_TIME':
      return { ...state, times: [...state.times, action.time] };
    case 'REMOVE_TIME':
      return { ...state, times: state.times.filter((_, index) => index !== action.index) };
    case 'SET_VOTING_DEADLINE':
      return { ...state, votingDeadline: action.value };
    default: {
      const exhaustiveCheck: never = action;
      return exhaustiveCheck;
    }
  }
}

function StepOne({
  state,
  dispatch,
}: {
  readonly state: WizardState;
  readonly dispatch: Dispatch<WizardAction>;
}) {
  return (
    <section>
      <label>
        Title
        <input
          type="text"
          value={state.title}
          maxLength={TITLE_MAX_LENGTH}
          onChange={(event) => dispatch({ type: 'SET_TITLE', title: event.target.value })}
        />
      </label>
      <label>
        Description
        <textarea
          value={state.description}
          maxLength={DESCRIPTION_MAX_LENGTH}
          onChange={(event) =>
            dispatch({ type: 'SET_DESCRIPTION', description: event.target.value })
          }
        />
      </label>
      <button
        type="button"
        disabled={state.title.trim().length === 0}
        onClick={() => dispatch({ type: 'GO_TO_STEP', step: 2 })}
      >
        Next
      </button>
    </section>
  );
}

function StepTwo({
  state,
  dispatch,
}: {
  readonly state: WizardState;
  readonly dispatch: Dispatch<WizardAction>;
}) {
  const [query, setQuery] = useState('');
  const [sessionToken, setSessionToken] = useState<string | undefined>(undefined);
  const [predictions, setPredictions] = useState<readonly PlaceResult[]>([]);

  useEffect(() => {
    if (query.length < 3) {
      setPredictions([]);
      return;
    }

    const timeoutId = setTimeout(() => {
      const params = new URLSearchParams({
        q: query,
        ...(sessionToken !== undefined ? { sessionToken } : {}),
      });
      void fetch(`/api/v1/places/search?${params.toString()}`)
        .then((response) => response.json() as Promise<{ places: readonly PlaceResult[] }>)
        .then((data) => setPredictions(data.places))
        .catch(() => setPredictions([]));
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query, sessionToken]);

  function handleQueryChange(value: string): void {
    if (sessionToken === undefined && value !== '') {
      setSessionToken(crypto.randomUUID());
    }
    setQuery(value);
  }

  async function selectPlace(placeId: string): Promise<void> {
    const params = new URLSearchParams(sessionToken !== undefined ? { sessionToken } : {});
    const response = await fetch(`/api/v1/places/${placeId}?${params.toString()}`);
    if (response.ok) {
      const details = (await response.json()) as PlaceDetails;
      dispatch({ type: 'ADD_LOCATION', location: details });
    }
    setQuery('');
    setPredictions([]);
    setSessionToken(undefined);
  }

  return (
    <section>
      <input
        type="text"
        value={query}
        onChange={(event) => handleQueryChange(event.target.value)}
        placeholder="Search for a place"
      />
      {predictions.length > 0 && (
        <ul>
          {predictions.map((prediction) => (
            <li key={prediction.placeId}>
              <button type="button" onClick={() => void selectPlace(prediction.placeId)}>
                {prediction.name} — {prediction.address}
              </button>
            </li>
          ))}
        </ul>
      )}

      {state.locations.length > 0 && (
        <ul>
          {state.locations.map((location) => (
            <li key={location.placeId}>
              {location.name}
              <button
                type="button"
                onClick={() => dispatch({ type: 'REMOVE_LOCATION', placeId: location.placeId })}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {state.locations.length > 1 && <p>Multiple locations will be put to a vote</p>}

      <button type="button" onClick={() => dispatch({ type: 'GO_TO_STEP', step: 1 })}>
        Back
      </button>
      <button type="button" onClick={() => dispatch({ type: 'GO_TO_STEP', step: 3 })}>
        Next
      </button>
    </section>
  );
}

function StepThree({
  state,
  dispatch,
  onSubmit,
  submitting,
  submitError,
}: {
  readonly state: WizardState;
  readonly dispatch: Dispatch<WizardAction>;
  readonly onSubmit: () => void;
  readonly submitting: boolean;
  readonly submitError: string | undefined;
}) {
  const [timeInput, setTimeInput] = useState('');
  const showVotingDeadline = state.locations.length > 1 || state.times.length > 1;

  function addTime(): void {
    if (timeInput === '') return;
    dispatch({ type: 'ADD_TIME', time: new Date(timeInput) });
    setTimeInput('');
  }

  return (
    <section>
      <input
        type="datetime-local"
        value={timeInput}
        onChange={(event) => setTimeInput(event.target.value)}
      />
      <button type="button" onClick={addTime}>
        Add Time
      </button>

      {state.times.length > 0 && (
        <ul>
          {state.times.map((time, index) => (
            <li key={time.toISOString()}>
              {time.toLocaleString()}
              <button type="button" onClick={() => dispatch({ type: 'REMOVE_TIME', index })}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {state.times.length > 1 && <p>Multiple times will be put to a vote</p>}

      {showVotingDeadline && (
        <label>
          Voting closes by
          <input
            type="datetime-local"
            value={state.votingDeadline}
            min={nowAsDatetimeLocalValue()}
            onChange={(event) =>
              dispatch({ type: 'SET_VOTING_DEADLINE', value: event.target.value })
            }
          />
        </label>
      )}

      {submitError !== undefined && <p role="alert">{submitError}</p>}

      <button type="button" onClick={() => dispatch({ type: 'GO_TO_STEP', step: 2 })}>
        Back
      </button>
      <button type="button" onClick={onSubmit} disabled={submitting}>
        {submitting ? 'Creating…' : 'Create Brunch'}
      </button>
    </section>
  );
}

export default function NewBrunchPage() {
  const router = useRouter();
  const [state, dispatch] = useReducer(wizardReducer, initialState);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>(undefined);

  async function handleSubmit(): Promise<void> {
    setSubmitting(true);
    setSubmitError(undefined);

    try {
      const response = await fetch('/api/v1/brunches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: state.title.trim(),
          ...(state.description !== '' ? { description: state.description } : {}),
          locations: state.locations.map((location) => ({
            placeId: location.placeId,
            placeName: location.name,
            placeAddress: location.address,
            placeUrl: location.placeUrl,
            timezone: location.timezone,
          })),
          times: state.times.map((time) => ({ scheduledAt: time.toISOString() })),
          ...(state.votingDeadline !== ''
            ? { votingDeadline: new Date(state.votingDeadline).toISOString() }
            : {}),
        }),
      });

      if (!response.ok) {
        setSubmitError(await extractErrorMessage(response));
        setSubmitting(false);
        return;
      }

      const created = (await response.json()) as { id: string };
      router.push(`/brunch/${created.id}`);
    } catch {
      setSubmitError('Failed to create brunch');
      setSubmitting(false);
    }
  }

  return (
    <main>
      <h1>Plan a Brunch</h1>
      {state.step === 1 && <StepOne state={state} dispatch={dispatch} />}
      {state.step === 2 && <StepTwo state={state} dispatch={dispatch} />}
      {state.step === 3 && (
        <StepThree
          state={state}
          dispatch={dispatch}
          onSubmit={() => void handleSubmit()}
          submitting={submitting}
          submitError={submitError}
        />
      )}
    </main>
  );
}
