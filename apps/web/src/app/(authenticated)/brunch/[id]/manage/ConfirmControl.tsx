'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { InlineAlert } from '@/components/ui/InlineAlert';
import { LocalDateTime } from '@/components/ui/LocalDateTime';
import { pageIsStale } from '@/lib/errorCopy';
import { useMutation } from '@/store/useMutation';
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
  const confirming = useMutation(`confirm:${brunchId}`);
  const submitting = confirming.pending;

  // locationId/timeId only ever get set once (on mount) or by a radio click —
  // if the option they point at was removed by OptionManager in the same
  // session (a router.refresh(), not a remount), fall back to the current
  // list's own leader rather than submitting a confirm for a vanished option.
  const effectiveLocationId = locations.some((location) => location.id === locationId)
    ? locationId
    : leaderId(locations);
  const effectiveTimeId = times.some((time) => time.id === timeId) ? timeId : leaderId(times);

  // Locking it in has radios the person chose, so a failure stays inline beside them. A failure that
  // means the brunch moved on (already locked, an option removed, called off) asks the page again.
  async function confirm(): Promise<void> {
    if (effectiveLocationId === undefined || effectiveTimeId === undefined) return;

    const result = await confirming.run({
      request: {
        url: `/api/v1/brunches/${brunchId}/confirm`,
        method: 'POST',
        body: { locationId: effectiveLocationId, timeId: effectiveTimeId },
      },
      failure: 'inline',
    });
    if (result.ok || (result.failure !== undefined && pageIsStale(result.failure.code))) {
      router.refresh();
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
                <LocalDateTime date={time.scheduledAt} />
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
          disabled={disabled || effectiveLocationId === undefined || effectiveTimeId === undefined}
          aria-disabled={submitting ? true : undefined}
        >
          Lock it in
        </Button>
      </div>

      {confirming.failure !== undefined && (
        <InlineAlert tone="error" role="alert">
          <p>{confirming.failure.text}</p>
        </InlineAlert>
      )}
    </section>
  );
}
