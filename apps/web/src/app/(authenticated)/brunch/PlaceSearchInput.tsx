'use client';

import type { PlaceDetails, PlaceResult } from '@brunchsters/core';
import { useEffect, useState } from 'react';

export function PlaceSearchInput({
  onSelect,
  disabled,
}: {
  readonly onSelect: (details: PlaceDetails) => void;
  readonly disabled?: boolean;
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
    const response = await fetch(`/api/v1/places/${placeId}?${params.toString()}`);
    if (response.ok) {
      const details = (await response.json()) as PlaceDetails;
      onSelect(details);
    }
    setQuery('');
    setPredictions([]);
    setSessionToken(undefined);
  }

  return (
    <div>
      <input
        type="text"
        value={query}
        disabled={disabled}
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
    </div>
  );
}
