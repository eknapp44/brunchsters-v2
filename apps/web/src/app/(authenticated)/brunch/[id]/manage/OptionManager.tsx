'use client';

import type { PlaceDetails } from '@brunchsters/core';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PlaceSearchInput } from '../../PlaceSearchInput';

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
}: {
  readonly brunchId: string;
  readonly locations: readonly LocationOption[];
  readonly times: readonly TimeOption[];
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
    <section>
      <h2>Locations</h2>
      <ul>
        {locations.map((location) => (
          <li key={location.id}>
            {location.placeName} — {location.placeAddress} ({voteCountLabel(location.voteCount)})
            <button
              type="button"
              onClick={() => void removeLocation(location.id)}
              disabled={pendingId === location.id}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <PlaceSearchInput
        onSelect={(details) => void addLocation(details)}
        onError={() => setError('Failed to add location')}
        disabled={adding}
      />

      <h2>Times</h2>
      <ul>
        {times.map((time) => (
          <li key={time.id}>
            {time.scheduledAt.toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}{' '}
            ({voteCountLabel(time.voteCount)})
            <button
              type="button"
              onClick={() => void removeTime(time.id)}
              disabled={pendingId === time.id}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <input
        type="datetime-local"
        aria-label="Date and time to add"
        value={timeInput}
        disabled={adding}
        onChange={(event) => setTimeInput(event.target.value)}
      />
      <button type="button" onClick={() => void addTime()} disabled={adding}>
        Add Time
      </button>

      {error !== undefined && <p role="alert">{error}</p>}
    </section>
  );
}
