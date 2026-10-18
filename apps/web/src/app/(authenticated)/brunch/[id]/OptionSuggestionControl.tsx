'use client';

import type { PlaceDetails } from '@brunchsters/core';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PopIcon } from '@/components/icons/PopIcon';
import { Button } from '@/components/ui/Button';
import { InlineAlert } from '@/components/ui/InlineAlert';
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function suggest(details: PlaceDetails): Promise<void> {
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
    <section className={styles.panel}>
      <h3>Suggest a Location</h3>

      {pendingSuggestions.length > 0 && (
        <ul className={styles.rows} role="list">
          {pendingSuggestions.map((suggestion) => (
            <li key={suggestion.id} className={styles.row}>
              <span className={styles.rowMain}>
                <PopIcon name="pin" size={22} />
                <span>
                  {suggestion.placeName} — {suggestion.placeAddress}{' '}
                  <span className={styles.detail}>(awaiting host approval)</span>
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {canSuggest && (
        <PlaceSearchInput
          onSelect={(details) => void suggest(details)}
          onError={() => setError('Failed to suggest location')}
          disabled={submitting}
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
    <section className={styles.panel}>
      <h3>Suggest a Time</h3>

      {pendingSuggestions.length > 0 && (
        <ul className={styles.rows} role="list">
          {pendingSuggestions.map((suggestion) => (
            <li key={suggestion.id} className={styles.row}>
              <span className={styles.rowMain}>
                <PopIcon name="clock" size={22} />
                <span>
                  {suggestion.scheduledAt.toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}{' '}
                  <span className={styles.detail}>(awaiting host approval)</span>
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {canSuggest && (
        <div className={styles.addRow}>
          <input
            type="datetime-local"
            aria-label="Suggested date and time"
            value={timeInput}
            disabled={submitting}
            onChange={(event) => setTimeInput(event.target.value)}
          />
          <Button
            type="button"
            aria-label="Suggest this time"
            onClick={() => void suggest()}
            disabled={submitting}
          >
            {submitting ? 'Suggesting…' : 'Suggest'}
          </Button>
        </div>
      )}
      {error !== undefined && (
        <InlineAlert tone="error" role="alert">
          <p>{error}</p>
        </InlineAlert>
      )}
    </section>
  );
}
