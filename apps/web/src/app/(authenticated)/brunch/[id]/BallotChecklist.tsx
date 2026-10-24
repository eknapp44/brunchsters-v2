'use client';

import { useEffect, useState, type ReactElement } from 'react';
import { PopIcon } from '@/components/icons/PopIcon';
import { Badge } from '@/components/ui/Badge';
import { InlineAlert } from '@/components/ui/InlineAlert';
import { LocalDateTime } from '@/components/ui/LocalDateTime';
import styles from './detail.module.css';
import { useBallot } from './useBallot';

type LocationOption = {
  readonly id: string;
  readonly placeName: string;
  readonly placeAddress: string;
  readonly placeUrl: string;
  readonly isConfirmed: boolean;
  readonly voteCount: number;
  readonly viewerVoted: boolean;
  readonly voters: readonly string[] | undefined;
  // How full the quiet bar behind the row is, 0 to 100 (barPercent in core): decorative.
  readonly barPercent: number;
};

type TimeOption = {
  readonly id: string;
  readonly scheduledAt: Date;
  readonly isConfirmed: boolean;
  readonly voteCount: number;
  readonly viewerVoted: boolean;
  readonly voters: readonly string[] | undefined;
  readonly barPercent: number;
};

const HELPER = 'Pick any you like — change it anytime before voting closes.';

// The quiet fill behind a voting row, proportional to its votes. It is decoration (the vote count
// is the information), so it is hidden from assistive technology, and a selected row hides it
// (the selection is shown by its border, tick and tint, never competing with a second fill).
function Bar({ percent }: { readonly percent: number }) {
  return <span className={styles.bar} aria-hidden="true" style={{ width: `${percent}%` }} />;
}

// "leading": only ever on the single top option (core decides: a tie or no votes has none).
function LeadingTag({ show }: { readonly show: boolean }) {
  return show ? <Badge tone="accent">leading</Badge> : null;
}

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
  leadingId,
  votable,
}: {
  readonly brunchId: string;
  readonly options: readonly LocationOption[];
  readonly canVote: boolean;
  readonly closed: boolean;
  readonly suggestionsEnabled: boolean;
  readonly leadingId: string | undefined;
  // false in host_decides mode (0 or 1 option) — spec 0005 shows a checklist
  // only "for each kind with more than one option"; a single candidate (or
  // none yet) is display-only, with no checkbox and no vote count shown
  // (votes on a surviving option in that mode stop being displayed, though
  // they're kept in storage — see spec.md's "mode round-trip" note).
  readonly votable: boolean;
}) {
  const { selected, submitting, error, emptyWarning, readOnly, toggle } = useBallot({
    brunchId,
    kind: 'location',
    options,
    canVote,
    closed,
  });

  if (!votable) {
    // Once the one option is confirmed, the card's large result above already says it.
    if (options.length > 0 && options.every((option) => option.isConfirmed)) return null;
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
      {!closed && canVote && <p className={`${styles.helper} ${styles.phoneHidden}`}>{HELPER}</p>}
      {closed && (
        <div className={styles.ballotNote}>
          <InlineAlert>
            <p>Voting is closed.</p>
          </InlineAlert>
        </div>
      )}
      {!closed && !canVote && (
        <div className={styles.ballotNote}>
          <InlineAlert>
            <p>Your RSVP does not allow voting.</p>
          </InlineAlert>
        </div>
      )}

      <ul className={styles.options} role="list">
        {options.map((option) => (
          <li key={option.id}>
            <label className={styles.option}>
              <Bar percent={option.barPercent} />
              <input
                type="checkbox"
                checked={selected.has(option.id)}
                disabled={readOnly || submitting}
                onChange={() => toggle(option.id)}
              />
              <span className={styles.optionBody}>
                <span className={styles.optionHead}>
                  <span className={styles.nameLine}>
                    <a
                      className={styles.name}
                      href={option.placeUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {option.placeName}
                    </a>
                    <LeadingTag show={option.id === leadingId} />
                  </span>
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
  leadingId,
  votable,
}: {
  readonly brunchId: string;
  readonly options: readonly TimeOption[];
  readonly canVote: boolean;
  readonly closed: boolean;
  readonly suggestionsEnabled: boolean;
  readonly leadingId: string | undefined;
  readonly locationTimezone: string | undefined;
  readonly locationName: string | undefined;
  // See LocationBallotChecklist's votable doc — same host_decides rule.
  readonly votable: boolean;
}) {
  const { selected, submitting, error, emptyWarning, readOnly, toggle } = useBallot({
    brunchId,
    kind: 'time',
    options,
    canVote,
    closed,
  });

  // undefined during server render (and briefly on first client render) so
  // the subline only appears once we know the viewer's actual local zone.
  const [viewerTimezone, setViewerTimezone] = useState<string | undefined>(undefined);
  useEffect(() => {
    setViewerTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  const showSubline =
    locationTimezone !== undefined &&
    viewerTimezone !== undefined &&
    locationTimezone !== viewerTimezone;

  function timeText(option: TimeOption): ReactElement {
    return <LocalDateTime date={option.scheduledAt} />;
  }

  // "(at Harbor Bistro's time: ...)": only when the viewer is in another zone than the place
  function zoneNote(option: TimeOption): string | undefined {
    if (!showSubline || locationTimezone === undefined) return undefined;
    // Drawn only after mount (showSubline needs the viewer's zone), so no hydration mismatch.
    // eslint-disable-next-line no-restricted-syntax
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
    // Once the one option is confirmed, the card's large result above already says it.
    if (options.length > 0 && options.every((option) => option.isConfirmed)) return null;
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
      {!closed && canVote && <p className={`${styles.helper} ${styles.phoneHidden}`}>{HELPER}</p>}
      {closed && (
        <div className={styles.ballotNote}>
          <InlineAlert>
            <p>Voting is closed.</p>
          </InlineAlert>
        </div>
      )}
      {!closed && !canVote && (
        <div className={styles.ballotNote}>
          <InlineAlert>
            <p>Your RSVP does not allow voting.</p>
          </InlineAlert>
        </div>
      )}

      <ul className={styles.options} role="list">
        {options.map((option) => (
          <li key={option.id}>
            <label className={styles.option}>
              <Bar percent={option.barPercent} />
              <input
                type="checkbox"
                checked={selected.has(option.id)}
                disabled={readOnly || submitting}
                onChange={() => toggle(option.id)}
              />
              <span className={styles.optionBody}>
                <span className={styles.optionHead}>
                  <span className={styles.nameLine}>
                    <span className={styles.name}>{timeText(option)}</span>
                    <LeadingTag show={option.id === leadingId} />
                  </span>
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
