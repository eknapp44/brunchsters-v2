'use client';

import type { PlaceDetails } from '@brunchsters/core';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PopIcon } from '@/components/icons/PopIcon';
import { Button } from '@/components/ui/Button';
import { DateTimeInput } from '@/components/ui/DateTimeInput';
import { InlineAlert } from '@/components/ui/InlineAlert';
import { LocalDateTime } from '@/components/ui/LocalDateTime';
import { errorCopy, pageIsStale } from '@/lib/errorCopy';
import { useMutation } from '@/store/useMutation';
import { PlaceSearchInput } from '../PlaceSearchInput';
import styles from './detail.module.css';

type PendingLocationSuggestion = {
  readonly id: string;
  readonly placeName: string;
  readonly placeAddress: string;
};

type PendingTimeSuggestion = {
  readonly id: string;
  readonly scheduledAt: Date;
};

// Suggesting has a field or a search the person used, so a failure stays inline beside it.
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
  const suggestion = useMutation(`suggest-location:${brunchId}`);
  // The place lookup itself failed (before anything was suggested).
  const [lookupError, setLookupError] = useState<string | undefined>(undefined);

  async function suggest(details: PlaceDetails): Promise<void> {
    setLookupError(undefined);
    const result = await suggestion.run({
      request: {
        url: `/api/v1/brunches/${brunchId}/location-suggestions`,
        method: 'POST',
        body: {
          placeId: details.placeId,
          placeName: details.name,
          placeAddress: details.address,
          placeUrl: details.placeUrl,
          timezone: details.timezone,
        },
      },
      failure: 'inline',
    });
    if (result.ok || (result.failure !== undefined && pageIsStale(result.failure.code))) {
      router.refresh();
    }
  }

  if (!canSuggest && pendingSuggestions.length === 0) return null;

  const error = lookupError ?? suggestion.failure?.text;

  return (
    <section className={styles.panel}>
      <h3>Suggest a Location</h3>

      {pendingSuggestions.length > 0 && (
        <ul className={styles.rows} role="list">
          {pendingSuggestions.map((pending) => (
            <li key={pending.id} className={styles.row}>
              <span className={styles.rowMain}>
                <PopIcon name="pin" size={22} />
                <span className={styles.rowText}>
                  <span className={styles.name}>{pending.placeName}</span>{' '}
                  <span className={styles.detail}>(awaiting host approval)</span>
                  <span className={styles.address}>{pending.placeAddress}</span>
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {canSuggest && (
        <PlaceSearchInput
          onSelect={(details) => void suggest(details)}
          onError={() => setLookupError(errorCopy({ code: 'unavailable' }))}
          disabled={suggestion.pending}
        />
      )}
      {error !== undefined && (
        <InlineAlert tone="error" role="alert">
          <p>{error}</p>
        </InlineAlert>
      )}
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
  const suggestion = useMutation(`suggest-time:${brunchId}`);

  async function suggest(): Promise<void> {
    if (timeInput === '') return;

    const result = await suggestion.run({
      request: {
        url: `/api/v1/brunches/${brunchId}/time-suggestions`,
        method: 'POST',
        body: { scheduledAt: new Date(timeInput).toISOString() },
      },
      failure: 'inline',
    });
    if (result.ok) setTimeInput('');
    if (result.ok || (result.failure !== undefined && pageIsStale(result.failure.code))) {
      router.refresh();
    }
  }

  if (!canSuggest && pendingSuggestions.length === 0) return null;

  return (
    <section className={styles.panel}>
      <h3>Suggest a Time</h3>

      {pendingSuggestions.length > 0 && (
        <ul className={styles.rows} role="list">
          {pendingSuggestions.map((pending) => (
            <li key={pending.id} className={styles.row}>
              <span className={styles.rowMain}>
                <PopIcon name="clock" size={22} />
                <span className={styles.rowText}>
                  <LocalDateTime date={pending.scheduledAt} />{' '}
                  <span className={styles.detail}>(awaiting host approval)</span>
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {canSuggest && (
        <div className={styles.addRow}>
          <DateTimeInput
            placeholderText="Suggest a time"
            aria-label="Suggested date and time"
            value={timeInput}
            disabled={suggestion.pending}
            onChange={(event) => setTimeInput(event.target.value)}
          />
          <Button
            type="button"
            aria-label="Suggest this time"
            onClick={() => void suggest()}
            aria-disabled={suggestion.pending ? true : undefined}
          >
            {suggestion.pending ? 'Suggesting…' : 'Suggest'}
          </Button>
        </div>
      )}
      {suggestion.failure !== undefined && (
        <InlineAlert tone="error" role="alert">
          <p>{suggestion.failure.text}</p>
        </InlineAlert>
      )}
    </section>
  );
}
