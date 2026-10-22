'use client';

import type { PlaceDetails } from '@brunchsters/core';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PopIcon } from '@/components/icons/PopIcon';
import { Button } from '@/components/ui/Button';
import { InlineAlert } from '@/components/ui/InlineAlert';
import { PlaceSearchInput } from '../../PlaceSearchInput';
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

export function OptionManager({
  brunchId,
  locations,
  times,
  disabled,
}: {
  readonly brunchId: string;
  readonly locations: readonly LocationOption[];
  readonly times: readonly TimeOption[];
  // True while the brunch is a draft: every change here needs an active brunch.
  readonly disabled: boolean;
}) {
  const router = useRouter();
  const [timeInput, setTimeInput] = useState('');
  const [pendingId, setPendingId] = useState<string | undefined>(undefined);
  // Separate from pendingId (which tracks a specific remove-by-id) — guards
  // the two add paths against a double-click firing two POSTs, since
  // nothing else disabled those controls while a request was in flight
  // (architect review, nit under F10/F12).
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function addLocation(details: PlaceDetails): Promise<void> {
    if (adding) return;

    setAdding(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/v1/brunches/${brunchId}/locations`, {
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
        setError('Failed to add location');
        return;
      }
      router.refresh();
    } catch {
      setError('Failed to add location');
    } finally {
      setAdding(false);
    }
  }

  async function addTime(): Promise<void> {
    if (timeInput === '' || adding) return;

    setAdding(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/v1/brunches/${brunchId}/times`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledAt: new Date(timeInput).toISOString() }),
      });
      if (!response.ok) {
        setError('Failed to add time');
        return;
      }
      setTimeInput('');
      router.refresh();
    } catch {
      setError('Failed to add time');
    } finally {
      setAdding(false);
    }
  }

  async function removeLocation(locationId: string): Promise<void> {
    if (pendingId !== undefined) return;

    setPendingId(locationId);
    setError(undefined);
    try {
      const response = await fetch(`/api/v1/brunches/${brunchId}/locations/${locationId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        setError('Failed to remove location');
        return;
      }
      router.refresh();
    } catch {
      setError('Failed to remove location');
    } finally {
      setPendingId(undefined);
    }
  }

  async function removeTime(timeId: string): Promise<void> {
    if (pendingId !== undefined) return;

    setPendingId(timeId);
    setError(undefined);
    try {
      const response = await fetch(`/api/v1/brunches/${brunchId}/times/${timeId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        setError('Failed to remove time');
        return;
      }
      router.refresh();
    } catch {
      setError('Failed to remove time');
    } finally {
      setPendingId(undefined);
    }
  }

  return (
    <section className={detail.panel}>
      <div className={styles.group}>
        <h2>Locations</h2>
        <ul className={detail.rows} role="list">
          {locations.map((location) => (
            <li key={location.id} className={detail.row}>
              <span className={detail.rowMain}>
                <PopIcon name="pin" size={22} />
                <span className={detail.rowText}>
                  <span className={detail.name}>{location.placeName}</span>{' '}
                  <span className={[detail.detail, detail.votes].join(' ')}>
                    ({voteCountLabel(location.voteCount)})
                  </span>
                  <span className={detail.address}>{location.placeAddress}</span>
                </span>
              </span>
              <Button
                type="button"
                size="sm"
                variant="danger"
                onClick={() => void removeLocation(location.id)}
                disabled={disabled || pendingId === location.id}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
        <PlaceSearchInput
          onSelect={(details) => void addLocation(details)}
          onError={() => setError('Failed to add location')}
          disabled={disabled || adding}
        />
      </div>

      <div className={styles.group}>
        <h2>Times</h2>
        <ul className={detail.rows} role="list">
          {times.map((time) => (
            <li key={time.id} className={detail.row}>
              <span className={detail.rowMain}>
                <PopIcon name="clock" size={22} />
                <span className={detail.rowText}>
                  {time.scheduledAt.toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}{' '}
                  <span className={[detail.detail, detail.votes].join(' ')}>
                    ({voteCountLabel(time.voteCount)})
                  </span>
                </span>
              </span>
              <Button
                type="button"
                size="sm"
                variant="danger"
                onClick={() => void removeTime(time.id)}
                disabled={disabled || pendingId === time.id}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
        <div className={detail.addRow}>
          <input
            type="datetime-local"
            aria-label="Date and time to add"
            value={timeInput}
            disabled={disabled || adding}
            onChange={(event) => setTimeInput(event.target.value)}
          />
          <Button type="button" onClick={() => void addTime()} disabled={disabled || adding}>
            Add Time
          </Button>
        </div>
      </div>

      {error !== undefined && (
        <InlineAlert tone="error" role="alert">
          <p>{error}</p>
        </InlineAlert>
      )}
    </section>
  );
}
