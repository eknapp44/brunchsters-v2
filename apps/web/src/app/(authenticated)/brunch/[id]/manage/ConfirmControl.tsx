'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

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
}: {
  readonly brunchId: string;
  readonly locations: readonly LocationOption[];
  readonly times: readonly TimeOption[];
  readonly noOneElseAccepted: boolean;
}) {
  const router = useRouter();
  const [locationId, setLocationId] = useState<string | undefined>(() => leaderId(locations));
  const [timeId, setTimeId] = useState<string | undefined>(() => leaderId(times));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function confirm(): Promise<void> {
    if (locationId === undefined || timeId === undefined) return;

    setSubmitting(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/v1/brunches/${brunchId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId, timeId }),
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
    <section>
      <h2>Confirm</h2>

      {noOneElseAccepted && <p>No one else has accepted yet — you can still confirm.</p>}

      <fieldset>
        <legend>Location</legend>
        {locations.map((location) => (
          <label key={location.id}>
            <input
              type="radio"
              name="confirm-location"
              checked={locationId === location.id}
              disabled={submitting}
              onChange={() => setLocationId(location.id)}
            />
            {location.placeName} — {location.placeAddress} ({voteCountLabel(location.voteCount)})
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>Time</legend>
        {times.map((time) => (
          <label key={time.id}>
            <input
              type="radio"
              name="confirm-time"
              checked={timeId === time.id}
              disabled={submitting}
              onChange={() => setTimeId(time.id)}
            />
            {time.scheduledAt.toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}{' '}
            ({voteCountLabel(time.voteCount)})
          </label>
        ))}
      </fieldset>

      <button
        type="button"
        onClick={() => void confirm()}
        disabled={submitting || locationId === undefined || timeId === undefined}
      >
        Confirm brunch
      </button>

      {error !== undefined && <p role="alert">{error}</p>}
    </section>
  );
}
