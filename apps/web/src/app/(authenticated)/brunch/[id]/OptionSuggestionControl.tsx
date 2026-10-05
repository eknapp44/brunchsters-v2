'use client';

import type { PlaceDetails, PlaceResult } from '@brunchsters/core';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type PendingLocationSuggestion = {
  readonly id: string;
  readonly placeName: string;
  readonly placeAddress: string;
};

type PendingTimeSuggestion = {
  readonly id: string;
  readonly scheduledAt: Date;
};

export function LocationSuggestionControl({
  brunchId,
  canSuggest,
  pendingSuggestions,
}: {
  readonly brunchId: string;
  readonly canSuggest: boolean;
  readonly pendingSuggestions: readonly PendingLocationSuggestion[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [sessionToken, setSessionToken] = useState<string | undefined>(undefined);
  const [predictions, setPredictions] = useState<readonly PlaceResult[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

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
        .then((response) =>
          response.ok
            ? (response.json() as Promise<{ places: readonly PlaceResult[] }>)
            : undefined,
        )
        .then((data) => setPredictions(data?.places ?? []))
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
    setQuery('');
    setPredictions([]);
    setSessionToken(undefined);

    const detailsResponse = await fetch(`/api/v1/places/${placeId}?${params.toString()}`);
    if (!detailsResponse.ok) {
      setError('Failed to suggest location');
      return;
    }
    const details = (await detailsResponse.json()) as PlaceDetails;

    setSubmitting(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/v1/brunches/${brunchId}/location-suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placeId: details.placeId,
          placeName: details.name,
          placeAddress: details.address,
          placeUrl: details.placeUrl,
          timezone: details.timezone,
        }),
      });
      if (!response.ok) {
        setError('Failed to suggest location');
        return;
      }
      router.refresh();
    } catch {
      setError('Failed to suggest location');
    } finally {
      setSubmitting(false);
    }
  }

  if (!canSuggest && pendingSuggestions.length === 0) return null;

  return (
    <section>
      <h3>Suggest a Location</h3>

      {pendingSuggestions.length > 0 && (
        <ul>
          {pendingSuggestions.map((suggestion) => (
            <li key={suggestion.id}>
              {suggestion.placeName} — {suggestion.placeAddress} (awaiting host approval)
            </li>
          ))}
        </ul>
      )}

      {canSuggest && (
        <>
          <input
            type="text"
            value={query}
            disabled={submitting}
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
        </>
      )}
      {error !== undefined && <p role="alert">{error}</p>}
    </section>
  );
}

export function TimeSuggestionControl({
  brunchId,
  canSuggest,
  pendingSuggestions,
}: {
  readonly brunchId: string;
  readonly canSuggest: boolean;
  readonly pendingSuggestions: readonly PendingTimeSuggestion[];
}) {
  const router = useRouter();
  const [timeInput, setTimeInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function suggest(): Promise<void> {
    if (timeInput === '') return;

    setSubmitting(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/v1/brunches/${brunchId}/time-suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledAt: new Date(timeInput).toISOString() }),
      });
      if (!response.ok) {
        setError('Failed to suggest time');
        return;
      }
      setTimeInput('');
      router.refresh();
    } catch {
      setError('Failed to suggest time');
    } finally {
      setSubmitting(false);
    }
  }

  if (!canSuggest && pendingSuggestions.length === 0) return null;

  return (
    <section>
      <h3>Suggest a Time</h3>

      {pendingSuggestions.length > 0 && (
        <ul>
          {pendingSuggestions.map((suggestion) => (
            <li key={suggestion.id}>
              {suggestion.scheduledAt.toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}{' '}
              (awaiting host approval)
            </li>
          ))}
        </ul>
      )}

      {canSuggest && (
        <>
          <input
            type="datetime-local"
            value={timeInput}
            disabled={submitting}
            onChange={(event) => setTimeInput(event.target.value)}
          />
          <button type="button" onClick={() => void suggest()} disabled={submitting}>
            {submitting ? 'Suggesting…' : 'Suggest'}
          </button>
        </>
      )}
      {error !== undefined && <p role="alert">{error}</p>}
    </section>
  );
}
