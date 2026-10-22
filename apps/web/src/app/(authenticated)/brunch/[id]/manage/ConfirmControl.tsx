'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { InlineAlert } from '@/components/ui/InlineAlert';
import detail from '../detail.module.css';
import styles from './manage.module.css';

type LocationOption = {
  readonly id: string;
  readonly placeName: string;
  readonly placeAddress: string;
  readonly voteCount: number;
};

type TimeOption = {
  readonly id: string;
  readonly scheduledAt: Date;
  readonly voteCount: number;
};

function voteCountLabel(voteCount: number): string {
  return `${voteCount} vote${voteCount === 1 ? '' : 's'}`;
}

// The leader preselects only when it's unambiguous — a genuine tie (including
// every option sitting at zero votes) leaves the host to pick (spec 0005).
function leaderId<TOption extends { readonly id: string; readonly voteCount: number }>(
  options: readonly TOption[],
): string | undefined {
  if (options.length === 0) return undefined;
  const maxVotes = Math.max(...options.map((option) => option.voteCount));
  const leaders = options.filter((option) => option.voteCount === maxVotes);
  return leaders.length === 1 ? leaders[0]?.id : undefined;
}

export function ConfirmControl({
  brunchId,
  locations,
  times,
  noOneElseAccepted,
  disabled,
}: {
  readonly brunchId: string;
  readonly locations: readonly LocationOption[];
  readonly times: readonly TimeOption[];
  readonly noOneElseAccepted: boolean;
  // True while the brunch is a draft: confirming needs an active brunch.
  readonly disabled: boolean;
}) {
  const router = useRouter();
  const [locationId, setLocationId] = useState<string | undefined>(() => leaderId(locations));
  const [timeId, setTimeId] = useState<string | undefined>(() => leaderId(times));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  // locationId/timeId only ever get set once (on mount) or by a radio click —
  // if the option they point at was removed by OptionManager in the same
  // session (a router.refresh(), not a remount), fall back to the current
  // list's own leader rather than submitting a confirm for a vanished option.
  const effectiveLocationId = locations.some((location) => location.id === locationId)
    ? locationId
    : leaderId(locations);
  const effectiveTimeId = times.some((time) => time.id === timeId) ? timeId : leaderId(times);

  async function confirm(): Promise<void> {
    if (effectiveLocationId === undefined || effectiveTimeId === undefined) return;

    setSubmitting(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/v1/brunches/${brunchId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId: effectiveLocationId, timeId: effectiveTimeId }),
      });
      if (!response.ok) {
        setError('Failed to confirm the brunch');
        return;
      }
      router.refresh();
    } catch {
      setError('Failed to confirm the brunch');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={detail.panel}>
      <h2>Confirm</h2>

      {noOneElseAccepted && (
        <InlineAlert>
          <p>No one else has accepted yet — you can still confirm.</p>
        </InlineAlert>
      )}

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Location</legend>
        {locations.map((location) => (
          <label key={location.id} className={detail.option}>
            <input
              type="radio"
              name="confirm-location"
              checked={effectiveLocationId === location.id}
              disabled={disabled || submitting}
              onChange={() => setLocationId(location.id)}
            />
            <span className={detail.optionText}>
              <span className={detail.name}>{location.placeName}</span>{' '}
              <span className={[detail.detail, detail.votes].join(' ')}>
                ({voteCountLabel(location.voteCount)})
              </span>
              <span className={detail.address}>{location.placeAddress}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Time</legend>
        {times.map((time) => (
          <label key={time.id} className={detail.option}>
            <input
              type="radio"
              name="confirm-time"
              checked={effectiveTimeId === time.id}
              disabled={disabled || submitting}
              onChange={() => setTimeId(time.id)}
            />
            <span className={detail.optionText}>
              <span className={detail.name}>
                {time.scheduledAt.toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </span>{' '}
              <span className={[detail.detail, detail.votes].join(' ')}>
                ({voteCountLabel(time.voteCount)})
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className={detail.choices}>
        <Button
          type="button"
          variant="primary"
          onClick={() => void confirm()}
          disabled={
            disabled ||
            submitting ||
            effectiveLocationId === undefined ||
            effectiveTimeId === undefined
          }
        >
          Lock it in
        </Button>
      </div>

      {error !== undefined && (
        <InlineAlert tone="error" role="alert">
          <p>{error}</p>
        </InlineAlert>
      )}
    </section>
  );
}
