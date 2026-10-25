'use client';

import type { PlaceDetails, PlaceResult } from '@brunchsters/core';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/icons/Icon';
import { InlineAlert } from '@/components/ui/InlineAlert';
import { errorCopy } from '@/lib/errorCopy';
import { limitedMessage, type RateLimitFacts } from '@/lib/limitedCopy';
import { readApiError } from '@/lib/readApiError';
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
  // The search could not be answered (our end, or no connection): said once, beside the input,
  // and gone with the next answer. It used to fail without a word.
  const [searchError, setSearchError] = useState<string | undefined>(undefined);
  // Which pick is the newest, and whether this input is still on screen: a details answer that
  // lands for an older pick, or after the input went away, is dropped.
  const latestPick = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (limit === undefined) return undefined;
    const timer = setTimeout(() => setLimit(undefined), limit.retryAfterSeconds * 1000);
    return () => clearTimeout(timer);
  }, [limit]);

  useEffect(() => {
    if (query.length < 3) {
      setPredictions([]);
      setSearchError(undefined);
      return undefined;
    }

    // One request per query. Typing on cancels the one still out (the abort), so a slow answer to
    // an earlier query can never land on top of the newest one's results.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      const params = new URLSearchParams({
        q: query,
        ...(sessionToken !== undefined ? { sessionToken } : {}),
      });
      void fetch(`/api/v1/places/search?${params.toString()}`, { signal: controller.signal })
        .then(async (response) => {
          if (response.ok) {
            const data = (await response.json()) as { places: readonly PlaceResult[] };
            if (controller.signal.aborted) return;
            setLimit(undefined);
            setSearchError(undefined);
            setPredictions(data.places);
            return;
          }
          const failure = await readApiError(response);
          if (controller.signal.aborted) return;
          if (failure.rateLimit !== undefined) {
            setLimit(failure.rateLimit);
            return;
          }
          setLimit(undefined);
          setPredictions([]);
          setSearchError(errorCopy({ code: failure.code }));
        })
        .catch(() => {
          // An aborted request is not a failure: a newer query replaced it.
          if (controller.signal.aborted) return;
          setPredictions([]);
          setSearchError(errorCopy({ code: 'network' }));
        });
    }, 300);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [query, sessionToken]);

  function handleQueryChange(value: string): void {
    if (sessionToken === undefined && value !== '') {
      setSessionToken(crypto.randomUUID());
    }
    setQuery(value);
  }

  async function selectPlace(placeId: string): Promise<void> {
    latestPick.current += 1;
    const thisPick = latestPick.current;
    const params = new URLSearchParams(sessionToken !== undefined ? { sessionToken } : {});
    setQuery('');
    setPredictions([]);
    setSessionToken(undefined);
    setSearchError(undefined);

    let response: Response;
    try {
      response = await fetch(`/api/v1/places/${placeId}?${params.toString()}`);
    } catch {
      if (mounted.current && latestPick.current === thisPick) onError?.();
      return;
    }
    // A newer pick, or this input gone: this answer is not wanted any more.
    if (!mounted.current || latestPick.current !== thisPick) return;
    if (!response.ok) {
      const failure = await readApiError(response);
      if (failure.rateLimit !== undefined) setLimit(failure.rateLimit);
      onError?.();
      return;
    }
    const details = (await response.json()) as PlaceDetails;
    if (!mounted.current || latestPick.current !== thisPick) return;
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
      {searchError !== undefined && (
        <div className={styles.note}>
          <InlineAlert tone="error" role="alert">
            <p>{searchError}</p>
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
