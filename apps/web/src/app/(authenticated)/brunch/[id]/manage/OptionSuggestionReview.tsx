'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PopIcon } from '@/components/icons/PopIcon';
import { Button } from '@/components/ui/Button';
import { InlineAlert } from '@/components/ui/InlineAlert';
import { LocalDateTime } from '@/components/ui/LocalDateTime';
import detail from '../detail.module.css';

type PendingLocationSuggestion = {
  readonly id: string;
  readonly placeName: string;
  readonly placeAddress: string;
  readonly suggestedByName: string;
};

type PendingTimeSuggestion = {
  readonly id: string;
  readonly scheduledAt: Date;
  readonly suggestedByName: string;
};

export function OptionSuggestionReview({
  locationSuggestions,
  timeSuggestions,
}: {
  readonly locationSuggestions: readonly PendingLocationSuggestion[];
  readonly timeSuggestions: readonly PendingTimeSuggestion[];
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  async function review(
    kind: 'location' | 'time',
    suggestionId: string,
    decision: 'approve' | 'decline',
  ): Promise<void> {
    if (pendingId !== undefined) return;

    setPendingId(suggestionId);
    setError(undefined);
    try {
      const path = kind === 'location' ? 'location-suggestions' : 'time-suggestions';
      const response = await fetch(`/api/v1/${path}/${suggestionId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      if (!response.ok) {
        setError('Failed to review suggestion');
        return;
      }
      router.refresh();
    } catch {
      setError('Failed to review suggestion');
    } finally {
      setPendingId(undefined);
    }
  }

  if (locationSuggestions.length === 0 && timeSuggestions.length === 0) return null;

  return (
    <section className={detail.panel}>
      <h2>Pending Suggestions</h2>

      {locationSuggestions.length > 0 && (
        <ul className={detail.rows} role="list">
          {locationSuggestions.map((suggestion) => (
            <li key={suggestion.id} className={detail.row}>
              <span className={detail.rowMain}>
                <PopIcon name="pin" size={22} />
                <span className={detail.rowText}>
                  <span className={detail.name}>{suggestion.placeName}</span>{' '}
                  <span className={detail.detail}>(suggested by {suggestion.suggestedByName})</span>
                  <span className={detail.address}>{suggestion.placeAddress}</span>
                </span>
              </span>
              <span className={detail.rowActions}>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void review('location', suggestion.id, 'approve')}
                  disabled={pendingId === suggestion.id}
                >
                  Approve
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void review('location', suggestion.id, 'decline')}
                  disabled={pendingId === suggestion.id}
                >
                  Decline
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {timeSuggestions.length > 0 && (
        <ul className={detail.rows} role="list">
          {timeSuggestions.map((suggestion) => (
            <li key={suggestion.id} className={detail.row}>
              <span className={detail.rowMain}>
                <PopIcon name="clock" size={22} />
                <span className={detail.rowText}>
                  <LocalDateTime date={suggestion.scheduledAt} />{' '}
                  <span className={detail.detail}>(suggested by {suggestion.suggestedByName})</span>
                </span>
              </span>
              <span className={detail.rowActions}>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void review('time', suggestion.id, 'approve')}
                  disabled={pendingId === suggestion.id}
                >
                  Approve
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void review('time', suggestion.id, 'decline')}
                  disabled={pendingId === suggestion.id}
                >
                  Decline
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {error !== undefined && (
        <InlineAlert tone="error" role="alert">
          <p>{error}</p>
        </InlineAlert>
      )}
    </section>
  );
}
