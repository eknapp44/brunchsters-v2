'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { DateTimeInput } from '@/components/ui/DateTimeInput';
import { Field } from '@/components/ui/Field';
import { InlineAlert } from '@/components/ui/InlineAlert';
import detail from '../detail.module.css';

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
  canClose,
}: {
  readonly brunchId: string;
  readonly votingDeadline: Date | undefined;
  readonly closed: boolean;
  readonly locationsShouldSuggestClosing: boolean;
  readonly timesShouldSuggestClosing: boolean;
  // False while the brunch is a draft: there is no voting to close until someone is invited.
  readonly canClose: boolean;
}) {
  const router = useRouter();
  // The saved deadline and the minimum start empty during SSR and on first client render, then
  // are set once mounted — toDatetimeLocalValue uses local-time accessors
  // (getHours/getMonth/...), which during SSR resolve to the *server's*
  // zone (UTC in production), not the viewer's. Computing them eagerly
  // would hydrate-mismatch against the browser's real local zone on every
  // load (architect review, F4) — same reasoning as this page's existing
  // viewerTimezone deferral for the time subline.
  //
  // The field itself is deliberately uncontrolled. The form is on screen, and usable, before
  // React has taken it over, and React resets a controlled field to its state when it does,
  // which wiped a deadline typed in that gap (journey H8) and made Save clear the saved
  // deadline instead of setting one. An uncontrolled field keeps what the browser holds; the
  // saved deadline is written into it after mount, and only into an empty field.
  const deadlineRef = useRef<HTMLInputElement>(null);
  const [minDeadline, setMinDeadline] = useState<string | undefined>(undefined);
  useEffect(() => {
    const field = deadlineRef.current;
    if (field !== null && field.value === '' && votingDeadline !== undefined) {
      field.value = toDatetimeLocalValue(votingDeadline);
    }
    setMinDeadline(toDatetimeLocalValue(new Date()));
  }, [votingDeadline]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function saveDeadline(): Promise<void> {
    const deadlineInput = deadlineRef.current?.value ?? '';
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
      <section className={detail.panel}>
        <h2>Voting</h2>
        <p>Voting is closed.</p>
      </section>
    );
  }

  return (
    <section className={detail.panel}>
      <h2>Voting</h2>

      {(locationsShouldSuggestClosing || timesShouldSuggestClosing) && (
        <InlineAlert>
          <p>Most of the crew has voted — close voting now if you&apos;re ready.</p>
        </InlineAlert>
      )}

      <div className={detail.addRow}>
        <Field label="Voting closes by">
          <DateTimeInput
            ref={deadlineRef}
            placeholderText="Pick a deadline"
            min={minDeadline}
            disabled={submitting}
          />
        </Field>
        <Button type="button" onClick={() => void saveDeadline()} disabled={submitting}>
          Save deadline
        </Button>
      </div>

      <div className={detail.choices}>
        <Button
          type="button"
          onClick={() => void closeVotingNow()}
          disabled={submitting || !canClose}
        >
          Close voting
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
