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

// Remove is one tap with nothing to fix, so a failure is a toast and the row is as it was. One
// request state per option (spec 0014): removing two options never waits on one request.
function RemoveButton({
  brunchId,
  kind,
  optionId,
  disabled,
}: {
  readonly brunchId: string;
  readonly kind: 'locations' | 'times';
  readonly optionId: string;
  readonly disabled: boolean;
}) {
  const router = useRouter();
  const removing = useMutation(`option-remove:${kind}:${optionId}`);

  async function remove(): Promise<void> {
    if (removing.pending) return;
    const result = await removing.run({
      request: { url: `/api/v1/brunches/${brunchId}/${kind}/${optionId}`, method: 'DELETE' },
      failure: 'toast',
    });
    if (result.ok || (result.failure !== undefined && pageIsStale(result.failure.code))) {
      router.refresh();
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="danger"
      onClick={() => void remove()}
      disabled={disabled}
      aria-disabled={removing.pending ? true : undefined}
    >
      Remove
    </Button>
  );
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
  // The place lookup itself failed (before anything was added): its words, kept beside the search.
  const [lookupError, setLookupError] = useState<string | undefined>(undefined);
  const addingLocation = useMutation(`option-add:locations:${brunchId}`);
  const addingTime = useMutation(`option-add:times:${brunchId}`);
  // Guards the two add paths against a double tap firing two requests.
  const adding = addingLocation.pending || addingTime.pending;

  // Adding has a field the person typed into, so a failure stays inline beside it.
  async function addLocation(details: PlaceDetails): Promise<void> {
    if (adding) return;
    setLookupError(undefined);
    const result = await addingLocation.run({
      request: {
        url: `/api/v1/brunches/${brunchId}/locations`,
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

  async function addTime(): Promise<void> {
    if (timeInput === '' || adding) return;
    setLookupError(undefined);
    const result = await addingTime.run({
      request: {
        url: `/api/v1/brunches/${brunchId}/times`,
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

  const addError = lookupError ?? addingLocation.failure?.text ?? addingTime.failure?.text;

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
              <RemoveButton
                brunchId={brunchId}
                kind="locations"
                optionId={location.id}
                disabled={disabled}
              />
            </li>
          ))}
        </ul>
        <PlaceSearchInput
          onSelect={(details) => void addLocation(details)}
          onError={() => setLookupError(errorCopy({ code: 'unavailable' }))}
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
                  <LocalDateTime date={time.scheduledAt} />{' '}
                  <span className={[detail.detail, detail.votes].join(' ')}>
                    ({voteCountLabel(time.voteCount)})
                  </span>
                </span>
              </span>
              <RemoveButton
                brunchId={brunchId}
                kind="times"
                optionId={time.id}
                disabled={disabled}
              />
            </li>
          ))}
        </ul>
        <div className={detail.addRow}>
          <DateTimeInput
            placeholderText="Add a time"
            aria-label="Date and time to add"
            value={timeInput}
            disabled={disabled || adding}
            onChange={(event) => setTimeInput(event.target.value)}
          />
          <Button
            type="button"
            onClick={() => void addTime()}
            disabled={disabled}
            aria-disabled={adding ? true : undefined}
          >
            Add Time
          </Button>
        </div>
      </div>

      {addError !== undefined && (
        <InlineAlert tone="error" role="alert">
          <p>{addError}</p>
        </InlineAlert>
      )}
    </section>
  );
}
