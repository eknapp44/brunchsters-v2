'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const RESPONSES = ['yes', 'no', 'maybe'] as const;
type RsvpResponse = (typeof RESPONSES)[number];

export function RsvpControl({
  brunchId,
  currentStatus,
}: {
  readonly brunchId: string;
  readonly currentStatus: string | undefined;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function respond(response: RsvpResponse): Promise<void> {
    setSubmitting(true);
    setError(undefined);
    try {
      const result = await fetch(`/api/v1/brunches/${brunchId}/rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response }),
      });
      if (!result.ok) {
        setError('Failed to update RSVP');
        return;
      }
      router.refresh();
    } catch {
      setError('Failed to update RSVP');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section>
      <h2>Your RSVP</h2>
      <p>Current: {currentStatus ?? 'no response yet'}</p>
      {RESPONSES.map((response) => (
        <button
          key={response}
          type="button"
          disabled={submitting}
          onClick={() => void respond(response)}
        >
          {response}
        </button>
      ))}
      {error !== undefined && <p role="alert">{error}</p>}
    </section>
  );
}
