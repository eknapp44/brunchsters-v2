'use client';

import type { PlaceDetails, PlaceResult } from '@brunchsters/core';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/icons/Icon';
import { InlineAlert } from '@/components/ui/InlineAlert';
import { limitedMessage, type RateLimitFacts } from '@/lib/limitedCopy';
import { readRateLimit } from '@/lib/readRateLimit';
import styles from './PlaceSearchInput.module.css';

export function PlaceSearchInput({
  onSelect,
  onError,
  disabled,
}: {
  readonly onSelect: (details: PlaceDetails) => void;
  // Called when the place-details fetch itself fails (as opposed to
  // onSelect's own caller-side failure, e.g. the suggestion POST) — without
  // this, a failed details lookup used to clear the input and do nothing,
  // silently (architect review, F10). Optional since the wizard caller has
  // nowhere to show it; both current OptionManager/OptionSuggestionControl
  // callers pass it.
  readonly onError?: () => void;
  readonly disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [sessionToken, setSessionToken] = useState<string | undefined>(undefined);
  const [predictions, setPredictions] = useState<readonly PlaceResult[]>([]);
  // Set when the server says to slow down (spec 0012). The input stays usable, because the wait is
  // seconds and typing is continuous; what is already listed stays, and the line goes by itself.
  const [limit, setLimit] = useState<RateLimitFacts | undefined>(undefined);

  useEffect(() => {
    if (limit === undefined) return undefined;
    const timer = setTimeout(() => setLimit(undefined), limit.retryAfterSeconds * 1000);
    return () => clearTimeout(timer);
  }, [limit]);

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
        .then(async (response) => {
          const facts = await readRateLimit(response);
          if (facts !== undefined) {
            setLimit(facts);
            return;
          }
          const data = response.ok
            ? ((await response.json()) as { places: readonly PlaceResult[] })
            : undefined;
          setLimit(undefined);
          setPredictions(data?.places ?? []);
        })
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

    const response = await fetch(`/api/v1/places/${placeId}?${params.toString()}`);
    if (!response.ok) {
      const facts = await readRateLimit(response);
      if (facts !== undefined) setLimit(facts);
      onError?.();
      return;
    }
    const details = (await response.json()) as PlaceDetails;
    onSelect(details);
  }

  return (
    <div>
      <div className={styles.field}>
        <span className={styles.icon}>
          <Icon name="search" size={18} />
        </span>
        <input
          className={styles.input}
          type="text"
          value={query}
          disabled={disabled}
          onChange={(event) => handleQueryChange(event.target.value)}
          placeholder="Search for a place"
        />
      </div>
      {limit !== undefined && (
        <div className={styles.note}>
          <InlineAlert tone="info" role="status">
            <p>{limitedMessage(limit)}</p>
          </InlineAlert>
        </div>
      )}
      {predictions.length > 0 && (
        <ul className={styles.results} role="list">
          {predictions.map((prediction) => (
            <li key={prediction.placeId}>
              <button
                className={styles.option}
                type="button"
                onClick={() => void selectPlace(prediction.placeId)}
              >
                {prediction.name} — {prediction.address}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
