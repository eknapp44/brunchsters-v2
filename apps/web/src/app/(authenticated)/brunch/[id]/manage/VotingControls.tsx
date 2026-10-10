'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

// Matches nowAsDatetimeLocalValue() in brunch/new/page.tsx — the browser's
// datetime-local input needs the same local-time, no-timezone string shape.
function toDatetimeLocalValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function VotingControls({
  brunchId,
  votingDeadline,
  closed,
  locationsShouldSuggestClosing,
  timesShouldSuggestClosing,
}: {
  readonly brunchId: string;
  readonly votingDeadline: Date | undefined;
  readonly closed: boolean;
  readonly locationsShouldSuggestClosing: boolean;
  readonly timesShouldSuggestClosing: boolean;
}) {
  const router = useRouter();
  // Both start empty/undefined during SSR and on first client render, then
  // get set once mounted — toDatetimeLocalValue uses local-time accessors
  // (getHours/getMonth/...), which during SSR resolve to the *server's*
  // zone (UTC in production), not the viewer's. Computing them eagerly
  // would hydrate-mismatch against the browser's real local zone on every
  // load (architect review, F4) — same reasoning as this page's existing
  // viewerTimezone deferral for the time subline.
  const [deadlineInput, setDeadlineInput] = useState('');
  const [minDeadline, setMinDeadline] = useState<string | undefined>(undefined);
  useEffect(() => {
    setDeadlineInput(votingDeadline !== undefined ? toDatetimeLocalValue(votingDeadline) : '');
    setMinDeadline(toDatetimeLocalValue(new Date()));
  }, [votingDeadline]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function saveDeadline(): Promise<void> {
    setSubmitting(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/v1/brunches/${brunchId}/voting/deadline`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          votingDeadline: deadlineInput === '' ? null : new Date(deadlineInput).toISOString(),
        }),
      });
      if (!response.ok) {
        setError('Failed to update the voting deadline');
        return;
      }
      router.refresh();
    } catch {
      setError('Failed to update the voting deadline');
    } finally {
      setSubmitting(false);
    }
  }

  async function closeVotingNow(): Promise<void> {
    setSubmitting(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/v1/brunches/${brunchId}/voting/close`, {
        method: 'POST',
      });
      if (!response.ok) {
        setError('Failed to close voting');
        return;
      }
      router.refresh();
    } catch {
      setError('Failed to close voting');
    } finally {
      setSubmitting(false);
    }
  }

  if (closed) {
    return (
      <section>
        <h2>Voting</h2>
        <p>Voting is closed.</p>
      </section>
    );
  }

  return (
    <section>
      <h2>Voting</h2>

      {(locationsShouldSuggestClosing || timesShouldSuggestClosing) && (
        <p>Most eligible attendees have voted — you can close voting now if you&apos;re ready.</p>
      )}

      <label>
        Voting closes by
        <input
          type="datetime-local"
          value={deadlineInput}
          min={minDeadline}
          disabled={submitting}
          onChange={(event) => setDeadlineInput(event.target.value)}
        />
      </label>
      <button type="button" onClick={() => void saveDeadline()} disabled={submitting}>
        Save deadline
      </button>

      <button type="button" onClick={() => void closeVotingNow()} disabled={submitting}>
        Close voting now
      </button>

      {error !== undefined && <p role="alert">{error}</p>}
    </section>
  );
}
