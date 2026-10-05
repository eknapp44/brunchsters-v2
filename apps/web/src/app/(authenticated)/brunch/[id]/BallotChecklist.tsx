'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type LocationOption = {
  readonly id: string;
  readonly placeName: string;
  readonly placeAddress: string;
  readonly placeUrl: string;
  readonly isConfirmed: boolean;
  readonly voteCount: number;
  readonly viewerVoted: boolean;
  readonly voters: readonly string[] | undefined;
};

type TimeOption = {
  readonly id: string;
  readonly scheduledAt: Date;
  readonly isConfirmed: boolean;
  readonly voteCount: number;
  readonly viewerVoted: boolean;
  readonly voters: readonly string[] | undefined;
};

function voteCountLabel(voteCount: number): string {
  return `${voteCount} vote${voteCount === 1 ? '' : 's'}`;
}

// voters is only populated for the host (PLANNING §17) — everyone else gets
// counts only, so rendering it when present needs no separate isHost prop.
function VoterNames({ voters }: { readonly voters: readonly string[] | undefined }) {
  if (voters === undefined || voters.length === 0) return null;
  return <span> — voted by {voters.join(', ')}</span>;
}

function EmptyBallotWarning({ suggestionsEnabled }: { readonly suggestionsEnabled: boolean }) {
  return (
    <p role="alert">
      Unchecking your last option withdraws your vote — it won&apos;t be saved until you check at
      least one option again.
      {suggestionsEnabled && ' If none of these work for you, suggest a different one below.'}
    </p>
  );
}

export function LocationBallotChecklist({
  brunchId,
  options,
  canVote,
  closed,
  suggestionsEnabled,
  votable,
}: {
  readonly brunchId: string;
  readonly options: readonly LocationOption[];
  readonly canVote: boolean;
  readonly closed: boolean;
  readonly suggestionsEnabled: boolean;
  // false in host_decides mode (0 or 1 option) — spec 0005 shows a checklist
  // only "for each kind with more than one option"; a single candidate (or
  // none yet) is display-only, with no checkbox and no vote count shown
  // (votes on a surviving option in that mode stop being displayed, though
  // they're kept in storage — see spec.md's "mode round-trip" note).
  readonly votable: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    new Set(options.filter((option) => option.viewerVoted).map((option) => option.id)),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [emptyWarning, setEmptyWarning] = useState(false);

  const readOnly = closed || !canVote;

  async function submit(nextSelected: ReadonlySet<string>): Promise<void> {
    setSubmitting(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/v1/brunches/${brunchId}/votes/locations`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionIds: Array.from(nextSelected) }),
      });
      if (!response.ok) {
        setError('Failed to save your vote');
        return;
      }
      router.refresh();
    } catch {
      setError('Failed to save your vote');
    } finally {
      setSubmitting(false);
    }
  }

  function toggle(optionId: string): void {
    if (readOnly || submitting) return;

    const next = new Set(selected);
    if (next.has(optionId)) {
      next.delete(optionId);
    } else {
      next.add(optionId);
    }

    setSelected(next);
    if (next.size === 0) {
      setEmptyWarning(true);
      return;
    }
    setEmptyWarning(false);
    void submit(next);
  }

  if (!votable) {
    return (
      <ul>
        {options.length === 0 && <li>No locations yet.</li>}
        {options.map((option) => (
          <li key={option.id}>
            <a href={option.placeUrl} target="_blank" rel="noreferrer">
              {option.placeName}
            </a>{' '}
            — {option.placeAddress}
            {option.isConfirmed && <strong> — Confirmed</strong>}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div>
      {closed && <p>Voting is closed.</p>}
      {!closed && !canVote && <p>Your RSVP does not allow voting.</p>}

      <ul>
        {options.map((option) => (
          <li key={option.id}>
            <label>
              <input
                type="checkbox"
                checked={selected.has(option.id)}
                disabled={readOnly || submitting}
                onChange={() => toggle(option.id)}
              />
              <a href={option.placeUrl} target="_blank" rel="noreferrer">
                {option.placeName}
              </a>{' '}
              — {option.placeAddress} ({voteCountLabel(option.voteCount)})
              <VoterNames voters={option.voters} />
              {option.isConfirmed && <strong> — Confirmed</strong>}
            </label>
          </li>
        ))}
      </ul>

      {emptyWarning && <EmptyBallotWarning suggestionsEnabled={suggestionsEnabled} />}
      {error !== undefined && <p role="alert">{error}</p>}
    </div>
  );
}

export function TimeBallotChecklist({
  brunchId,
  options,
  canVote,
  closed,
  suggestionsEnabled,
  locationTimezone,
  locationName,
  votable,
}: {
  readonly brunchId: string;
  readonly options: readonly TimeOption[];
  readonly canVote: boolean;
  readonly closed: boolean;
  readonly suggestionsEnabled: boolean;
  readonly locationTimezone: string | undefined;
  readonly locationName: string | undefined;
  // See LocationBallotChecklist's votable doc — same host_decides rule.
  readonly votable: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    new Set(options.filter((option) => option.viewerVoted).map((option) => option.id)),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [emptyWarning, setEmptyWarning] = useState(false);

  const readOnly = closed || !canVote;

  // undefined during server render (and briefly on first client render) so
  // the subline only appears once we know the viewer's actual local zone.
  const [viewerTimezone, setViewerTimezone] = useState<string | undefined>(undefined);
  useEffect(() => {
    setViewerTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  async function submit(nextSelected: ReadonlySet<string>): Promise<void> {
    setSubmitting(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/v1/brunches/${brunchId}/votes/times`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionIds: Array.from(nextSelected) }),
      });
      if (!response.ok) {
        setError('Failed to save your vote');
        return;
      }
      router.refresh();
    } catch {
      setError('Failed to save your vote');
    } finally {
      setSubmitting(false);
    }
  }

  function toggle(optionId: string): void {
    if (readOnly || submitting) return;

    const next = new Set(selected);
    if (next.has(optionId)) {
      next.delete(optionId);
    } else {
      next.add(optionId);
    }

    setSelected(next);
    if (next.size === 0) {
      setEmptyWarning(true);
      return;
    }
    setEmptyWarning(false);
    void submit(next);
  }

  const showSubline =
    locationTimezone !== undefined &&
    viewerTimezone !== undefined &&
    locationTimezone !== viewerTimezone;

  function timeLabel(option: TimeOption) {
    return (
      <>
        {option.scheduledAt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
        {showSubline && locationTimezone !== undefined && (
          <span>
            {' '}
            (at {locationName ?? 'the location'}&apos;s time:{' '}
            {option.scheduledAt.toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
              timeZone: locationTimezone,
            })}
            )
          </span>
        )}
      </>
    );
  }

  if (!votable) {
    return (
      <ul>
        {options.length === 0 && <li>No times yet.</li>}
        {options.map((option) => (
          <li key={option.id}>
            {timeLabel(option)}
            {option.isConfirmed && <strong> — Confirmed</strong>}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div>
      {closed && <p>Voting is closed.</p>}
      {!closed && !canVote && <p>Your RSVP does not allow voting.</p>}

      <ul>
        {options.map((option) => (
          <li key={option.id}>
            <label>
              <input
                type="checkbox"
                checked={selected.has(option.id)}
                disabled={readOnly || submitting}
                onChange={() => toggle(option.id)}
              />
              {timeLabel(option)} ({voteCountLabel(option.voteCount)})
              <VoterNames voters={option.voters} />
              {option.isConfirmed && <strong> — Confirmed</strong>}
            </label>
          </li>
        ))}
      </ul>

      {emptyWarning && <EmptyBallotWarning suggestionsEnabled={suggestionsEnabled} />}
      {error !== undefined && <p role="alert">{error}</p>}
    </div>
  );
}
