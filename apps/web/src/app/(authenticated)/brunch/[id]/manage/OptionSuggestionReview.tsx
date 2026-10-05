'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

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
    <section>
      <h2>Pending Suggestions</h2>

      {locationSuggestions.length > 0 && (
        <ul>
          {locationSuggestions.map((suggestion) => (
            <li key={suggestion.id}>
              {suggestion.placeName} — {suggestion.placeAddress} — suggested by{' '}
              {suggestion.suggestedByName}
              <button
                type="button"
                onClick={() => void review('location', suggestion.id, 'approve')}
                disabled={pendingId === suggestion.id}
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => void review('location', suggestion.id, 'decline')}
                disabled={pendingId === suggestion.id}
              >
                Decline
              </button>
            </li>
          ))}
        </ul>
      )}

      {timeSuggestions.length > 0 && (
        <ul>
          {timeSuggestions.map((suggestion) => (
            <li key={suggestion.id}>
              {suggestion.scheduledAt.toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}{' '}
              — suggested by {suggestion.suggestedByName}
              <button
                type="button"
                onClick={() => void review('time', suggestion.id, 'approve')}
                disabled={pendingId === suggestion.id}
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => void review('time', suggestion.id, 'decline')}
                disabled={pendingId === suggestion.id}
              >
                Decline
              </button>
            </li>
          ))}
        </ul>
      )}

      {error !== undefined && <p role="alert">{error}</p>}
    </section>
  );
}
