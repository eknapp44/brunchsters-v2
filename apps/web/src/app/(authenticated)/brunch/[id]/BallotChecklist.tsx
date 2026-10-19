'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PopIcon } from '@/components/icons/PopIcon';
import { Badge } from '@/components/ui/Badge';
import { InlineAlert } from '@/components/ui/InlineAlert';
import styles from './detail.module.css';

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
  return <span className={styles.voters}>voted by {voters.join(', ')}</span>;
}

// The marker keeps its "— Confirmed" text: the brunch's own status badge reads exactly
// "Confirmed", and a second element with that exact text would make the page ambiguous.
function ConfirmedMark() {
  return <strong className={styles.confirmed}> — Confirmed</strong>;
}

function EmptyBallotWarning({ suggestionsEnabled }: { readonly suggestionsEnabled: boolean }) {
  return (
    <InlineAlert role="alert">
      <p>
        Unchecking your last option withdraws your vote — it won&apos;t be saved until you check at
        least one option again.
        {suggestionsEnabled && ' If none of these work for you, suggest a different one below.'}
      </p>
    </InlineAlert>
  );
}

function BallotMessages({
  emptyWarning,
  suggestionsEnabled,
  error,
}: {
  readonly emptyWarning: boolean;
  readonly suggestionsEnabled: boolean;
  readonly error: string | undefined;
}) {
  return (
    <>
      {emptyWarning && <EmptyBallotWarning suggestionsEnabled={suggestionsEnabled} />}
      {error !== undefined && (
        <InlineAlert tone="error" role="alert">
          <p>{error}</p>
        </InlineAlert>
      )}
    </>
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

  // selected is seeded once on mount and never re-derived from props after —
  // router.refresh() re-renders this client component with new options but
  // does not remount it. Filtering against the current option ids on every
  // render means a stale id (e.g. the host removed the option this voter had
  // checked) silently drops out here instead of being resubmitted forever
  // and 404ing as unknown_option on every subsequent vote (architect review,
  // F2). A plain useState wouldn't notice the props changed; this does, every
  // render, without needing a key or an effect.
  const validOptionIds = new Set(options.map((option) => option.id));
  const effectiveSelected = new Set(Array.from(selected).filter((id) => validOptionIds.has(id)));

  async function submit(
    nextSelected: ReadonlySet<string>,
    previous: ReadonlySet<string>,
  ): Promise<void> {
    setSubmitting(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/v1/brunches/${brunchId}/votes/locations`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionIds: Array.from(nextSelected) }),
      });
      if (!response.ok) {
        // Roll back the optimistic check — otherwise a failed save (e.g.
        // voting closed mid-click) leaves a checked box on screen for a vote
        // that was never actually recorded (architect review, F2).
        setSelected(previous);
        setError('Failed to save your vote');
        return;
      }
      router.refresh();
    } catch {
      setSelected(previous);
      setError('Failed to save your vote');
    } finally {
      setSubmitting(false);
    }
  }

  function toggle(optionId: string): void {
    if (readOnly || submitting) return;

    const previous = effectiveSelected;
    const next = new Set(effectiveSelected);
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
    void submit(next, previous);
  }

  if (!votable) {
    return (
      <ul className={styles.rows} role="list">
        {options.length === 0 && (
          <li className={`${styles.row} ${styles.muted}`}>No locations yet.</li>
        )}
        {options.map((option) => (
          <li key={option.id} className={styles.row}>
            <span className={styles.rowMain}>
              <PopIcon name="pin" size={22} />
              <span className={styles.rowText}>
                <a href={option.placeUrl} target="_blank" rel="noreferrer">
                  {option.placeName}
                </a>{' '}
                <span className={styles.detail}>— {option.placeAddress}</span>
                {option.isConfirmed && <ConfirmedMark />}
              </span>
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
      {closed && (
        <InlineAlert>
          <p>Voting is closed.</p>
        </InlineAlert>
      )}
      {!closed && !canVote && (
        <InlineAlert>
          <p>Your RSVP does not allow voting.</p>
        </InlineAlert>
      )}

      <ul className={styles.options} role="list">
        {options.map((option) => (
          <li key={option.id}>
            <label className={styles.option}>
              <input
                type="checkbox"
                checked={effectiveSelected.has(option.id)}
                disabled={readOnly || submitting}
                onChange={() => toggle(option.id)}
              />
              <span className={styles.optionBody}>
                <span className={styles.optionHead}>
                  <a
                    className={styles.name}
                    href={option.placeUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {option.placeName}
                  </a>
                  <Badge>{voteCountLabel(option.voteCount)}</Badge>
                </span>
                <span className={styles.detail}>{option.placeAddress}</span>
                <VoterNames voters={option.voters} />
                {option.isConfirmed && <ConfirmedMark />}
              </span>
            </label>
          </li>
        ))}
      </ul>

      <BallotMessages
        emptyWarning={emptyWarning}
        suggestionsEnabled={suggestionsEnabled}
        error={error}
      />
    </>
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

  // See LocationBallotChecklist's identical derivation for why — selected
  // is seeded once on mount and never re-derived from props, so a stale id
  // (e.g. the host removed the time this voter had checked) must be
  // filtered out here on every render, not left to 404 forever (architect
  // review, F2).
  const validOptionIds = new Set(options.map((option) => option.id));
  const effectiveSelected = new Set(Array.from(selected).filter((id) => validOptionIds.has(id)));

  // undefined during server render (and briefly on first client render) so
  // the subline only appears once we know the viewer's actual local zone.
  const [viewerTimezone, setViewerTimezone] = useState<string | undefined>(undefined);
  useEffect(() => {
    setViewerTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  async function submit(
    nextSelected: ReadonlySet<string>,
    previous: ReadonlySet<string>,
  ): Promise<void> {
    setSubmitting(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/v1/brunches/${brunchId}/votes/times`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionIds: Array.from(nextSelected) }),
      });
      if (!response.ok) {
        // See LocationBallotChecklist's identical rollback — a failed save
        // must not leave a phantom checked box on screen (architect review, F2).
        setSelected(previous);
        setError('Failed to save your vote');
        return;
      }
      router.refresh();
    } catch {
      setSelected(previous);
      setError('Failed to save your vote');
    } finally {
      setSubmitting(false);
    }
  }

  function toggle(optionId: string): void {
    if (readOnly || submitting) return;

    const previous = effectiveSelected;
    const next = new Set(effectiveSelected);
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
    void submit(next, previous);
  }

  const showSubline =
    locationTimezone !== undefined &&
    viewerTimezone !== undefined &&
    locationTimezone !== viewerTimezone;

  function timeText(option: TimeOption): string {
    return option.scheduledAt.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  // "(at Harbor Bistro's time: ...)": only when the viewer is in another zone than the place
  function zoneNote(option: TimeOption): string | undefined {
    if (!showSubline || locationTimezone === undefined) return undefined;
    const there = option.scheduledAt.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: locationTimezone,
    });
    return `(at ${locationName ?? 'the location'}'s time: ${there})`;
  }

  function timeLabel(option: TimeOption) {
    const note = zoneNote(option);
    return (
      <>
        {timeText(option)}
        {note !== undefined && <span className={styles.detail}> {note}</span>}
      </>
    );
  }
  if (!votable) {
    return (
      <ul className={styles.rows} role="list">
        {options.length === 0 && <li className={`${styles.row} ${styles.muted}`}>No times yet.</li>}
        {options.map((option) => (
          <li key={option.id} className={styles.row}>
            <span className={styles.rowMain}>
              <PopIcon name="clock" size={22} />
              <span className={styles.rowText}>
                {timeLabel(option)}
                {option.isConfirmed && <ConfirmedMark />}
              </span>
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
      {closed && (
        <InlineAlert>
          <p>Voting is closed.</p>
        </InlineAlert>
      )}
      {!closed && !canVote && (
        <InlineAlert>
          <p>Your RSVP does not allow voting.</p>
        </InlineAlert>
      )}

      <ul className={styles.options} role="list">
        {options.map((option) => (
          <li key={option.id}>
            <label className={styles.option}>
              <input
                type="checkbox"
                checked={effectiveSelected.has(option.id)}
                disabled={readOnly || submitting}
                onChange={() => toggle(option.id)}
              />
              <span className={styles.optionBody}>
                <span className={styles.optionHead}>
                  <span className={styles.name}>{timeText(option)}</span>
                  <Badge>{voteCountLabel(option.voteCount)}</Badge>
                </span>
                {zoneNote(option) !== undefined && (
                  <span className={styles.detail}>{zoneNote(option)}</span>
                )}
                <VoterNames voters={option.voters} />
                {option.isConfirmed && <ConfirmedMark />}
              </span>
            </label>
          </li>
        ))}
      </ul>

      <BallotMessages
        emptyWarning={emptyWarning}
        suggestionsEnabled={suggestionsEnabled}
        error={error}
      />
    </>
  );
}
