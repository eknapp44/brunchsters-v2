'use client';

import { useRouter } from 'next/navigation';
import { PopIcon } from '@/components/icons/PopIcon';
import { Button } from '@/components/ui/Button';
import { LocalDateTime } from '@/components/ui/LocalDateTime';
import { pageIsStale } from '@/lib/errorCopy';
import { useMutation } from '@/store/useMutation';
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

// Approve and Decline are one tap with nothing to fix, so a failure is a toast and the row is as it
// was. One request state per suggestion (spec 0014), so two rows never wait on each other.
function ReviewActions({
  kind,
  suggestionId,
}: {
  readonly kind: 'location' | 'time';
  readonly suggestionId: string;
}) {
  const router = useRouter();
  const reviewing = useMutation(`option-review:${kind}:${suggestionId}`);

  async function review(decision: 'approve' | 'decline'): Promise<void> {
    if (reviewing.pending) return;
    const path = kind === 'location' ? 'location-suggestions' : 'time-suggestions';
    const result = await reviewing.run({
      request: {
        url: `/api/v1/${path}/${suggestionId}/review`,
        method: 'POST',
        body: { decision },
      },
      failure: 'toast',
    });
    if (result.ok || (result.failure !== undefined && pageIsStale(result.failure.code))) {
      router.refresh();
    }
  }

  return (
    <span className={detail.rowActions}>
      <Button
        type="button"
        size="sm"
        onClick={() => void review('approve')}
        aria-disabled={reviewing.pending ? true : undefined}
      >
        Approve
      </Button>
      <Button
        type="button"
        size="sm"
        onClick={() => void review('decline')}
        aria-disabled={reviewing.pending ? true : undefined}
      >
        Decline
      </Button>
    </span>
  );
}

export function OptionSuggestionReview({
  locationSuggestions,
  timeSuggestions,
}: {
  readonly locationSuggestions: readonly PendingLocationSuggestion[];
  readonly timeSuggestions: readonly PendingTimeSuggestion[];
}) {
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
              <ReviewActions kind="location" suggestionId={suggestion.id} />
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
              <ReviewActions kind="time" suggestionId={suggestion.id} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
